import type { TopContent } from "@/lib/types";

interface TopContentListProps {
  title: string;
  items: TopContent[];
  type: "movies" | "series";
}

export default function TopContentList({ title, items, type }: TopContentListProps) {
  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-brand-border">
        <h2 className="text-white font-bold text-base">{title}</h2>
      </div>

      {items.length === 0 ? (
        <div className="px-6 py-12 text-center text-gray-500 text-sm">
          No hay {type === "movies" ? "películas" : "series"} aún.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border">
                <th className="text-left px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Posición
                </th>
                <th className="text-left px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Título
                </th>
                <th className="text-right px-6 py-3 text-gray-500 font-medium text-xs uppercase tracking-wider">
                  Vistas
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  className="border-b border-brand-border last:border-0 hover:bg-brand-surface/50 transition-colors"
                >
                  <td className="px-6 py-3.5 text-gray-400 font-bold">
                    #{idx + 1}
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      {item.poster_url && (
                        <img
                          src={item.poster_url}
                          alt={item.title}
                          className="w-8 h-12 object-cover rounded"
                        />
                      )}
                      <span className="text-gray-300 font-medium truncate">
                        {item.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span className="text-brand-red font-bold">
                      {item.views.toLocaleString()}
                    </span>
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
