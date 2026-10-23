import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { getConfig, setConfig } from "../backend/src/lib/config";
import { tmdbFetch, tmdbBudgetSpent, clearTmdbBudget } from "../backend/src/lib/tmdb-client";

/**
 * Every TMDB call goes through `tmdbFetch`, which enforces a global per-UTC-day
 * budget on the shared key. These tests pin the guard: once the budget is spent,
 * further calls short-circuit with a synthetic 429 and never touch the network,
 * so a burst (or a runaway loop) cannot exhaust the quota for every caller.
 */
describe("presupuesto diario global de TMDB", () => {
  beforeEach(() => {
    clearTmdbBudget();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setConfig(null); // restaura la configuración real
  });

  it("devuelve 429 sintetico y corta la red al agotarse el presupuesto", async () => {
    setConfig({ ...getConfig(), tmdbDailyBudget: 3 });

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await tmdbFetch("/movie/1?language=es-MX");
    await tmdbFetch("/movie/2?language=es-MX");
    await tmdbFetch("/movie/3?language=es-MX");
    expect(tmdbBudgetSpent()).toBe(3);

    const blocked = await tmdbFetch("/movie/4?language=es-MX");
    expect(blocked.status).toBe(429);
    // La 4ª petición nunca llegó a la red.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("no corta cuando el presupuesto esta deshabilitado (0)", async () => {
    setConfig({ ...getConfig(), tmdbDailyBudget: 0 });

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 8; i++) {
      const res = await tmdbFetch(`/movie/${i}?language=es-MX`);
      expect(res.status).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});
