/**
 * IPTV API — fetches and parses public M3U playlists from iptv-org
 * Sources: Perú channels and Spanish-language channels
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface IptvChannel {
  name: string;
  url: string;
  logo: string;
  group: string;
  country: string;
  tvgId: string;
  tvgName: string;
}

// ─── Sources ───────────────────────────────────────────────────────────────────

const SOURCES: Record<"peru" | "spanish", string> = {
  peru: "https://iptv-org.github.io/iptv/countries/pe.m3u",
  spanish: "https://iptv-org.github.io/iptv/languages/spa.m3u",
  all:           'https://iptv-org.github.io/iptv/index.m3u',           // +11,000 canales
  peru:          'https://iptv-org.github.io/iptv/countries/pe.m3u',
  latino:        'https://iptv-org.github.io/iptv/languages/spa.m3u',   // Todo en español
  mexico:        'https://iptv-org.github.io/iptv/countries/mx.m3u',
  argentina:     'https://iptv-org.github.io/iptv/countries/ar.m3u',
  colombia:      'https://iptv-org.github.io/iptv/countries/co.m3u',
  news:          'https://iptv-org.github.io/iptv/categories/news.m3u',
  sports:        'https://iptv-org.github.io/iptv/categories/sports.m3u',
  movies:        'https://iptv-org.github.io/iptv/categories/movies.m3u',
  kids:          'https://iptv-org.github.io/iptv/categories/kids.m3u',
  music:         'https://iptv-org.github.io/iptv/categories/music.m3u',
  documentary:   'https://iptv-org.github.io/iptv/categories/documentary.m3u',
};

// ─── M3U Parser ────────────────────────────────────────────────────────────────

/**
 * Extracts a named attribute value from an EXTINF line.
 * Example: tvg-logo="https://example.com/logo.png" → "https://example.com/logo.png"
 */
function extractAttr(line: string, attr: string): string {
  // Match attr="value" or attr=value (no quotes)
  const quoted = new RegExp(`${attr}="([^"]*)"`, "i").exec(line);
  if (quoted) return quoted[1].trim();
  const unquoted = new RegExp(`${attr}=([^\\s,]+)`, "i").exec(line);
  if (unquoted) return unquoted[1].trim();
  return "";
}

/**
 * Extracts the channel display name from the end of the EXTINF line.
 * Format: #EXTINF:-1 attributes...,Channel Name
 */
function extractDisplayName(line: string): string {
  const commaIdx = line.lastIndexOf(",");
  if (commaIdx === -1) return "";
  return line.slice(commaIdx + 1).trim();
}

/**
 * Parses raw M3U text into an array of IptvChannel objects.
 * Skips channels with empty stream URLs.
 */
function parseM3U(text: string): IptvChannel[] {
  const lines = text.split("\n").map((l) => l.trim());
  const channels: IptvChannel[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.startsWith("#EXTINF")) continue;

    // The very next non-empty line should be the stream URL
    let urlLine = "";
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (candidate && !candidate.startsWith("#")) {
        urlLine = candidate;
        break;
      }
      // If we hit another EXTINF, stop looking
      if (candidate.startsWith("#EXTINF")) break;
    }

    if (!urlLine) continue;

    // Only include HLS/HTTP streams (skip rtmp, rtsp, etc. that won't work in browsers)
    if (!urlLine.startsWith("http")) continue;

    const name = extractDisplayName(line) || extractAttr(line, "tvg-name") || "Canal desconocido";
    const logo = extractAttr(line, "tvg-logo");
    const group = extractAttr(line, "group-title") || "General";
    const tvgId = extractAttr(line, "tvg-id");
    const tvgName = extractAttr(line, "tvg-name");
    const country = extractAttr(line, "tvg-country");

    channels.push({
      name,
      url: urlLine,
      logo,
      group,
      country,
      tvgId,
      tvgName,
    });
  }

  return channels;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches an M3U playlist from iptv-org and returns parsed channels.
 * Returns an empty array silently on any error (network, CORS, parse).
 */
export async function fetchIptvChannels(
  source: "peru" | "spanish"
): Promise<IptvChannel[]> {
  const url = SOURCES[source];

  try {
    const response = await fetch(url, {
      // No-cors would make the response opaque (unusable body).
      // We use cors mode and rely on iptv-org having CORS headers.
      mode: "cors",
      cache: "default",
      headers: {
        Accept: "application/x-mpegURL, application/vnd.apple.mpegurl, */*",
      },
    });

    if (!response.ok) {
      console.warn(`[iptv-api] Failed to fetch ${source}: HTTP ${response.status}`);
      return [];
    }

    const text = await response.text();
    if (!text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
      console.warn(`[iptv-api] Response for ${source} doesn't look like M3U`);
      return [];
    }

    const channels = parseM3U(text);
    console.info(`[iptv-api] Parsed ${channels.length} channels from ${source}`);
    return channels;
  } catch (err) {
    console.warn(`[iptv-api] Error fetching ${source}:`, err);
    return [];
  }
}
