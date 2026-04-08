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

export interface EventChannel {
  id: number;
  name: string;
  url: string;
  keyword: string;
  date_added: string;
}

export interface Event {
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

export const getEventsSettings = (): Promise<Record<string, string>> =>
  adminFetch("/api/events/settings");

export const saveEventsSettings = (data: { youtube_api_key: string }): Promise<{ ok: boolean }> =>
  adminFetch("/api/events/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });

// ─── Channels (admin) ─────────────────────────────────────────────────────────

export const getEventChannels = (): Promise<EventChannel[]> =>
  adminFetch("/api/events/channels");

export const addEventChannel = (data: {
  name: string;
  url: string;
  keyword?: string;
}): Promise<EventChannel> =>
  adminFetch("/api/events/channels", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deleteEventChannel = (id: number): Promise<void> =>
  adminFetch(`/api/events/channels/${id}`, { method: "DELETE" });

export const syncEventChannel = (id: number): Promise<SyncResult> =>
  adminFetch(`/api/events/channels/${id}/sync`, { method: "POST" });

export const syncAllEventChannels = (): Promise<SyncResult> =>
  adminFetch("/api/events/sync-all", { method: "POST" });

// ─── Events (public) ──────────────────────────────────────────────────────────

export const getEvents = (params?: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<Event[]> => {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return publicFetch(`/api/events${query}`);
};

export const deleteEvent = (id: number): Promise<void> =>
  adminFetch(`/api/events/${id}`, { method: "DELETE" });
