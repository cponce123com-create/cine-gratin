import { useState, useEffect, useCallback } from "react";

export interface ContinueWatchingItem {
  id: string | number;
  imdbId: string;
  title: string;
  type: "movie" | "series";
  poster_url?: string;
  season?: number;
  episode?: number;
  updatedAt: number;
}

const STORAGE_KEY = "cinegratin_continue_watching";
const MAX_ITEMS = 20;

export function useContinueWatching() {
  const [items, setItems] = useState<ContinueWatchingItem[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setItems(JSON.parse(stored));
      } catch (e) {
        console.error("Error parsing continue watching items", e);
      }
    }
  }, []);

  // Memorizados con useCallback: los jugadores las usan en las dependencias de
  // sus efectos. Con una referencia nueva en cada render, el efecto se volvería
  // a ejecutar en bucle (saveItem llama a setItems con updatedAt: Date.now()).
  const saveItem = useCallback((item: Omit<ContinueWatchingItem, "updatedAt">) => {
    const newItem: ContinueWatchingItem = { ...item, updatedAt: Date.now() };

    setItems((prev) => {
      // Remove existing entry for the same content
      const filtered = prev.filter((i) => i.imdbId !== item.imdbId);
      // Add to start and limit
      const updated = [newItem, ...filtered].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeItem = useCallback((imdbId: string) => {
    setItems((prev) => {
      const updated = prev.filter((i) => i.imdbId !== imdbId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { items, saveItem, removeItem };
}
