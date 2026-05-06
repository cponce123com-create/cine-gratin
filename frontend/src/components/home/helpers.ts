import type { Movie, Series } from "@/lib/types";
import type { MixedItem } from "@/components/GenreCarousel";

const MIN_ITEMS_TO_SHOW = 2;

export { MIN_ITEMS_TO_SHOW };

export function matchesKeywords(
  genres: string[] | undefined,
  keywords: string[],
): boolean {
  if (!genres || genres.length === 0) return false;
  return genres.some((g) =>
    keywords.some((kw) => g.toLowerCase().includes(kw.toLowerCase())),
  );
}

export function matchesNetworks(
  itemNetworks: string[] | undefined,
  targets: string[],
): boolean {
  if (!itemNetworks || itemNetworks.length === 0) return false;
  return itemNetworks.some((n) =>
    targets.some((t) => n.toLowerCase().includes(t.toLowerCase())),
  );
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[&]/g, "and")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

export function matchesTitle(title: string, keywords: string[]): boolean {
  const normalizedTitle = normalizeTitle(title);
  return keywords.some((kw) => {
    const normalizedKw = normalizeTitle(kw);
    if (normalizedKw.includes(" ")) {
      return normalizedTitle.includes(normalizedKw);
    }
    return new RegExp(`(?:^|\\s)${normalizedKw}(?:\\s|$)`).test(normalizedTitle);
  });
}

export function buildMixed(
  movies: Movie[],
  series: Series[],
  filterFn: (m: Movie) => boolean,
  filterSeries: (s: Series) => boolean,
): MixedItem[] {
  const result: MixedItem[] = [];
  for (const m of movies) if (filterFn(m)) result.push({ item: m, type: "movie" });
  for (const s of series) if (filterSeries(s)) result.push({ item: s, type: "series" });
  result.sort((a, b) => {
    const yearA = Number(a.item.year) || 0;
    const yearB = Number(b.item.year) || 0;
    return yearB - yearA;
  });
  return result;
}
