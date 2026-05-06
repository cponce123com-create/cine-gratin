import { adminFetch, apiFetch } from "./api";

// ─── Generic types ────────────────────────────────────────────────────────────

export interface Channel {
  id: number;
  name: string;
  url: string;
  keyword: string;
  date_added: string;
}

export interface ChannelItem {
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

// ─── Factory ───────────────────────────────────────────────────────────────────

export function createChannelApi(
  channelPrefix: string,
  itemEndpoint: string,
) {
  return {
    // Settings
    getSettings: (): Promise<Record<string, string>> =>
      adminFetch(`/api/${channelPrefix}/settings`),

    saveSettings: (
      data: { youtube_api_key: string },
    ): Promise<{ ok: boolean }> =>
      adminFetch(`/api/${channelPrefix}/settings`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    // Channels (admin)
    getChannels: (): Promise<Channel[]> =>
      adminFetch(`/api/${channelPrefix}/channels`),

    addChannel: (data: {
      name: string;
      url: string;
      keyword?: string;
    }): Promise<Channel> =>
      adminFetch(`/api/${channelPrefix}/channels`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    deleteChannel: (id: number): Promise<void> =>
      adminFetch(`/api/${channelPrefix}/channels/${id}`, {
        method: "DELETE",
      }),

    syncChannel: (id: number): Promise<SyncResult> =>
      adminFetch(`/api/${channelPrefix}/channels/${id}/sync`, {
        method: "POST",
      }),

    syncAllChannels: (): Promise<SyncResult> =>
      adminFetch(`/api/${channelPrefix}/sync-all`, { method: "POST" }),

    // Items (public)
    getItems: (params?: {
      q?: string;
      limit?: number;
      offset?: number;
    }): Promise<ChannelItem[]> => {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const query = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch(`/api/${itemEndpoint}${query}`);
    },

    deleteItem: (id: number): Promise<void> =>
      adminFetch(`/api/${itemEndpoint}/${id}`, { method: "DELETE" }),
  };
}
