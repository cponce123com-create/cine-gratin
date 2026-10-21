import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../backend/src/app";
import { pool } from "../backend/src/lib/db";
import { getConfig } from "../backend/src/lib/config";

/**
 * CSRF and session hardening.
 *
 * The session travels in a cookie, so every state-changing request must
 * prove that it comes from the application: the `X-CSRF-Token` header (bound
 * to the session) and an allowed origin.
 */
interface Session {
  cookie: string;
  csrfToken: string;
  token: string;
}

async function login(): Promise<Session> {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Origin", "http://localhost:5173")
    .send({ username: "admin", password: process.env["TEST_ADMIN_PASSWORD"] ?? "Test-Admin-2026!" });

  const setCookie = response.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = (setCookie ?? []).find((value) => value.startsWith("cg_session="));
  if (!cookie) throw new Error("no se recibió la cookie de sesión");

  return {
    cookie: cookie.split(";")[0],
    csrfToken: response.body.csrfToken as string,
    token: (cookie.split(";")[0] ?? "").split("=")[1] ?? "",
  };
}

describe("protección CSRF", () => {
  let session: Session;

  beforeAll(async () => {
    session = await login();
  });

  afterAll(async () => {
    await pool.end().catch(() => undefined);
  });

  it("el inicio de sesión entrega un token CSRF", () => {
    expect(session.csrfToken).toBeTypeOf("string");
    expect(session.csrfToken.length).toBeGreaterThanOrEqual(32);
  });

  it("rechaza una petición mutante con sesión pero sin token CSRF", async () => {
    const response = await request(app)
      .post("/api/admin/movies")
      .set("Cookie", session.cookie)
      .send({ title: "Película sin token CSRF" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("csrf_token_missing");
  });

  it("rechaza una petición mutante con un token CSRF inválido", async () => {
    const response = await request(app)
      .post("/api/admin/movies")
      .set("Cookie", session.cookie)
      .set("X-CSRF-Token", "a".repeat(64))
      .send({ title: "Película con token falso" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("csrf_token_invalid");
  });

  it("acepta una petición mutante con sesión y token CSRF válido", async () => {
    const response = await request(app)
      .post("/api/admin/movies")
      .set("Cookie", session.cookie)
      .set("X-CSRF-Token", session.csrfToken)
      .set("Origin", "http://localhost:5173")
      .send({ title: "Película con token válido", year: 2024 });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Película con token válido");

    await request(app)
      .delete(`/api/admin/movies/${encodeURIComponent(response.body.id)}`)
      .set("Cookie", session.cookie)
      .set("X-CSRF-Token", session.csrfToken);
  });

  it("rechaza el origen no permitido aunque el token CSRF sea válido", async () => {
    const response = await request(app)
      .post("/api/admin/movies")
      .set("Cookie", session.cookie)
      .set("X-CSRF-Token", session.csrfToken)
      .set("Origin", "https://sitio-malicioso.example")
      .send({ title: "Película desde un origen no permitido" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("csrf_origin_rejected");
  });

  it("no acepta el token de sesión por query string", async () => {
    const response = await request(app).get(`/api/admin/stats?token=${encodeURIComponent(session.token)}`);

    expect(response.status).toBe(401);
  });

  it("no exige token CSRF en las peticiones de solo lectura", async () => {
    const response = await request(app).get("/api/admin/stats").set("Cookie", session.cookie);

    expect(response.status).toBe(200);
  });

  it("el inicio y el cierre de sesión siguen funcionando", async () => {
    const fresh = await login();
    expect(fresh.cookie).toContain("cg_session=");

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", fresh.cookie)
      .set("X-CSRF-Token", fresh.csrfToken);

    expect(logout.status).toBe(200);

    // Tras cerrar sesión, la cookie ya no autoriza.
    const after = await request(app).get("/api/admin/stats").set("Cookie", fresh.cookie);
    expect(after.status).toBe(401);
  });

  it("las peticiones con token Bearer no necesitan token CSRF", async () => {
    // La autenticación por cabecera no usa credenciales ambientales: el
    // navegador no la envía sola, así que no hay riesgo de CSRF.
    const response = await request(app)
      .get("/api/admin/stats")
      .set("Authorization", `Bearer ${session.token}`);

    expect(response.status).toBe(200);
  });
});

describe("endurecimiento del JWT", () => {
  afterAll(async () => {
    await pool.end().catch(() => undefined);
  });

  it("rechaza un token firmado con otro algoritmo", async () => {
    const secret = getConfig().jwtSecret;
    const token = jwt.sign({ username: "admin", role: "admin", csrf: "c".repeat(64) }, secret, {
      algorithm: "HS512",
      expiresIn: "1h",
    });

    const response = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("rechaza un token sin rol administrativo", async () => {
    const secret = getConfig().jwtSecret;
    const token = jwt.sign({ username: "admin", csrf: "c".repeat(64) }, secret, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    const response = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("rechaza un token sin claim de CSRF", async () => {
    const secret = getConfig().jwtSecret;
    const token = jwt.sign({ username: "admin", role: "admin" }, secret, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    const response = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("rechaza un token caducado", async () => {
    const secret = getConfig().jwtSecret;
    const token = jwt.sign(
      { username: "admin", role: "admin", csrf: "c".repeat(64), exp: Math.floor(Date.now() / 1000) - 10 },
      secret,
      { algorithm: "HS256" },
    );

    const response = await request(app).get("/api/admin/stats").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });
});
