import { useQuery } from "@tanstack/react-query";

// Session auth: the server sets an httpOnly cookie on login (same-origin, so the
// browser sends it automatically). We just ask "who am I?" via /api/me.
export interface Me {
  id: number;
  entrantId: number | null;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
}

export const useMe = () =>
  useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const res = await fetch("/api/me");
      if (!res.ok) return null;
      const d = await res.json();
      return (d.user ?? null) as Me | null;
    },
    staleTime: 60_000,
  });

export async function login(email: string, password: string): Promise<Me> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || "Login failed");
  }
  return (await res.json()).user as Me;
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}

// Back-compat: admin API helpers still pass an x-admin-token header; the server
// now ignores it and authorises via the session cookie. No token to store.
export const getToken = () => "";
