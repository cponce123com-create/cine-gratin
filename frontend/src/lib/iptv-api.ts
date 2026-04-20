/**
 * IPTV API — fetches and parses public M3U playlists from iptv-org
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface IptvChannel {
  id: string;          // hash único de la URL (btoa slice)
  name: string;        // tvg-name o nombre del canal
  url: string;         // URL del stream .m3u8
  logo: string;        // tvg-logo (puede estar vacío)
  group: string;       // group-title
  country: string;     // tvg-country (puede estar vacío)
  status: "unknown" | "online" | "offline" | "cors-blocked";
}

export type IptvSource =
  | "peru"
  | "latino"
  | "mexico"
  | "argentina"
  | "colombia"
  | "news"
  | "sports"
  | "movies"
  | "kids"
  | "music"
  | "documentary"
  | "tdtchannels"
  | "peru_regional"
  | "infinity"
  | "all";

// ─── Sources map ───────────────────────────────────────────────────────────────

const SOURCES: Record<IptvSource, string> = {
  peru:        "https://iptv-org.github.io/iptv/countries/pe.m3u",
  latino:      "https://iptv-org.github.io/iptv/languages/spa.m3u",
  mexico:      "https://iptv-org.github.io/iptv/countries/mx.m3u",
  argentina:   "https://iptv-org.github.io/iptv/countries/ar.m3u",
  colombia:    "https://iptv-org.github.io/iptv/countries/co.m3u",
  news:        "https://iptv-org.github.io/iptv/categories/news.m3u",
  sports:      "https://iptv-org.github.io/iptv/categories/sports.m3u",
  movies:      "https://iptv-org.github.io/iptv/categories/movies.m3u",
  kids:        "https://iptv-org.github.io/iptv/categories/kids.m3u",
  music:       "https://iptv-org.github.io/iptv/categories/music.m3u",
  documentary:   "https://iptv-org.github.io/iptv/categories/documentary.m3u",
  tdtchannels:   "https://www.tdtchannels.com/lists/tv.m3u8",
  peru_regional: "https://raw.githubusercontent.com/antholyber1a/lista-iptv-peru/main/iptvperu.m3u",
  infinity:      "https://telechancho.github.io/infinity.m3u",
  all:           "https://iptv-org.github.io/iptv/index.m3u",
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a named attribute from an #EXTINF line */
function extractAttr(line: string, attr: string): string {
  const quoted = new RegExp(`${attr}="([^"]*)"`, "i").exec(line);
  if (quoted) return quoted[1].trim();
  const unquoted = new RegExp(`${attr}=([^\\s,]+)`, "i").exec(line);
  if (unquoted) return unquoted[1].trim();
  return "";
}

/** Extract the display name after the last comma in the #EXTINF line */
function extractDisplayName(line: string): string {
  const idx = line.lastIndexOf(",");
  if (idx === -1) return "";
  return line.slice(idx + 1).trim();
}

/** Generate a stable short ID from a URL */
function makeId(url: string): string {
  try {
    return btoa(url).slice(0, 12);
  } catch {
    // btoa can fail on non-latin chars — fallback to length-based hash
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 12);
  }
}

// ─── Parser ────────────────────────────────────────────────────────────────────

export function parseM3U(text: string): IptvChannel[] {
  const lines = text.split("\n").map((l) => l.trim());
  const channels: IptvChannel[] = [];
  const seenUrls = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXTINF")) continue;

    // Find the URL: the next non-empty, non-comment line
    let url = "";
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j];
      if (!candidate) continue;
      if (candidate.startsWith("#EXTINF")) break; // next channel block
      if (!candidate.startsWith("#")) { url = candidate; break; }
    }

    // Skip if no URL, not HTTP, or already seen
    if (!url || !url.startsWith("http") || seenUrls.has(url)) continue;
    seenUrls.add(url);

    const name =
      extractDisplayName(line) ||
      extractAttr(line, "tvg-name") ||
      "Canal desconocido";
    const logo    = extractAttr(line, "tvg-logo");
    const group   = extractAttr(line, "group-title") || "General";
    const country = extractAttr(line, "tvg-country");

    channels.push({
      id: makeId(url),
      name,
      url,
      logo,
      group,
      country,
      status: "unknown",
    });
  }

  return channels;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch and parse an M3U playlist.
 * Returns [] silently on any network / parse error.
 */
export async function fetchIptvChannels(source: IptvSource): Promise<IptvChannel[]> {
  const url = SOURCES[source];
  try {
    const res = await fetch(url, {
      mode: "cors",
      cache: "default",
      headers: { Accept: "application/x-mpegURL, application/vnd.apple.mpegurl, */*" },
    });
    if (!res.ok) {
      console.warn(`[iptv-api] HTTP ${res.status} for source "${source}"`);
      return [];
    }
    const text = await res.text();
    if (!text.includes("#EXTINF")) {
      console.warn(`[iptv-api] No EXTINF entries in response for "${source}"`);
      return [];
    }
    const channels = parseM3U(text);
    console.info(`[iptv-api] ${channels.length} channels parsed for "${source}"`);
    return channels;
  } catch (err) {
    console.warn(`[iptv-api] Fetch failed for "${source}":`, err);
    return [];
  }
}
