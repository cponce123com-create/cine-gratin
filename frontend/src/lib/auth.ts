const AUTH_KEY = "cg_admin_auth";
const VALID_USERNAME = "admin";
const VALID_PASSWORD = "admin123";

export function login(username: string, password: string): boolean {
  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    localStorage.setItem(AUTH_KEY, "1");
    return true;
  }
  return false;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === "1";
}
