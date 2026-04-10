import { useState, useEffect } from "react";
import { X, Loader2, Save } from "lucide-react";
import type { Movie, Series } from "@/lib/types";
import { saveMovie, saveSeries } from "@/lib/api";
import { toast } from "sonner";

interface EditMediaModalProps {
  item: Movie | Series | null;
  type: "movie" | "series";
  onClose: () => void;
  onSaved: () => void;
}

export default function EditMediaModal({ item, type, onClose, onSaved }: EditMediaModalProps) {
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setForm({
        ...item,
        genres: item.genres?.join(", ") || "",
      });
    }
  }, [item]);

  if (!item || !form) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        ...form,
        genres: form.genres.split(",").map((g: string) => g.trim()).filter(Boolean),
      };

      if (type === "movie") {
        await saveMovie(data);
      } else {
        await saveSeries(data);
      }

      toast.success("Cambios guardados correctamente");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-brand-card border border-brand-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-dark/50">
          <h2 className="text-xl font-bold text-white">
            Editar {type === "movie" ? "Película" : "Serie"}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Título</label>
              <input
                required
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:border-brand-red"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Año</label>
              <input
                type="number"
                value={form.year || ""}
                onChange={e => setForm({ ...form, year: parseInt(e.target.value) })}
                className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:border-brand-red"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Sinopsis</label>
            <textarea
              rows={4}
              value={form.synopsis || ""}
              onChange={e => setForm({ ...form, synopsis: e.target.value })}
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:border-brand-red resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Géneros (separados por coma)</label>
            <input
              value={form.genres}
              onChange={e => setForm({ ...form, genres: e.target.value })}
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:border-brand-red"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">URL del Póster</label>
              <input
                value={form.poster_url || ""}
                onChange={e => setForm({ ...form, poster_url: e.target.value })}
                className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:border-brand-red"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">URL del Fondo</label>
              <input
                value={form.background_url || ""}
                onChange={e => setForm({ ...form, background_url: e.target.value })}
                className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:border-brand-red"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-brand-dark/30 rounded-xl border border-brand-border">
            <input
              type="checkbox"
              id="featured"
              checked={form.featured || false}
              onChange={e => setForm({ ...form, featured: e.target.checked })}
              className="w-5 h-5 rounded border-brand-border text-brand-red focus:ring-brand-red bg-brand-dark"
            />
            <label htmlFor="featured" className="text-sm font-medium text-white cursor-pointer">
              Contenido destacado (aparece en el carrusel principal)
            </label>
          </div>

          {/* Saga / collection */}
          <div className="border border-brand-border rounded-xl p-4 space-y-3 bg-brand-dark/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Saga / Colección</span>
              {(form.collection_id || form.collection_name) && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, collection_id: null, collection_name: "" })}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Quitar de saga
                </button>
              )}
              {form.collection_id !== -1 && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, collection_id: -1, collection_name: "" })}
                  className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors ml-2"
                  title="Excluir definitivamente de todas las sagas (no aparecerá por keywords)"
                >
                  Excluir de sagas
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">ID TMDB</label>
                <input
                  type="number"
                  value={form.collection_id ?? ""}
                  onChange={e => setForm({ ...form, collection_id: e.target.value !== "" ? parseInt(e.target.value) : null })}
                  placeholder="Ej: 1241"
                  className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-red"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-gray-500">Nombre de la saga</label>
                <input
                  value={form.collection_name || ""}
                  onChange={e => setForm({ ...form, collection_name: e.target.value })}
                  placeholder="Nombre (opcional)"
                  className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-brand-red"
                />
              </div>
            </div>
            {form.collection_id === -1 && (
              <p className="text-xs text-yellow-500/80">Esta película está excluida de todas las sagas.</p>
            )}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-brand-border bg-brand-dark/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
