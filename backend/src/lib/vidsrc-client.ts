export type VidsrcType = "movie" | "series";
export type VidsrcProgress = (pagesLoaded: number, totalPages: number) => void;

const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_CONCURRENCY = 4;
const MAX_PAGES = 2_000;
const cache = new Map<VidsrcType, { ids: Set<string>; expiresAt: number }>();
const inFlight = new Map<VidsrcType, Promise<Set<string>>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pathFor = (type: VidsrcType) => (type === "series" ? "tvshows" : "movies");

async function fetchPage(type: VidsrcType, page: number): Promise<{ ids: string[]; pages?: number }> {
  const response = await fetch(`https://vidsrc.me/${pathFor(type)}/latest/page-${page}.json`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`VIDSRC respondió ${response.status} en la página ${page}`);
  const data = (await response.json()) as { result?: Array<{ imdb_id?: string }>; pages?: number };
  if (!data || !Array.isArray(data.result))
    throw new Error(`VIDSRC devolvió una respuesta inválida en la página ${page}`);
  const ids = data.result.map((item) => item.imdb_id?.trim()).filter((id): id is string => Boolean(id));
  return { ids, pages: data.pages };
}

async function downloadAll(type: VidsrcType, onProgress?: VidsrcProgress): Promise<Set<string>> {
  let first: Awaited<ReturnType<typeof fetchPage>> | null = null;
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      first = await fetchPage(type, 1);
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
    }
  }
  if (!first)
    throw lastError instanceof Error ? lastError : new Error("No se pudo obtener la página 1 de VIDSRC");

  const totalPages = Math.max(1, Number(first.pages) || 1);
  if (totalPages > MAX_PAGES) {
    throw new Error(`VIDSRC informó ${totalPages} páginas, fuera del límite seguro de ${MAX_PAGES}.`);
  }
  const ids = new Set(first.ids);
  let completed = 1;
  onProgress?.(completed, totalPages);
  let nextPage = 2;
  let failedPage: number | null = null;

  const worker = async () => {
    while (failedPage === null) {
      const page = nextPage++;
      if (page > totalPages) return;
      let result: Awaited<ReturnType<typeof fetchPage>> | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          result = await fetchPage(type, page);
          break;
        } catch (error) {
          if (attempt === 3) {
            failedPage = page;
            lastError = error;
          } else {
            await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
          }
        }
      }
      if (!result) return;
      for (const id of result.ids) ids.add(id);
      completed++;
      onProgress?.(completed, totalPages);
    }
  };

  await Promise.all(Array.from({ length: Math.min(PAGE_CONCURRENCY, totalPages - 1) }, worker));
  if (failedPage !== null) {
    throw new Error(
      `VIDSRC no pudo completar el escaneo: falló la página ${failedPage}. No se actualizará el catálogo.`,
    );
  }
  return ids;
}

/** Returns only a complete list; incomplete scans must never create false negatives. */
export async function getVidsrcIds(type: VidsrcType, onProgress?: VidsrcProgress): Promise<Set<string>> {
  const cached = cache.get(type);
  if (cached && cached.expiresAt > Date.now()) {
    onProgress?.(1, 1);
    return cached.ids;
  }
  let pending = inFlight.get(type);
  if (!pending) {
    pending = downloadAll(type, onProgress);
    inFlight.set(type, pending);
  }
  try {
    const ids = await pending;
    cache.set(type, { ids, expiresAt: Date.now() + CACHE_TTL_MS });
    onProgress?.(1, 1);
    return ids;
  } finally {
    if (inFlight.get(type) === pending) inFlight.delete(type);
  }
}
