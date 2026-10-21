import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/lib/api";
import type { ReactNode } from "react";

/**
 * Gate for the administrative area.
 *
 * The session is validated against the API (the cookie is `HttpOnly`, so the
 * only reliable check is a request). While the check is in progress a neutral
 * loader is shown instead of redirecting, which avoids a flash of the login
 * screen for users with a valid session.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-session"],
    queryFn: getSession,
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <span className="w-8 h-8 rounded-full border-2 border-white/20 border-t-brand-red animate-spin" />
          <span className="text-gray-400 text-sm">Comprobando sesión…</span>
        </div>
      </div>
    );
  }

  if (!data?.authenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}
