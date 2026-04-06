import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { runAutoImport } from "@/lib/api";
import type { RunImportResult } from "@/lib/types";

type Tab = "movies" | "series";

function extractImdbIds(text: string): string[] {
  const matches = text.match(/tt\d{7,8}/gi) ?? [];
  return [...new Set(matches.map((id) => id.toLowerCase()))];
}

function ResultCard({ result }: { result: RunImportResult }) {
  return (
    <div className="flex flex-wrap gap-6 bg-green-900/15 border border-green-800/30 rounded-xl px-5 py-4 mt-4">
      <Stat value={result.movies_imported} label="películas importadas" color="text-green-400" />
      <Stat value={result.series_imported} label="series importadas" color="text-blue-400" />
      <Stat value={result.total_checked} label="revisados" color="text-gray-300" />
    </div>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function ImportSection({ tab }: { tab: Tab }) {
  const typeLabel = tab === "movies" ? "películas" : "series";

  // ── Lista de IDs ──────────────────────────────────────────────────────────
  const [idText, setIdText] = useState("");
  const [idsRunning, setIdsRunning] = useState(false);
  const [idsResult, setIdsResult] = useState<RunImportResult | null>(null);
  const [idsError, setIdsError] = useState("");

  const extractedIds = useMemo(() => extractImdbIds(idText), [idText]);

  const handleIdsImport = async () => {
    setIdsRunning(true);
    setIdsResult(null);
    setIdsError("");
    try {
      const result = await runAutoImport();
      setIdsResult(result);
    } catch (err: unknown) {
      setIdsError(err instanceof Error ? err.message : "Error al importar.");
    } finally {
      setIdsRunning(false);
    }
  };

  // ── Auto-import TMDB ──────────────────────────────────────────────────────
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult, setAutoResult] = useState<RunImportResult | null>(null);
  const [autoError, setAutoError] = useState("");

  const handleAutoImport = async () => {
    setAutoRunning(true);
    setAutoResult(null);
    setAutoError("");
    try {
      const result = await runAutoImport();
      setAutoResult(result);
    } catch (err: unknown) {
      setAutoError(err instanceof Error ? err.message : "Error al ejecutar el auto-import.");
    } finally {
      setAutoRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Lista de IDs ── */}
      <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-1">Lista de IDs de IMDb</h2>
        <p className="text-gray-500 text-sm mb-4">
          Pega IDs de IMDb de {typeLabel} (formato{" "}
          <code className="text-gray-400 bg-brand-surface px-1 rounded text-xs">tt1234567</code>
          ), uno por línea o mezclados con texto. Se extraen automáticamente.
        </p>

        <textarea
          value={idText}
          onChange={(e) => setIdText(e.target.value)}
          rows={6}
          placeholder={
            tab === "movies"
              ? "tt0111161\ntt0068646\ntt0071562\n\nO pega cualquier texto con IDs de IMDb..."
              : "tt0903747\ntt0944947\ntt0475784\n\nO pega cualquier texto con IDs de IMDb..."
          }
          className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-3 text-gray-200 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-gray-500 transition-colors resize-y"
        />

        {/* Extracted count */}
        {idText.trim() && (
          <p className="mt-2 text-xs text-gray-500">
            {extractedIds.length === 0 ? (
              <span className="text-yellow-500">No se encontraron IDs con formato válido (tt0000000).</span>
            ) : (
              <>
                <span className="text-green-400 font-bold">{extractedIds.length}</span>{" "}
                {extractedIds.length === 1 ? "ID encontrado" : "IDs encontrados"}:{" "}
                <span className="text-gray-400">{extractedIds.slice(0, 5).join(", ")}</span>
                {extractedIds.length > 5 && (
                  <span className="text-gray-600"> y {extractedIds.length - 5} más...</span>
                )}
              </>
            )}
          </p>
        )}

        {idsError && (
          <div className="mt-3 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
            {idsError}
          </div>
        )}

        {idsResult && <ResultCard result={idsResult} />}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleIdsImport}
            disabled={idsRunning || extractedIds.length === 0}
            className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-5 rounded-lg transition-colors"
          >
            {idsRunning ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-red-300/40 border-t-white animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <UploadIcon />
                Iniciar Importación
              </>
            )}
          </button>

          {idText && (
            <button
              onClick={() => {
                setIdText("");
                setIdsResult(null);
                setIdsError("");
              }}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Auto-import TMDB ── */}
      <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
        <h2 className="text-white font-bold text-base mb-1">Auto-import TMDB</h2>
        <p className="text-gray-500 text-sm mb-5">
          Ejecuta el proceso de importación automática desde TMDB y muestra el resultado inmediatamente.
        </p>

        {autoError && (
          <div className="mb-4 bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-3 text-red-400 text-sm">
            {autoError}
          </div>
        )}

        {autoResult && <ResultCard result={autoResult} />}

        <button
          onClick={handleAutoImport}
          disabled={autoRunning}
          className="mt-4 flex items-center gap-2 bg-brand-surface border border-brand-border hover:border-gray-500 text-gray-200 hover:text-white font-bold py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50 text-sm"
        >
          {autoRunning ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-500 border-t-white animate-spin" />
              Ejecutando...
            </>
          ) : (
            <>
              <SyncIcon />
              Ejecutar auto-import
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function AdminImport() {
  const [activeTab, setActiveTab] = useState<Tab>("movies");

  const tabs: { id: Tab; label: string }[] = [
    { id: "movies", label: "Películas" },
    { id: "series", label: "Series de TV" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-black text-white">Importación Masiva</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Importa contenido por ID de IMDb o ejecuta el auto-import de TMDB.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-xl p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-card text-white border border-brand-border shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content — re-mounts each tab for independent state */}
        {activeTab === "movies" ? (
          <ImportSection key="movies" tab="movies" />
        ) : (
          <ImportSection key="series" tab="series" />
        )}
      </div>
    </AdminLayout>
  );
}

function UploadIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" strokeLinecap="round" />
      <path d="M21 3v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" strokeLinecap="round" />
      <path d="M8 16H3v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
