import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEntrantTrend, type TrendPoint } from "../api.js";
import { flagFor } from "../flags.js";
import PointsPill from "./PointsPill.js";
import ScoredChips from "./ScoredChips.js";

// Plot geometry. STEP is the horizontal gap between games (the plot scrolls
// sideways once they don't fit); rank maps onto the vertical axis, 1st at top.
const PAD_X = 14;
const H = 240;
const PAD_TOP = 22;
const PAD_BOT = 22;

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// A modal plotting an entrant's position over time for one competition: a line of
// their rank after each finished game, every node a form-style points chip whose
// hover reveals that game. Scrolls horizontally for a full tournament of games.
export default function TrendModal({ entrantId, entrantName, scope, scopeLabel, onClose }: {
  entrantId: number; entrantName: string; scope: string; scopeLabel: string; onClose: () => void;
}) {
  const { data, isLoading } = useEntrantTrend(entrantId, scope, true);
  const [tip, setTip] = useState<{ p: TrendPoint; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [availW, setAvailW] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Measure the visible plot area so the chart can fill it (and only scroll once
  // there are too many games to fit at the minimum spacing).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setAvailW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const pts = data?.points ?? [];
  const N = Math.max(1, data?.fieldSize ?? 1);
  // Spread the games to fill the available width, but clamped to [floor, ceiling]:
  // a long run (overall) packs tight and scrolls; a sparse run (knockout, top
  // scorer) sits left-aligned at a comfortable spacing and grows rightward as more
  // games are played, rather than stretching to fill or bunching up.
  const avail = availW || 640;
  const STEP = pts.length > 1 ? Math.min(52, Math.max(16, (avail - PAD_X * 2) / (pts.length - 1))) : 52;
  const yScale = H - PAD_TOP - PAD_BOT;
  const x = (i: number) => PAD_X + i * STEP;
  const y = (rank: number) => PAD_TOP + (N <= 1 ? yScale / 2 : ((rank - 1) / (N - 1)) * yScale);
  const plotW = Math.max(PAD_X * 2 + Math.max(0, pts.length - 1) * STEP, 220);
  const line = pts.map((p, i) => `${x(i)},${y(p.rank)}`).join(" ");
  const last = pts[pts.length - 1];
  // rank gridlines: top, 10th/20th/30th (where they exist) and the field floor
  const ticks = [1, 10, 20, 30, N].filter((r, i, a) => r <= N && a.indexOf(r) === i);
  // contiguous runs of the same phase, to draw week/round breaks + labels
  const runs: { phase: string; start: number; end: number }[] = [];
  pts.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.phase === p.phase) last.end = i;
    else runs.push({ phase: p.phase, start: i, end: i });
  });

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="fl-card relative z-10 w-full max-w-3xl overflow-hidden bg-pitch-900 fl-enter" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[1.5px] text-gold">{scopeLabel} · Position trend</div>
            <div className="truncate font-display text-xl text-cream">{entrantName}</div>
          </div>
          {last && (
            <div className="shrink-0 text-right">
              <div className="text-[10px] uppercase tracking-[1.5px] text-muted">Current</div>
              <div className="font-mono text-lg text-cream">{ordinal(last.rank)}<span className="text-muted"> / {N}</span></div>
            </div>
          )}
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-gold hover:text-cream">✕</button>
        </div>

        {/* chart */}
        {isLoading ? (
          <div className="px-5 py-16 text-center font-mono text-sm uppercase tracking-widest text-muted">Loading…</div>
        ) : pts.length === 0 ? (
          <div className="px-5 py-16 text-center text-[13px] text-muted">No finished games in this competition yet.</div>
        ) : (
          <>
            <div className="flex pl-4 pt-3">
              {/* fixed rank axis: a 'Rank' caption then the tick numbers */}
              <div className="relative shrink-0 self-stretch" style={{ width: 14 }}>
                <div className="absolute left-1/2 top-1/2 origin-center -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap text-[9px] uppercase tracking-[1.5px] text-muted">Rank</div>
              </div>
              <div className="relative shrink-0" style={{ width: 26, height: H }}>
                {ticks.map((r) => (
                  <div key={r} className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-muted" style={{ top: y(r) }}>{r}</div>
                ))}
              </div>
              {/* scrollable plot */}
              <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto pb-2 pr-5">
                <div className="relative" style={{ width: plotW, height: H }}>
                  <svg width={plotW} height={H} className="absolute inset-0">
                    {/* rank gridlines (10th / 20th / 30th etc.) */}
                    {ticks.map((r) => (
                      <line key={r} x1={0} y1={y(r)} x2={plotW} y2={y(r)} stroke="rgba(201,168,106,0.22)" />
                    ))}
                    {/* week/round break lines */}
                    {runs.slice(1).map((run, k) => {
                      const bx = (x(runs[k].end) + x(run.start)) / 2;
                      return <line key={run.start} x1={bx} y1={PAD_TOP - 8} x2={bx} y2={H - PAD_BOT + 8} stroke="rgba(201,168,106,0.55)" strokeDasharray="3 3" />;
                    })}
                    <polyline points={line} fill="none" stroke="var(--color-gold)" strokeWidth={1.25} strokeOpacity={0.38} />
                  </svg>
                  {/* phase labels above each run (only when more than one phase) */}
                  {runs.length > 1 && runs.map((run) => (
                    <div key={run.start} className="absolute -translate-x-1/2 whitespace-nowrap text-[8px] uppercase tracking-[1px] text-muted" style={{ left: Math.min(Math.max((x(run.start) + x(run.end)) / 2, 24), plotW - 24), top: 1 }}>{run.phase}</div>
                  ))}
                  {pts.map((p, i) => (
                    <div
                      key={p.matchId}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: x(i), top: y(p.rank) }}
                      onMouseEnter={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); setTip({ p, x: r.left + r.width / 2, y: r.top }); }}
                      onMouseLeave={() => setTip(null)}
                    >
                      {/* solid backing so the chip reads on top of the trend line */}
                      <span className="block rounded bg-pitch-900 ring-1 ring-pitch-900">
                        <PointsPill points={p.points} tier={p.tier} compact />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-line px-5 py-2.5 text-[11px] text-muted">
              Each chip is a finished game (1st at the top) - hover for the result. Scroll sideways for the full run.
            </div>
          </>
        )}
      </div>

      {tip && createPortal(
        <div className="pointer-events-none fixed z-[90]" style={{ left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)" }}>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-[#0f120e] px-2.5 py-2 shadow-xl">
            <span className="whitespace-nowrap font-mono text-[11px] text-cream">{flagFor(tip.p.home)} {tip.p.homeCode} v {tip.p.awayCode} {flagFor(tip.p.away)}</span>
            {tip.p.note != null ? (
              <>
                <span className="whitespace-nowrap font-mono text-[10px] text-muted">⚽ {tip.p.note} · Final {tip.p.hs}-{tip.p.as}</span>
                <span className="whitespace-nowrap font-mono text-[10px] text-gold">{ordinal(tip.p.rank)} · {tip.p.cumulative} {tip.p.cumulative === 1 ? "goal" : "goals"}</span>
              </>
            ) : (
              <>
                <span className="whitespace-nowrap font-mono text-[10px] text-muted">Pred {tip.p.predHome}-{tip.p.predAway} · Final {tip.p.hs}-{tip.p.as}</span>
                <ScoredChips pick={`${tip.p.predHome}-${tip.p.predAway}`} hs={tip.p.hs} as={tip.p.as} homeCode={tip.p.homeCode} awayCode={tip.p.awayCode} />
                <span className="whitespace-nowrap font-mono text-[10px] text-gold">{ordinal(tip.p.rank)} · {tip.p.cumulative} pts</span>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  );
}
