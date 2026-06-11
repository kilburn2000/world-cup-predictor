import { useEffect, useState, type ReactNode } from "react";
import { login, checkAuth } from "../auth.js";

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fl-enter mx-auto max-w-sm">
      <div className="mb-1 text-center text-[11px] uppercase tracking-[2px] text-gold">Admin</div>
      <h1 className="text-center font-display text-3xl font-medium text-cream">Sign in</h1>
      <p className="mx-auto mb-6 mt-2 max-w-xs text-center text-sm leading-relaxed text-muted">
        The admin area is restricted. Sign in to manage entrants and scoring.
      </p>
      <form onSubmit={submit} className="fl-card flex flex-col gap-4 p-6">
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-muted">Email</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus className="fl-input" placeholder="you@example.com" />
        </div>
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-muted">Password</div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="fl-input" placeholder="••••••••" />
        </div>
        <button type="submit" disabled={busy || !email || !password} className="btn-gold py-3 text-sm">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-center text-[13px] text-down">{error}</p>}
      </form>
    </div>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuth().then(setAuthed);
  }, []);

  if (authed === null)
    return <p className="font-mono text-sm uppercase tracking-widest text-muted">Checking…</p>;
  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />;
  return <>{children}</>;
}
