import { createChannelApi, type ChannelItem, type SyncResult } from "./channels-api";

// Re-export types for backward compatibility
export type EventChannel = import("./channels-api").Channel;
export type Event = ChannelItem;

const api = createChannelApi("events", "events");

export const getEventsSettings = api.getSettings;
export const saveEventsSettings = api.saveSettings;
export const getEventChannels = api.getChannels;
export const addEventChannel = api.addChannel;
export const deleteEventChannel = api.deleteChannel;
export const syncEventChannel = api.syncChannel;
export const syncAllEventChannels = api.syncAllChannels;
export const getEvents = api.getItems;
export const deleteEvent = api.deleteItem;
export type { SyncResult };
