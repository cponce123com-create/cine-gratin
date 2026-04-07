import type { TrendPoint } from "@/lib/types";

interface TrendsChartProps {
  data: TrendPoint[];
  title?: string;
}

export default function TrendsChart({ data, title = "Tendencias (últimos 30 días)" }: TrendsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-4">{title}</h2>
        <div className="text-center text-gray-500 py-12">
          No hay datos de tendencias disponibles.
        </div>
      </div>
    );
  }

  // Encontrar el máximo valor para escalar el gráfico
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const minCount = Math.min(...data.map(d => d.count), 0);
  const range = maxCount - minCount || 1;

  // Formatear fechas
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat("es", {
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
      <h2 className="text-white font-bold text-base mb-6">{title}</h2>

      <div className="space-y-4">
        {data.map((point, idx) => {
          const normalizedHeight = ((point.count - minCount) / range) * 100;
          const displayHeight = Math.max(normalizedHeight, 5); // Mínimo 5% para visibilidad

          return (
            <div key={idx} className="flex items-end gap-3">
              <div className="text-xs text-gray-500 w-12 text-right">
                {formatDate(point.date)}
              </div>
              <div className="flex-1 flex items-end gap-2">
                <div
                  className="bg-gradient-to-t from-brand-red to-red-500 rounded-t transition-all hover:opacity-80"
                  style={{ height: `${displayHeight}px`, minHeight: "4px" }}
                  title={`${point.count} elementos`}
                />
              </div>
              <div className="text-xs text-gray-400 w-8 text-right">
                {point.count}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-brand-border">
        <div className="grid grid-cols-3 gap-4 text-center text-xs">
          <div>
            <p className="text-gray-500">Mínimo</p>
            <p className="text-white font-bold">{minCount}</p>
          </div>
          <div>
            <p className="text-gray-500">Promedio</p>
            <p className="text-white font-bold">
              {Math.round(data.reduce((sum, d) => sum + d.count, 0) / data.length)}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Máximo</p>
            <p className="text-white font-bold">{maxCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
