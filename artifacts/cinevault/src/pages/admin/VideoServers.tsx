import { useState, useEffect } from "react";
import { Server, Plus, Trash2, ChevronUp, ChevronDown, TestTube, X } from "lucide-react";
import { getServers, saveServers, VideoServer, uid } from "@/lib/admin-db";
import { toast } from "sonner";

export function VideoServers() {
  const [servers, setServers] = useState<VideoServer[]>([]);
  const [testImdb, setTestImdb] = useState("tt0111161");
  const [testingUrl, setTestingUrl] = useState<string | null>(null);
  const [newServer, setNewServer] = useState({ name: "", url_pattern: "" });
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setServers(getServers().sort((a, b) => a.order - b.order));
  }, []);

  const persist = (list: VideoServer[]) => {
    const reordered = list.map((s, i) => ({ ...s, order: i }));
    setServers(reordered);
    saveServers(reordered);
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const list = [...servers];
    [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    persist(list);
  };

  const moveDown = (idx: number) => {
    if (idx === servers.length - 1) return;
    const list = [...servers];
    [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
    persist(list);
  };

  const toggle = (id: string) => {
    persist(servers.map(s => s.id === id ? { ...s, active: !s.active } : s));
    toast.success("Estado del servidor actualizado");
  };

  const remove = (id: string) => {
    if (!confirm("¿Eliminar este servidor?")) return;
    persist(servers.filter(s => s.id !== id));
    toast.success("Servidor eliminado");
  };

  const addServer = () => {
    if (!newServer.name || !newServer.url_pattern) {
      toast.error("El nombre y el patrón de URL son requeridos");
      return;
    }
    persist([...servers, {
      id: uid(),
      name: newServer.name,
      url_pattern: newServer.url_pattern,
      active: true,
      order: servers.length,
    }]);
    setNewServer({ name: "", url_pattern: "" });
    setShowAdd(false);
    toast.success("Servidor agregado");
  };

  const resolveUrl = (pattern: string, imdb: string) =>
    pattern.replace("{IMDB_ID}", imdb);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Servidores de Video</h1>
          <p className="text-[#8b949e] text-sm">Gestión y prioridad de servidores de streaming</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
          data-testid="btn-add-server"
        >
          <Plus className="w-4 h-4" />
          Agregar Servidor
        </button>
      </div>

      {/* Test bar */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 flex flex-wrap items-center gap-3">
        <TestTube className="w-4 h-4 text-[#e3b341] flex-shrink-0" />
        <span className="text-sm text-[#8b949e] font-mono">Probar con ID de IMDb:</span>
        <input
          value={testImdb}
          onChange={e => setTestImdb(e.target.value)}
          className="bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] rounded-lg px-3 py-1.5 text-sm font-mono outline-none focus:border-[#238636] w-36"
          placeholder="tt0111161"
        />
        <button
          onClick={() => toast.info("Haz clic en 'Probar' en cada servidor de la lista")}
          className="bg-[#e3b341]/10 border border-[#e3b341]/30 text-[#e3b341] px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-[#e3b341]/20 transition-colors"
        >
          Probar Todos
        </button>
      </div>

      {/* Add server form */}
      {showAdd && (
        <div className="bg-[#161b22] border border-[#238636]/30 rounded-xl p-5 space-y-3">
          <h3 className="text-[#c9d1d9] font-bold text-sm">Nuevo Servidor</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[#8b949e] font-mono block mb-1">Nombre del Servidor</label>
              <input
                value={newServer.name}
                onChange={e => setNewServer(p => ({ ...p, name: e.target.value }))}
                placeholder="MiServidor"
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2 text-sm font-mono outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#8b949e] font-mono block mb-1">
                Patrón de URL <span className="text-[#238636]">(usa {"{IMDB_ID}"})</span>
              </label>
              <input
                value={newServer.url_pattern}
                onChange={e => setNewServer(p => ({ ...p, url_pattern: e.target.value }))}
                placeholder="https://ejemplo.com/embed/{IMDB_ID}"
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2 text-sm font-mono outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={addServer} className="bg-[#238636] hover:bg-[#2ea043] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
              Agregar
            </button>
            <button onClick={() => setShowAdd(false)} className="bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9] px-4 py-2 rounded-lg text-sm font-bold transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Server list */}
      <div className="space-y-3">
        {servers.map((server, idx) => (
          <div
            key={server.id}
            className={`bg-[#161b22] border rounded-xl p-4 flex items-center gap-4 transition-colors ${
              server.active ? "border-[#30363d]" : "border-[#30363d] opacity-50"
            }`}
          >
            {/* Order buttons */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="p-0.5 text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === servers.length - 1}
                className="p-0.5 text-[#8b949e] hover:text-[#c9d1d9] disabled:opacity-30 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Priority badge */}
            <div className="w-7 h-7 rounded-lg bg-[#21262d] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-mono text-[#8b949e]">#{idx + 1}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Server className="w-3.5 h-3.5 text-[#58a6ff]" />
                <span className="text-[#c9d1d9] font-bold text-sm">{server.name}</span>
              </div>
              <p className="text-[#8b949e] text-xs font-mono truncate">{server.url_pattern}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setTestingUrl(resolveUrl(server.url_pattern, testImdb))}
                className="px-3 py-1.5 bg-[#21262d] hover:bg-[#e3b341]/10 hover:text-[#e3b341] text-[#8b949e] rounded-lg text-xs font-bold transition-colors border border-transparent hover:border-[#e3b341]/30"
              >
                Probar
              </button>
              <button
                onClick={() => toggle(server.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                  server.active
                    ? "bg-[#238636]/10 text-[#3fb950] border-[#238636]/30 hover:bg-[#238636]/20"
                    : "bg-[#21262d] text-[#8b949e] border-[#30363d] hover:text-[#c9d1d9]"
                }`}
              >
                {server.active ? "Activo" : "Inactivo"}
              </button>
              <button
                onClick={() => remove(server.id)}
                className="p-1.5 text-[#8b949e] hover:text-[#f85149] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {servers.length === 0 && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl py-12 text-center text-[#8b949e] font-mono text-sm">
            Sin servidores configurados
          </div>
        )}
      </div>

      {/* Test modal */}
      {testingUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setTestingUrl(null)}
        >
          <div
            className="w-full max-w-3xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[#8b949e] font-mono text-xs truncate flex-1 mr-4">{testingUrl}</p>
              <button onClick={() => setTestingUrl(null)} className="text-white p-1 hover:text-[#f85149]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-black border border-[#30363d]">
              <iframe
                src={testingUrl}
                width="100%"
                height="100%"
                allowFullScreen
                className="w-full h-full"
                title="Probar servidor"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
