import type { IptvSource } from "@/hooks/useIptv";

export const SOURCE_TABS: { id: IptvSource; label: string }[] = [
  { id: "peru",        label: "🇵🇪 Perú" },
  { id: "latino",      label: "🌎 Latino" },
  { id: "mexico",      label: "🇲🇽 México" },
  { id: "argentina",   label: "🇦🇷 Argentina" },
  { id: "colombia",    label: "🇨🇴 Colombia" },
  { id: "news",        label: "📰 Noticias" },
  { id: "sports",      label: "⚽ Deportes" },
  { id: "movies",      label: "🎬 Películas" },
  { id: "music",       label: "🎵 Música" },
  { id: "kids",        label: "🧒 Infantil" },
  { id: "documentary", label: "🎥 Documental" },
  { id: "tdtchannels",   label: "📡 TDT (Perú/España)" },
  { id: "peru_regional", label: "🇵🇪 Perú Regional" },
  { id: "infinity",      label: "♾️ Infinity" },
  { id: "all",         label: "🌍 Todo" },
];
