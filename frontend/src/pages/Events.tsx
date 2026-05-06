import YouTubeEventGrid from "@/components/YouTubeEventGrid";
import { getEvents } from "@/lib/events-api";

export default function Events() {
  return (
    <YouTubeEventGrid
      title="Eventos — Cine Gratín"
      heading="Eventos"
      queryKey={["events"]}
      fetchFn={getEvents}
      emptyMessage="No hay eventos que coincidan."
      errorMessage="No se pudieron cargar los eventos."
    />
  );
}
