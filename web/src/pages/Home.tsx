import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { login, useMe } from "../auth.js";
import EntrantSummary from "../components/EntrantSummary.js";
import Loader from "../components/Loader.js";

export default function Home() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  if (isLoading)
    return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;

  // Pulsating crest overlay while we sign in and swap in the dashboard.
  if (signingIn) return <Loader label="Signing you in" />;

  // Signed in with an entrant: their personalised dashboard.
  if (me?.entrantId) {
    return (
      <div className="fl-enter">
        <EntrantSummary id={me.entrantId} />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 sm:justify-start">
          <Link to={`/entrant/${me.entrantId}`} className="btn-gold px-4 py-2 text-sm">View my full predictions</Link>
          <Link to="/standings/overall" className="text-sm text-muted hover:text-cream">Live standings →</Link>
        </div>
      </div>
    );
  }

  // Signed in but no entrant linked (rare): nudge onward.
  if (me) {
    return (
      <div className="fl-enter mx-auto max-w-sm text-center">
        <h1 className="font-display text-2xl text-cream">You’re signed in</h1>
        <p className="mt-2 text-sm text-muted">Your account isn’t linked to an entrant yet.</p>
        <Link to="/standings/overall" className="btn-gold mt-5 inline-block px-4 py-2 text-sm">Go to live standings</Link>
      </div>
    );
  }

  // Signed out: login form with a personalisation pitch.
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSigningIn(true);
    try {
      await login(email.trim(), password);
      await qc.invalidateQueries({ queryKey: ["me"] });
      // Hold the loader a beat so the transition reads as a deliberate sign-in,
      // not an instant flicker. By the time it clears, `me` (and the dashboard)
      // are loaded underneath.
      setTimeout(() => setSigningIn(false), 3000);
    } catch (err: any) {
      setError(err.message);
      setSigningIn(false);
    }
  }

  return (
    <div className="fl-enter mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center">
      <img src="/whiteys-crest.png" alt="" className="mb-5 h-44 w-44 shrink-0 object-contain" />
      <h1 className="text-balance text-center font-display text-3xl font-medium text-cream">Welcome to Whitey’s World Cup 2026 Sweepstake</h1>
      <p className="mx-auto mb-6 mt-2 max-w-md text-pretty text-center text-sm leading-relaxed text-muted">
        Sign in to see your personalised dashboard - your points, prize money won, position in every
        competition and your top-scorer picks. You can still browse the standings and stats without signing in.
      </p>
      <form onSubmit={submit} className="fl-card mx-auto flex w-full max-w-sm flex-col gap-4 p-6">
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-muted">Email</div>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus className="fl-input" placeholder="you@example.com" />
        </div>
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-muted">Password</div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="fl-input" placeholder="••••••••" />
        </div>
        <button type="submit" disabled={signingIn || !email || !password} className="btn-gold py-3 text-sm">
          {signingIn ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-center text-[13px] text-down">{error}</p>}
        <a href="mailto:[redacted]?subject=World%20Cup%20password%20reset" className="text-center text-[12px] text-muted hover:text-cream">
          Forgot your password?
        </a>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/standings/overall" className="text-gold hover:underline">Browse the standings →</Link>
      </p>
    </div>
  );
}
