import { getToken } from "./auth";

const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) ||
  "https://cine-gratin.onrender.com";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function publicFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SportChannel {
  id: number;
  name: string;
  url: string;
  keyword: string;
  date_added: string;
}

export interface SportMatch {
  id: number;
  channel_id: number;
  channel_name: string;
  yt_id: string;
  title: string;
  thumbnail: string | null;
  published_at: string | null;
  date_added: string;
}

export interface SyncResult {
  imported: number;
  existed: number;
  errors?: string[];
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export const getSportsSettings = (): Promise<Record<string, string>> =>
  adminFetch("/api/sports/settings");

export const saveSportsSettings = (data: { youtube_api_key: string }): Promise<{ ok: boolean }> =>
  adminFetch("/api/sports/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });

// ─── Channels (admin) ─────────────────────────────────────────────────────────

export const getSportChannels = (): Promise<SportChannel[]> =>
  adminFetch("/api/sports/channels");

export const addSportChannel = (data: {
  name: string;
  url: string;
  keyword?: string;
}): Promise<SportChannel> =>
  adminFetch("/api/sports/channels", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deleteSportChannel = (id: number): Promise<void> =>
  adminFetch(`/api/sports/channels/${id}`, { method: "DELETE" });

export const syncSportChannel = (id: number): Promise<SyncResult> =>
  adminFetch(`/api/sports/channels/${id}/sync`, { method: "POST" });

export const syncAllSportChannels = (): Promise<SyncResult> =>
  adminFetch("/api/sports/sync-all", { method: "POST" });

// ─── Matches (public) ─────────────────────────────────────────────────────────

export const getSportMatches = (params?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<SportMatch[]> => {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return publicFetch(`/api/sports/matches${query}`);
};

export const deleteSportMatch = (id: number): Promise<void> =>
  adminFetch(`/api/sports/matches/${id}`, { method: "DELETE" });
