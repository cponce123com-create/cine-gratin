import { useState, useEffect } from "react";
import { Settings, Save, Upload, Download, Eye, EyeOff } from "lucide-react";
import { DEFAULT_SETTINGS, type AdminSettings } from "@/lib/admin-db";
import { apiGetSettings, apiSaveSettings, apiGetMovies, apiChangePassword, apiSaveMovie } from "@/lib/api-client";
import { toast } from "sonner";

export function AdminSettings() {
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  const [showPass, setShowPass] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  useEffect(() => {
    apiGetSettings().then(setSettings).catch(() => {});
  }, []);

  const save = async () => {
    await apiSaveSettings(settings);
    toast.success("Configuración guardada");
  };

  const handlePasswordChange = async () => {
    if (!newPass) {
      toast.error("La contraseña no puede estar vacía");
      return;
    }
    if (newPass !== confirmPass) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    await apiChangePassword(newPass);
    setNewPass("");
    setConfirmPass("");
    toast.success("Contraseña actualizada");
  };

  const exportDB = async () => {
    const movies = await apiGetMovies();
    const blob = new Blob([JSON.stringify(movies, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cinevault_peliculas_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Base de datos exportada");
  };

  const importDB = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (!Array.isArray(data)) {
            toast.error("Formato de archivo inválido");
            return;
          }
          for (const movie of data) {
            await apiSaveMovie(movie);
          }
          toast.success(`${data.length} películas importadas`);
        } catch {
          toast.error("Error al leer el archivo JSON");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    type = "text",
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
  }) => (
    <div>
      <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none placeholder:text-[#484f58]"
      />
    </div>
  );

  const Toggle = ({
    label,
    description,
    checked,
    onChange,
  }: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[#21262d] last:border-0">
      <div>
        <p className="text-[#c9d1d9] text-sm font-medium">{label}</p>
        <p className="text-[#8b949e] text-xs mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? "bg-[#238636]" : "bg-[#30363d]"
        }`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#c9d1d9] mb-1">Configuración</h1>
        <p className="text-[#8b949e] text-sm">Configura tu panel de administración CineVault</p>
      </div>

      {/* General */}
      <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d] flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#238636]" />
          <h2 className="text-[#c9d1d9] font-bold text-sm">General</h2>
        </div>
        <div className="p-5 space-y-4">
          <Field
            label="Nombre del Sitio"
            value={settings.site_name}
            onChange={v => setSettings(s => ({ ...s, site_name: v }))}
            placeholder="CineVault"
          />
          <Field
            label="URL del Logo"
            value={settings.site_logo}
            onChange={v => setSettings(s => ({ ...s, site_logo: v }))}
            placeholder="https://ejemplo.com/logo.png"
          />
          <div>
            <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Orden Predeterminado</label>
            <select
              value={settings.default_sort}
              onChange={e => setSettings(s => ({ ...s, default_sort: e.target.value }))}
              className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none"
            >
              <option value="date_added">Fecha de Adición</option>
              <option value="rating">Puntuación</option>
              <option value="year">Año</option>
              <option value="title">Título</option>
              <option value="download_count">Descargas</option>
            </select>
          </div>
          <div>
            <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Película Destacada (ID de IMDb)</label>
            <input
              value={settings.featured_movie_id}
              onChange={e => setSettings(s => ({ ...s, featured_movie_id: e.target.value }))}
              placeholder="tt0111161"
              className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none"
            />
            <p className="text-[#8b949e] text-xs mt-1 font-mono">Esta película aparece en el banner de inicio</p>
          </div>
          <button
            onClick={save}
            className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
          >
            <Save className="w-4 h-4" />
            Guardar Configuración
          </button>
        </div>
      </section>

      {/* Content toggles */}
      <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d]">
          <h2 className="text-[#c9d1d9] font-bold text-sm">Fuentes de Contenido</h2>
        </div>
        <div className="px-5">
          <Toggle
            label="Mostrar películas de API externa"
            description="Mostrar películas de APIs externas en el catálogo público"
            checked={settings.show_yts_movies}
            onChange={v => setSettings(s => ({ ...s, show_yts_movies: v }))}
          />
          <Toggle
            label="Mostrar películas locales"
            description="Mostrar películas añadidas manualmente en el catálogo público"
            checked={settings.show_local_movies}
            onChange={v => setSettings(s => ({ ...s, show_local_movies: v }))}
          />
          <Toggle
            label="Combinar ambas fuentes"
            description="Combinar películas locales y externas (las locales tienen prioridad en duplicados)"
            checked={settings.merge_sources}
            onChange={v => setSettings(s => ({ ...s, merge_sources: v }))}
          />
        </div>
        <div className="px-5 py-4 border-t border-[#30363d]">
          <button
            onClick={save}
            className="flex items-center gap-2 bg-[#238636] hover:bg-[#2ea043] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
          >
            <Save className="w-4 h-4" />
            Guardar
          </button>
        </div>
      </section>

      {/* Password */}
      <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d]">
          <h2 className="text-[#c9d1d9] font-bold text-sm">Cambiar Contraseña</h2>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Nueva Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Nueva contraseña"
                className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 pr-10 py-2.5 text-sm font-mono outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute inset-y-0 right-3 flex items-center text-[#8b949e] hover:text-[#c9d1d9]"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[#8b949e] text-xs font-mono uppercase tracking-wider mb-1.5">Confirmar Contraseña</label>
            <input
              type="password"
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Confirmar nueva contraseña"
              className="w-full bg-[#0d1117] border border-[#30363d] focus:border-[#238636] text-[#c9d1d9] rounded-lg px-3 py-2.5 text-sm font-mono outline-none"
            />
          </div>
          <button
            onClick={handlePasswordChange}
            className="bg-[#238636] hover:bg-[#2ea043] text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
          >
            Actualizar Contraseña
          </button>
        </div>
      </section>

      {/* Database */}
      <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#30363d]">
          <h2 className="text-[#c9d1d9] font-bold text-sm">Base de Datos</h2>
        </div>
        <div className="p-5 flex flex-wrap gap-3">
          <button
            onClick={exportDB}
            className="flex items-center gap-2 bg-[#58a6ff]/10 hover:bg-[#58a6ff]/20 border border-[#58a6ff]/30 text-[#58a6ff] px-5 py-2.5 rounded-lg text-sm font-bold transition-colors"
            data-testid="btn-export-db"
          >
            <Download className="w-4 h-4" />
            Exportar JSON
          </button>
          <button
            onClick={importDB}
            className="flex items-center gap-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] px-5 py-2.5 rounded-lg text-sm font-bold transition-colors border border-[#30363d]"
            data-testid="btn-import-db"
          >
            <Upload className="w-4 h-4" />
            Importar JSON
          </button>
        </div>
      </section>
    </div>
  );
}
