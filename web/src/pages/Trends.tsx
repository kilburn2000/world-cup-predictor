import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLeaderboard } from "../api.js";

function Spark({ series }: { series: number[] }) {
  if (!series || series.length < 2) return <div className="h-[26px] w-[120px]" />;
  const n = series.length;
  const lo = Math.min(...series);
  const hi = Math.max(...series);
  const span = Math.max(1, hi - lo);
  const pts = series
    .map((r, i) => `${((i / (n - 1)) * 120).toFixed(1)},${(((r - lo) / span) * 20 + 3).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="120" height="26" viewBox="0 0 120 26">
      <polyline points={pts} style={{ stroke: "#c9a86a", fill: "none", strokeWidth: 1.5, opacity: 0.85 }} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function Trends() {
  const { data, isLoading, error } = useLeaderboard();

  const ranked = useMemo(() => (data ?? []).map((r, i) => ({ ...r, rank: r.rank ?? i + 1 })), [data]);
  const hasMovement = useMemo(
    () => ranked.some((r) => (r.spark && r.spark.length >= 2) || (r.move ?? 0) !== 0),
    [ranked],
  );
  const movers = useMemo(
    () => [...ranked].filter((r) => (r.move ?? 0) !== 0).sort((a, b) => Math.abs(b.move ?? 0) - Math.abs(a.move ?? 0)).slice(0, 5),
    [ranked],
  );

  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load trends.</p>;

  return (
    <div className="fl-enter">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Form &amp; momentum</div>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">Trends</h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
          How everyone’s rank is moving as results come in — biggest movers and each entrant’s form line.
        </p>
      </div>

      {!hasMovement ? (
        <div className="fl-card px-7 py-14 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-line text-2xl text-muted">↗</div>
          <div className="font-display text-2xl text-cream">No movement yet</div>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
            Rank movements and form lines will appear here once matches are scored. Everyone’s level
            at the moment.
          </p>
        </div>
      ) : (
        <>
          {movers.length > 0 && (
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {movers.map((m) => (
                <Link key={m.entrantId} to={`/entrant/${m.entrantId}`} className="fl-card p-4 transition-colors hover:border-gold">
                  <div className="font-mono text-xs" style={{ color: (m.move ?? 0) > 0 ? "#6bbf86" : "#d9926a" }}>
                    {(m.move ?? 0) > 0 ? `▲ ${m.move}` : `▼ ${Math.abs(m.move ?? 0)}`}
                  </div>
                  <div className="mt-1 truncate font-display text-lg text-cream">{m.name}</div>
                  <div className="font-mono text-[11px] text-muted">now {m.rank}{m.rank === 1 ? "st" : "th"}</div>
                </Link>
              ))}
            </div>
          )}

          <div className="fl-card overflow-hidden">
            {ranked.map((r) => (
              <Link key={r.entrantId} to={`/entrant/${r.entrantId}`} className="grid grid-cols-[40px_1fr_120px_70px] items-center border-t border-line px-5 py-3 transition-colors first:border-t-0 hover:bg-gold-soft">
                <div className="font-mono text-sm text-muted">{r.rank}</div>
                <div className="text-[14.5px] text-cream">{r.name}</div>
                <div className="flex justify-center"><Spark series={r.spark ?? []} /></div>
                <div className="text-right font-mono text-sm text-cream">{r.total}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
