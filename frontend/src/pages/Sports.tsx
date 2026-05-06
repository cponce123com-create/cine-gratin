import YouTubeEventGrid from "@/components/YouTubeEventGrid";
import { getSportMatches } from "@/lib/sports-api";

export default function Sports() {
  return (
    <YouTubeEventGrid
      title="Eventos Deportivos — Cine Gratín"
      heading="Eventos Deportivos"
      queryKey={["sports-matches"]}
      fetchFn={getSportMatches}
      emptyMessage="No hay eventos que coincidan."
      errorMessage="No se pudieron cargar los eventos deportivos."
    />
  );
}
