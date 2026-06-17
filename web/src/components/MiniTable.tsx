import { Fragment } from "react";
import { Link } from "react-router-dom";

export interface MiniRow {
  entrantId: number;
  name: string;
  nameIncomplete?: boolean;
  /** the number shown on the right. */
  value: number;
  /** ranking key (points + exact/result tiebreaks); falls back to `value`. */
  key?: number;
  /** True for rows above the qualification cut-off (knockout groups). */
  qualifying?: boolean;
}

const YouBadge = () => (
  <span className="shrink-0 rounded bg-gold/20 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-gold">You</span>
);

// A standings card windowed to 5 rows around the logged-in entrant: normally 2
// above + you + 2 below, but clamped at the edges so the top of the table shows
// you + the 4 below, and the bottom shows the 4 above + you.
export default function MiniTable({ rows, entrantId, title, fullTo }: {
  rows: MiniRow[];
  entrantId: number;
  title: string;
  fullTo: string;
}) {
  if (!rows.length) return null;

  const keyOf = (r: MiniRow) => r.key ?? r.value;
  const sorted = [...rows].sort((a, b) => keyOf(b) - keyOf(a));
  const idx = sorted.findIndex((r) => r.entrantId === entrantId);
  if (idx < 0) return null;

  const N = 5;
  const start = Math.min(Math.max(0, idx - 2), Math.max(0, sorted.length - N));
  const window = sorted.slice(start, start + N);

  // Position number with an "=" suffix when tied on the ranking key.
  const label = (row: MiniRow) => {
    const rank = 1 + sorted.filter((x) => keyOf(x) > keyOf(row)).length;
    const tied = sorted.filter((x) => keyOf(x) === keyOf(row)).length > 1;
    return rank + (tied ? "=" : "");
  };

  return (
    <div className="fl-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h4 className="font-display text-sm text-cream">{title}</h4>
        <Link to={fullTo} className="text-[11px] text-gold hover:underline">Full Table →</Link>
      </div>
      <div className="px-2 py-1">
        {window.map((row, i) => {
          const you = row.entrantId === entrantId;
          // Dashed gold line at the qualification cut-off: after the last
          // qualifier, before the first non-qualifier.
          const cutoff = row.qualifying && window[i + 1] && !window[i + 1].qualifying;
          return (
            <Fragment key={row.entrantId}>
              <Link
                to={`/entrant/${row.entrantId}`}
                className={
                  "grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 rounded-lg px-2 py-2 text-[13px] transition-colors " +
                  (you ? "bg-gold-soft" : "hover:bg-gold-soft/50")
                }
              >
                <span className="font-mono text-muted">{label(row)}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-cream">
                  <span className="truncate">{row.name}</span>
                  {row.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
                  {you && <YouBadge />}
                </span>
                <span className="font-mono font-semibold text-gold">{row.value}</span>
              </Link>
              {cutoff && (
                <div className="mx-2 my-1 border-t border-dashed" style={{ borderColor: "rgba(201,168,106,0.4)" }} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
