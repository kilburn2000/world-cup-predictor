import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { sql } from "./db/index.js";

// Password hashing: scrypt with a per-password salt, stored as "salt:hash" hex
// (same scheme as the old admin login, so existing hashes keep working).
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const h = Buffer.from(hash, "hex");
  const derived = scryptSync(password, salt, h.length);
  return derived.length === h.length && timingSafeEqual(derived, h);
}

export const SESSION_COOKIE = "wc_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: number;
  entrantId: number | null;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await sql`
    insert into sessions (token, user_id, expires_at)
    values (${token}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))
  `;
  return token;
}

export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await sql`
    select u.id, u.entrant_id as "entrantId", e.name, u.email, u.is_admin as "isAdmin"
    from sessions s
    join users u on u.id = s.user_id
    left join entrants e on e.id = u.entrant_id
    where s.token = ${token} and s.expires_at > now()
  `;
  return (row as SessionUser) ?? null;
}

export async function deleteSession(token: string | undefined) {
  if (token) await sql`delete from sessions where token = ${token}`;
}

// Verify email + password; on success start a session and return its token.
export async function loginByEmail(email: string, password: string): Promise<string | null> {
  const [u] = await sql`select id, password_hash from users where lower(email) = lower(${email})`;
  if (!u || !verifyPassword(password, (u as any).password_hash)) return null;
  return createSession((u as any).id);
}
