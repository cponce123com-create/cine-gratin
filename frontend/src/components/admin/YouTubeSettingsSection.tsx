import { useState, useEffect } from "react";
import { KeyIcon } from "./icons";

interface Props {
  getSettings: () => Promise<Record<string, string>>;
  saveSettings: (data: { youtube_api_key: string }) => Promise<{ ok: boolean }>;
}

export default function YouTubeSettingsSection({ getSettings, saveSettings }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s["youtube_api_key"]) setApiKey(s["youtube_api_key"]);
      })
      .catch(() => {});
  }, [getSettings]);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    try {
      await saveSettings({ youtube_api_key: apiKey.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <KeyIcon />
        <h2 className="text-white font-bold text-base">API Key de YouTube</h2>
      </div>
      <p className="text-gray-500 text-sm">
        Necesitas una API Key de{" "}
        <a
          href="https://console.cloud.google.com"
          target="_blank"
          rel="noreferrer"
          className="text-brand-red hover:underline"
        >
          Google Cloud Console
        </a>{" "}
        con <strong className="text-gray-400">YouTube Data API v3</strong> habilitada.
      </p>
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIzaSy..."
          className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 text-gray-200 placeholder-gray-600 text-sm font-mono focus:outline-none focus:border-gray-500"
        />
        <button
          onClick={() => setShow((v) => !v)}
          className="px-3 text-gray-500 hover:text-gray-300 border border-brand-border rounded-lg bg-brand-surface transition-colors text-xs"
        >
          {show ? "Ocultar" : "Ver"}
        </button>
        <button
          onClick={handleSave}
          disabled={loading || !apiKey.trim()}
          className="flex items-center gap-2 bg-brand-red hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
          ) : saved ? (
            "✓ Guardada"
          ) : (
            "Guardar"
          )}
        </button>
      </div>
    </div>
  );
}
