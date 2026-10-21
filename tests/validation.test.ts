import { describe, expect, it } from "vitest";
import { parseIntParam, parsePagination, parseStringParam } from "../backend/src/lib/http";
import { normalizeImdbId, normalizeTmdbId } from "../backend/src/lib/catalog-import";
import { normalizeJobItems } from "../backend/src/lib/import-jobs";
import { isValidToken, extractToken, verifyToken, generateToken } from "../backend/src/lib/auth-utils";
import { getConfig, setConfig } from "../backend/src/lib/config";

describe("validación de entradas", () => {
  it("rechaza paginaciones fuera de rango", () => {
    expect(() => parsePagination({ page: "0" })).toThrow(/page/);
    expect(() => parsePagination({ page: "-1" })).toThrow(/page/);
    expect(() => parsePagination({ limit: "0" })).toThrow(/limit/);
    expect(() => parsePagination({ limit: "5000" })).toThrow(/limit/);
    expect(() => parsePagination({ limit: "abc" })).toThrow(/limit/);
    expect(() => parsePagination({ offset: "-5" })).toThrow(/offset/);
    expect(() => parsePagination({ offset: "999999999" })).toThrow(/offset/);
  });

  it("acepta paginaciones válidas y calcula el desplazamiento", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(parsePagination({ page: "3", limit: "25" })).toEqual({ page: 3, limit: 25, offset: 50 });
  });

  it("rechaza un límite por encima del máximo permitido", () => {
    expect(() => parsePagination({ limit: "1000" }, { maxLimit: 50 })).toThrow(/limit/);
    expect(parsePagination({ limit: "50" }, { maxLimit: 50 }).limit).toBe(50);
  });

  it("valida enteros y cadenas de los parámetros", () => {
    expect(parseIntParam(undefined, 5)).toBe(5);
    expect(() => parseIntParam("abc", 5)).toThrow();
    expect(() => parseIntParam("999", 5, { max: 10 })).toThrow();
    expect(parseStringParam("  texto  ")).toBe("texto");
    expect(parseStringParam("")).toBeNull();
    expect(() => parseStringParam("x".repeat(500), { maxLength: 100 })).toThrow();
  });

  it("normaliza identificadores de IMDb y de TMDB", () => {
    expect(normalizeImdbId("tt0111161")).toBe("tt0111161");
    expect(normalizeImdbId("TT0111161")).toBe("tt0111161");
    expect(normalizeImdbId("tt123")).toBeNull();
    expect(normalizeImdbId("tt01111611")).toBe("tt01111611");
    expect(normalizeImdbId("no-es-un-id")).toBeNull();
    expect(normalizeImdbId(123 as unknown as string)).toBeNull();

    expect(normalizeTmdbId("550")).toBe(550);
    expect(normalizeTmdbId(550)).toBe(550);
    expect(normalizeTmdbId("0")).toBeNull();
    expect(normalizeTmdbId("-5")).toBeNull();
    expect(normalizeTmdbId("abc")).toBeNull();
  });

  it("descarta los identificadores inválidos de un trabajo de importación", () => {
    const { valid, invalid } = normalizeJobItems([
      "tt0111161",
      "tt0111161",
      "550",
      "no-es-un-id",
      42 as unknown as string,
    ]);

    expect(valid).toEqual(["tt0111161", "550"]);
    expect(invalid).toEqual(["no-es-un-id", "42"]);
  });
});

describe("autenticación", () => {
  it("sólo acepta el token en la cabecera o en la cookie", () => {
    const req = {
      headers: { authorization: "Bearer abc" },
      cookies: {},
      query: { token: "desde-la-url" },
    } as never;

    expect(extractToken(req)).toBe("abc");

    const cookieReq = {
      headers: {},
      cookies: { cg_session: "de-la-cookie" },
      query: {},
    } as never;
    expect(extractToken(cookieReq)).toBe("de-la-cookie");

    const queryReq = { headers: {}, cookies: {}, query: { token: "desde-la-url" } } as never;
    expect(extractToken(queryReq)).toBeUndefined();
  });

  it("rechaza tokens arbitrarios cuando no hay modo inseguro", () => {
    const config = getConfig();
    setConfig({ ...config, allowInsecureDevAuth: false, adminSecret: null });
    expect(isValidToken("cualquier-cosa")).toBe(false);
    expect(isValidToken("")).toBe(false);
  });

  it("acepta el ADMIN_SECRET configurado", () => {
    const config = getConfig();
    setConfig({ ...config, allowInsecureDevAuth: false, adminSecret: "secreto-admin" });
    expect(isValidToken("secreto-admin")).toBe(true);
    expect(isValidToken("otro")).toBe(false);
    setConfig(config);
  });

  it("firma y verifica los tokens, y rechaza los caducados", () => {
    const token = generateToken("admin");
    expect(verifyToken(token)).toMatchObject({ username: "admin" });
    expect(isValidToken(token)).toBe(true);

    const expired = generateToken("admin");
    expect(verifyToken(`${expired}tampered`)).toBeNull();
  });
});
