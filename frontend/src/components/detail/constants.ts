// ── Fallbacks ──────────────────────────────────────────────────────────────────

export const FALLBACK_BG =
  "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1400&auto=format&fit=crop";

export const FALLBACK_POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300' viewBox='0 0 200 300'%3E%3Crect width='200' height='300' fill='%231a1a1a'/%3E%3Ctext x='100' y='150' font-family='sans-serif' font-size='14' fill='%23555' text-anchor='middle' dominant-baseline='middle'%3ESin imagen%3C/text%3E%3C/svg%3E";

export const FALLBACK_PERSON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='150' viewBox='0 0 100 150'%3E%3Crect width='100' height='150' fill='%231e1e1e'/%3E%3Ccircle cx='50' cy='55' r='22' fill='%23333'/%3E%3Cellipse cx='50' cy='130' rx='35' ry='30' fill='%23333'/%3E%3C/svg%3E";

// ── Video ──────────────────────────────────────────────────────────────────────

export const VIDEO_ORDER = ["Trailer", "Teaser", "Clip", "Featurette", "Behind the Scenes", "Bloopers"];

export const VIDEO_TYPE_COLORS: Record<string, string> = {
  Trailer: "bg-red-600",
  Teaser: "bg-orange-500",
  Clip: "bg-blue-500",
  Featurette: "bg-purple-500",
  "Behind the Scenes": "bg-green-600",
  Bloopers: "bg-yellow-500",
};

export const VIDEO_TABS = [
  { id: "popular", label: "Más popular" },
  { id: "trailers", label: "Tráileres" },
  { id: "teasers", label: "Teasers" },
  { id: "clips", label: "Clips" },
  { id: "bts", label: "Behind the Scenes" },
  { id: "all", label: "Todo" },
];
