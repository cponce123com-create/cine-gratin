// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCsrfToken } from "@/lib/auth";
import { adminPost, apiFetch, getSession } from "@/lib/api";

/**
 * The API client is the point where the CSRF token travels: these tests
 * verify that the mutating requests carry it and the read-only ones do not.
 */
describe("cliente de la API", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("token-de-prueba");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(null);
  });

  it("envía la cabecera X-CSRF-Token en las peticiones que cambian el estado", async () => {
    await adminPost("/api/admin/movies", { title: "Prueba" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("X-CSRF-Token")).toBe("token-de-prueba");
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
  });

  it("no envía el token CSRF en las peticiones de solo lectura", async () => {
    await apiFetch("/api/movies");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("X-CSRF-Token")).toBeNull();
    expect(init.credentials).toBe("include");
  });

  it("avisa cuando la API responde 401", async () => {
    const events: string[] = [];
    window.addEventListener("cg:unauthorized", () => events.push("unauthorized"));

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "No autorizado" }),
      headers: new Headers(),
    });

    await expect(adminPost("/api/admin/movies", { title: "Prueba" })).rejects.toThrow();
    expect(events).toContain("unauthorized");
  });

  it("consulta la sesion con las credenciales incluidas", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ authenticated: true, csrfToken: "abc" }),
      headers: new Headers(),
    });

    const session = await getSession();
    expect(session.authenticated).toBe(true);
    expect(session.csrfToken).toBe("abc");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
  });
});
