/**
 * Administrative session handling.
 *
 * The session lives in an `HttpOnly` cookie set by the API, so the token is
 * not reachable from JavaScript: an XSS injection cannot exfiltrate it. The
 * browser sends it automatically on every request (same-origin deployments
 * need no CORS changes; cross-origin ones must use `credentials: "include"`).
 *
 * The token is never stored in `localStorage` and never placed in a URL.
 */

export const BASE_URL =
  (import.meta.env["VITE_API_URL"] as string | undefined) || "https://cine-gratin.onrender.com";

/** Fired when the API rejects a request because the session is not valid. */
export const UNAUTHORIZED_EVENT = "cg:unauthorized";

function emitUnauthorized(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
}

/** Notifies the application that the session is no longer valid. */
export function notifyUnauthorized(): void {
  emitUnauthorized();
}

export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
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
        return { ok: false, error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
      }
      if (res.status === 401) {
        return { ok: false, error: data.error ?? "Usuario o contraseña incorrectos." };
      }
      return { ok: false, error: data.error ?? "No se pudo iniciar sesión." };
    }

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
    });
  } catch {
    // Even if the server is unreachable the local session is dropped.
  }
}

/** Asks the API whether the current browser session is valid. */
export async function fetchSession(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}
