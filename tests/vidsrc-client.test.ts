import { afterEach, describe, expect, it, vi } from "vitest";
import { getVidsrcIds } from "../backend/src/lib/vidsrc-client";

describe("VIDSRC catalog client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads every page and reuses only the completed result from cache", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const page = Number(String(input).match(/page-(\d+)\.json/)?.[1]);
      const body =
        page === 1
          ? { pages: 2, result: [{ imdb_id: "tt1111111" }] }
          : { result: [{ imdb_id: "tt2222222" }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await getVidsrcIds("movie");
    const second = await getVidsrcIds("movie");

    expect([...first]).toEqual(["tt1111111", "tt2222222"]);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
