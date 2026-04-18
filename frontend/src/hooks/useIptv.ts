import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchIptvChannels } from "@/lib/iptv-api";
import type { IptvChannel, IptvSource } from "@/lib/iptv-api";

export type { IptvSource };

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UseIptvChannelsResult {
  /** Filtered channel list (search + group applied) */
  channels: IptvChannel[];
  /** All unique group names from the full (unfiltered) list, sorted A-Z */
  groups: string[];
  isLoading: boolean;
  isError: boolean;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Fetches, caches, and filters an IPTV channel list.
 *
 * @param source        - Which playlist to load
 * @param searchQuery   - Case-insensitive channel name filter (debounced externally)
 * @param selectedGroup - Filter by group-title; pass "" or "Todos" for all
 */
export function useIptvChannels(
  source: IptvSource,
  searchQuery: string = "",
  selectedGroup: string = ""
): UseIptvChannelsResult {
  const { data, isLoading, isError } = useQuery<IptvChannel[]>({
    queryKey: ["iptv", source],
    queryFn: () => fetchIptvChannels(source),
    staleTime: 15 * 60 * 1000,   // 15 min — M3U playlists rarely change
    gcTime:    20 * 60 * 1000,   // keep in memory 20 min after last use
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Unique sorted group names from the FULL list (not filtered)
  const groups = useMemo<string[]>(() => {
    if (!data?.length) return [];
    const seen = new Set<string>();
    for (const ch of data) if (ch.group) seen.add(ch.group);
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "es"));
  }, [data]);

  // Apply group + search filters
  const channels = useMemo<IptvChannel[]>(() => {
    let list = data ?? [];

    if (selectedGroup && selectedGroup !== "Todos") {
      list = list.filter((ch: IptvChannel) => ch.group === selectedGroup);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((ch: IptvChannel) => ch.name.toLowerCase().includes(q));
    }

    return list;
  }, [data, searchQuery, selectedGroup]);

  return { channels, groups, isLoading, isError };
}
