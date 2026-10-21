/**
 * Administrative session handling.
 *
 * The session lives in an `HttpOnly` cookie set by the API, so the token is
 * not reachable from JavaScript: an XSS injection cannot exfiltrate it. The
 * browser sends it automatically on every request (same-origin deployments
 * need no CORS changes; cross-origin ones must use `credentials: "include"`).
 *
 * The token is never stored in `localStorage` and never placed in a URL.
 *
 * On top of the cookie, the session carries a CSRF token (see
 * `backend/src/lib/csrf.ts`). It is kept in memory and echoed in the
 * `X-CSRF-Token` header on every state-changing request, so another site
 * cannot make the browser perform an authenticated action.
 */

export const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) || "https://cine-gratin.onrender.com";

/** Fired when the API rejects a request because the session is not valid. */
export const UNAUTHORIZED_EVENT = "cg:unauthorized";

let csrfToken: string | null = null;

/** Returns the CSRF token of the current session (in memory only). */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/** Stores the CSRF token of the current session. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

function emitUnauthorized(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
}

/** Notifies the application that the session is no longer valid. */
export function notifyUnauthorized(): void {
  setCsrfToken(null);
  emitUnauthorized();
}

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 429) {
        return {
          ok: false,
          error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
        };
      }
      if (res.status === 401) {
        return { ok: false, error: data.error ?? "Usuario o contraseña incorrectos." };
      }
      return { ok: false, error: data.error ?? "No se pudo iniciar sesión." };
    }

    const data = (await res.json()) as { ok: boolean; csrfToken?: string };
    setCsrfToken(data.csrfToken ?? null);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor" };
  }
}

/** Ends the session on the server (the cookie is cleared) and locally. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
    });
  } catch {
    // Even if the server is unreachable the local session is dropped.
  } finally {
    setCsrfToken(null);
  }
}

export interface SessionState {
  authenticated: boolean;
  csrfToken?: string;
}

/** Asks the API whether the current browser session is valid. */
export async function fetchSession(): Promise<SessionState> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      setCsrfToken(null);
      return { authenticated: false };
    }
    const data = (await res.json()) as { authenticated?: boolean; csrfToken?: string };
    setCsrfToken(data.csrfToken ?? null);
    return { authenticated: Boolean(data.authenticated), csrfToken: data.csrfToken };
  } catch {
    setCsrfToken(null);
    return { authenticated: false };
  }
}

/**
 * Returns the CSRF token, fetching the session if it is not known yet.
 * Used right before a mutating request so the header is never missing.
 */
export async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken;
  const session = await fetchSession();
  return session.csrfToken ?? null;
}
