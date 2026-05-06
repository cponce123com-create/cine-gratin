import { createChannelApi, type ChannelItem, type SyncResult } from "./channels-api";

// Re-export types for backward compatibility
export type SportChannel = import("./channels-api").Channel;
export type SportMatch = ChannelItem;

const api = createChannelApi("sports", "sports/matches");

export const getSportsSettings = api.getSettings;
export const saveSportsSettings = api.saveSettings;
export const getSportChannels = api.getChannels;
export const addSportChannel = api.addChannel;
export const deleteSportChannel = api.deleteChannel;
export const syncSportChannel = api.syncChannel;
export const syncAllSportChannels = api.syncAllChannels;
export const getSportMatches = api.getItems;
export const deleteSportMatch = api.deleteItem;
export type { SyncResult };
