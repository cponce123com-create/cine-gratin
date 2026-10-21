import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UNAUTHORIZED_EVENT } from "@/lib/auth";
import "./index.css";
import App from "./App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      // Refetching on every tab focus multiplied the load on the API (and the
      // rate limiter) without any benefit for the user.
      refetchOnWindowFocus: false,
    },
  },
});

// A rejected request means the administrative session is no longer valid:
// the cached data is dropped and the user is sent back to the login screen.
if (typeof window !== "undefined") {
  window.addEventListener(UNAUTHORIZED_EVENT, () => {
    queryClient.clear();
    if (window.location.pathname.startsWith("/admin")) {
      window.location.assign("/admin/login");
    }
  });
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("No se encontró el contenedor #root");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
);
