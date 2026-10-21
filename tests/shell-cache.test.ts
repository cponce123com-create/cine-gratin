import { describe, expect, it } from "vitest";
import { canonicalShellUrl, findShell, SHELL_CACHE, storeShell } from "../frontend/src/lib/shell-cache";

/**
 * Cache de mentira con la misma interfaz que usa el service worker.
 */
class FakeCache {
  private entries = new Map<string, Response>();

  /** Igual que la Cache real, la clave es la URL de la peticion. */
  private static key(request: RequestInfo | URL): string {
    if (typeof request === "string") return request;
    if (request instanceof URL) return request.toString();
    return request.url;
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(FakeCache.key(request), response);
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(FakeCache.key(request));
  }

  get size(): number {
    return this.entries.size;
  }
}

const ORIGIN = "https://cine-gratin.onrender.com";

function shellRequest(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

describe("cache del shell de la aplicacion", () => {
  it("usa un nombre de cache propio", () => {
    expect(SHELL_CACHE).toBe("shell-cache");
  });

  it("calcula la ruta canonica del shell", () => {
    expect(canonicalShellUrl(ORIGIN)).toBe(`${ORIGIN}/`);
  });

  it("guarda el shell con la ruta pedida y con la ruta canonica", async () => {
    const cache = new FakeCache();
    const request = shellRequest("/peliculas");
    const response = new Response("<html></html>", { status: 200 });

    await storeShell(cache as unknown as Cache, request, response, ORIGIN);

    expect(cache.size).toBe(2);
    expect(await cache.match(`${ORIGIN}/peliculas`)).toBeDefined();
    expect(await cache.match(`${ORIGIN}/`)).toBeDefined();
  });

  it("recupera el shell de la ruta pedida", async () => {
    const cache = new FakeCache();
    const request = shellRequest("/series");
    await storeShell(
      cache as unknown as Cache,
      request,
      new Response("<html>series</html>", { status: 200 }),
      ORIGIN,
    );

    const found = await findShell(cache as unknown as Cache, request, ORIGIN);

    expect(found).toBeDefined();
    expect(await found?.text()).toContain("series");
  });

  it("recurre al shell canonico si la ruta no estaba guardada", async () => {
    const cache = new FakeCache();
    await storeShell(
      cache as unknown as Cache,
      shellRequest("/"),
      new Response("<html>raiz</html>", { status: 200 }),
      ORIGIN,
    );

    const found = await findShell(cache as unknown as Cache, shellRequest("/ruta-nunca-visitada"), ORIGIN);

    expect(found).toBeDefined();
    expect(await found?.text()).toContain("raiz");
  });

  it("devuelve undefined si no hay ningun shell guardado", async () => {
    const cache = new FakeCache();
    const found = await findShell(cache as unknown as Cache, shellRequest("/"), ORIGIN);
    expect(found).toBeUndefined();
  });
});
