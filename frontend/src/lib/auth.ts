const AUTH_KEY = "cg_admin_token";
const BASE_URL = import.meta.env["VITE_API_URL"] as string || "https://cine-gratin.onrender.com";

export async function login(
  _username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Contraseña incorrecta" };
    }

    const data = (await res.json()) as { ok: boolean; token?: string };
    if (data.ok && data.token) {
      localStorage.setItem(AUTH_KEY, data.token);
    } else if (data.ok) {
      // Backend running without ADMIN_SECRET — store a placeholder
      localStorage.setItem(AUTH_KEY, "authenticated");
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar al servidor" };
  }
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem(AUTH_KEY);
  return !!token && token.length > 0;
}

export function getToken(): string | null {
  return localStorage.getItem(AUTH_KEY);
}
