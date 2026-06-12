import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { login, useMe } from "../auth.js";

export default function Login() {
  const navigate = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const { data: me, isLoading } = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (loc.state as { from?: string } | null)?.from ?? "/";

  if (!isLoading && me) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fl-enter mx-auto max-w-sm">
      <h1 className="text-center font-display text-3xl font-medium text-cream">Sign in</h1>
      <p className="mx-auto mb-6 mt-2 max-w-xs text-pretty text-center text-sm leading-relaxed text-muted">
        Sign in to see your predictions and points across the site.
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
