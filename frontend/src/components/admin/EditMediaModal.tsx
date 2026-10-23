import { useEffect, useRef, useState, type FormEvent } from "react";
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

interface FormState {
  title: string;
  year: string;
  synopsis: string;
  genres: string;
  poster_url: string;
  background_url: string;
  featured: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const emptyForm: FormState = {
  title: "",
  year: "",
  synopsis: "",
  genres: "",
  poster_url: "",
  background_url: "",
  featured: false,
};

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.title.trim()) errors.title = "El título es obligatorio.";
  if (
    form.year &&
    (!/^\d{4}$/.test(form.year.trim()) || Number(form.year) < 1870 || Number(form.year) > 2100)
  ) {
    errors.year = "Introduce un año válido (entre 1870 y 2100).";
  }
  if (form.poster_url && !/^https?:\/\//i.test(form.poster_url.trim())) {
    errors.poster_url = "La URL debe empezar por http:// o https://.";
  }
  if (form.background_url && !/^https?:\/\//i.test(form.background_url.trim())) {
    errors.background_url = "La URL debe empezar por http:// o https://.";
  }
  return errors;
}

/**
 * Edition dialog for a catalogue entry.
 *
 * Only the fields an administrator may edit are sent back to the API: the rest
 * of the entry (views, ids, import flags…) is preserved server-side.
 */
export default function EditMediaModal({ item, type, onClose, onSaved }: EditMediaModalProps) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!item) return;
    setForm({
      title: item.title ?? "",
      year: item.year ? String(item.year) : "",
      synopsis: item.synopsis ?? "",
      genres: item.genres?.join(", ") ?? "",
      poster_url: item.poster_url ?? "",
      background_url: item.background_url ?? "",
      featured: Boolean(item.featured),
    });
    setErrors({});
  }, [item]);

  useEffect(() => {
    if (!item) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [item, onClose]);

  if (!item) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        id: String(item.id),
        title: form.title.trim(),
        year: form.year ? Number(form.year) : undefined,
        synopsis: form.synopsis,
        genres: form.genres
          .split(",")
          .map((genre) => genre.trim())
          .filter(Boolean),
        poster_url: form.poster_url.trim(),
        background_url: form.background_url.trim(),
        featured: form.featured,
      };

      if (type === "movie") {
        await saveMovie(payload as Partial<Movie>);
      } else {
        await saveSeries(payload as Partial<Series>);
      }

      toast.success("Cambios guardados correctamente");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (invalid?: string) =>
    `w-full bg-brand-dark border rounded-lg px-3 py-2 text-white outline-none transition-colors focus:ring-2 focus:ring-brand-red ${
      invalid ? "border-red-500" : "border-brand-border"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-media-title"
        className="bg-brand-card border border-brand-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between bg-brand-dark/50">
          <h2 id="edit-media-title" className="text-xl font-bold text-white">
            Editar {type === "movie" ? "película" : "serie"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-gray-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-red rounded p-1"
          >
            <X className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>

        <form
          id="edit-media-form"
          onSubmit={handleSubmit}
          noValidate
          className="flex-1 overflow-y-auto p-6 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-title" className="text-xs font-bold text-gray-400 uppercase">
                Título
              </label>
              <input
                id="edit-title"
                ref={titleRef}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? "edit-title-error" : undefined}
                className={fieldClass(errors.title)}
              />
              {errors.title && (
                <p id="edit-title-error" role="alert" className="text-xs text-red-400">
                  {errors.title}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-year" className="text-xs font-bold text-gray-400 uppercase">
                Año
              </label>
              <input
                id="edit-year"
                type="number"
                inputMode="numeric"
                value={form.year}
                onChange={(event) => setForm({ ...form, year: event.target.value })}
                aria-invalid={Boolean(errors.year)}
                aria-describedby={errors.year ? "edit-year-error" : undefined}
                className={fieldClass(errors.year)}
              />
              {errors.year && (
                <p id="edit-year-error" role="alert" className="text-xs text-red-400">
                  {errors.year}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-synopsis" className="text-xs font-bold text-gray-400 uppercase">
              Sinopsis
            </label>
            <textarea
              id="edit-synopsis"
              rows={4}
              value={form.synopsis}
              onChange={(event) => setForm({ ...form, synopsis: event.target.value })}
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-brand-red resize-none"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="edit-genres" className="text-xs font-bold text-gray-400 uppercase">
              Géneros (separados por coma)
            </label>
            <input
              id="edit-genres"
              value={form.genres}
              onChange={(event) => setForm({ ...form, genres: event.target.value })}
              className="w-full bg-brand-dark border border-brand-border rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-brand-red"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="edit-poster" className="text-xs font-bold text-gray-400 uppercase">
                URL del póster
              </label>
              <input
                id="edit-poster"
                value={form.poster_url}
                onChange={(event) => setForm({ ...form, poster_url: event.target.value })}
                aria-invalid={Boolean(errors.poster_url)}
                aria-describedby={errors.poster_url ? "edit-poster-error" : undefined}
                className={fieldClass(errors.poster_url)}
              />
              {errors.poster_url && (
                <p id="edit-poster-error" role="alert" className="text-xs text-red-400">
                  {errors.poster_url}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="edit-background" className="text-xs font-bold text-gray-400 uppercase">
                URL del fondo
              </label>
              <input
                id="edit-background"
                value={form.background_url}
                onChange={(event) => setForm({ ...form, background_url: event.target.value })}
                aria-invalid={Boolean(errors.background_url)}
                aria-describedby={errors.background_url ? "edit-background-error" : undefined}
                className={fieldClass(errors.background_url)}
              />
              {errors.background_url && (
                <p id="edit-background-error" role="alert" className="text-xs text-red-400">
                  {errors.background_url}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-brand-dark/30 rounded-xl border border-brand-border">
            <input
              type="checkbox"
              id="edit-featured"
              checked={form.featured}
              onChange={(event) => setForm({ ...form, featured: event.target.checked })}
              className="w-5 h-5 rounded border-brand-border text-brand-red focus:ring-brand-red bg-brand-dark"
            />
            <label htmlFor="edit-featured" className="text-sm font-medium text-white cursor-pointer">
              Contenido destacado (aparece en el carrusel principal)
            </label>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-brand-border bg-brand-dark/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-red rounded px-4"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="edit-media-form"
            disabled={saving}
            className="flex items-center gap-2 bg-brand-red hover:bg-red-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="w-4 h-4" aria-hidden="true" />
            )}
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
