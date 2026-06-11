// Admin auth. Login exchanges email+password for the session token, which is
// stored in localStorage and sent as x-admin-token on admin requests.
const KEY = "wc_admin_token";

export const getToken = () => localStorage.getItem(KEY) ?? "";

export function logout() {
  localStorage.removeItem(KEY);
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || "Login failed");
  }
  const { token } = await res.json();
  localStorage.setItem(KEY, token);
}

export async function checkAuth(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const r = await fetch("/api/admin/check", { headers: { "x-admin-token": token } });
    return r.ok;
  } catch {
    return false;
  }
}
