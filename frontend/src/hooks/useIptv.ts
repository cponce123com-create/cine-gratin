import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIptvChannels, type IptvChannel } from "@/lib/iptv-api";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type IptvSource = "peru" | "spanish";

interface UseIptvChannelsResult {
  channels: IptvChannel[];
  groups: string[];
  isLoading: boolean;
  isError: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * React Query hook for fetching, caching, and filtering IPTV channels.
 *
 * @param source   - "peru" or "spanish" — selects which M3U playlist to fetch
 * @param searchQuery - text to filter channels by name (case-insensitive)
 * @param selectedGroup - group/category to filter by, or "" for all groups
 */
export function useIptvChannels(
  source: IptvSource,
  searchQuery: string = "",
  selectedGroup: string = ""
): UseIptvChannelsResult {
  const { data, isLoading, isError } = useQuery<IptvChannel[]>({
    queryKey: ["iptv-channels", source],
    queryFn: () => fetchIptvChannels(source),
    staleTime: 10 * 60 * 1000, // 10 minutes — M3U playlists don't change often
    gcTime: 15 * 60 * 1000,    // Keep in cache for 15 minutes
    retry: 1,                   // Only retry once to avoid hammering on CORS errors
    refetchOnWindowFocus: false,
  });

  // Extract unique sorted group names from the full channel list
  const groups = useMemo<string[]>(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const ch of data) {
      if (ch.group) seen.add(ch.group);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [data]);

  // Apply search + group filters
  const channels = useMemo<IptvChannel[]>(() => {
    let list = data ?? [];

    if (selectedGroup) {
      list = list.filter((ch) => ch.group === selectedGroup);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((ch) => ch.name.toLowerCase().includes(q));
    }

    return list;
  }, [data, searchQuery, selectedGroup]);

  return { channels, groups, isLoading, isError };
}
