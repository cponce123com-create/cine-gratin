import type { AutoImportLog } from "@/lib/types";

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("es", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ImportLogsTable({ logs, loading }: { logs: AutoImportLog[]; loading: boolean }) {
  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-brand-border">
        <h2 className="text-white font-bold text-base">Últimas importaciones</h2>
      </div>

      {logs.length === 0 && !loading ? (
        <div className="px-6 py-12 text-center text-gray-500 text-sm">
          No hay registros de importación aún.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className="text-left px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Fecha
                </th>
                <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Películas
                </th>
                <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Series
                </th>
                <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Revisados
                </th>
                <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 5).map((log, idx) => (
                <tr
                  key={log.id ?? idx}
                  className="border-b border-brand-border last:border-0 hover:bg-brand-surface/50 transition-colors"
                >
                  <td className="px-6 py-3.5 text-gray-300 font-mono text-xs whitespace-nowrap">
                    {formatDate(log.run_at)}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-green-400 font-bold">+{log.movies_imported}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-blue-400 font-bold">+{log.series_imported}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center text-gray-400">{log.total_checked}</td>
                  <td className="px-4 py-3.5 text-center">
                    {log.status === "success" ? (
                      <span className="inline-flex items-center gap-1 bg-green-900/30 text-green-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-800/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                        OK
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 bg-red-900/30 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-red-800/40 cursor-help"
                        title={log.error_message ?? "Error desconocido"}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        Error
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
