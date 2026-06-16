import { Component, type ErrorInfo, type ReactNode } from "react";
import { BASE_URL } from "@/lib/api";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/** Report error to backend silently (fire-and-forget) */
function reportError(error: Error, info: ErrorInfo): void {
  try {
    const payload = {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      url: location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    // Fire-and-forget — no need to await
    fetch(`${BASE_URL}/api/log-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // Silently fail — we don't want error reporting to cause more errors
  }
  console.error("[ErrorBoundary]", error, info.componentStack);
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info);
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-brand-dark flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-16 h-16 rounded-full bg-brand-red/20 flex items-center justify-center">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-white">Algo salió mal</h1>
          <p className="text-sm text-gray-400 max-w-md text-center">
            Ocurrió un error inesperado. Probá recargar la página.
          </p>
          <pre className="text-xs text-red-400 bg-black/30 p-4 rounded-lg max-w-lg overflow-auto mt-2">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-brand-red text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Recargar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
