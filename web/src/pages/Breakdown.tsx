import { useState } from "react";
import { useEntrants, useEntrantBreakdown, type BreakdownRow } from "../api.js";

const sum = (rows: BreakdownRow[]) => rows.reduce((s, r) => s + r.points, 0);

// A block of rows (a phase) with a subtotal header.
function Section({ title, rows, showGroup }: { title: string; rows: BreakdownRow[]; showGroup?: boolean }) {
  if (!rows.length) return null;
  return (
    <div className="fl-card mb-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="font-display text-sm text-cream">{title}</span>
        <span className="font-mono text-sm font-semibold text-gold">{sum(rows)} pts</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
              {showGroup && <th className="px-4 py-1.5">Grp</th>}
              <th className="px-4 py-1.5">Match</th>
              <th className="px-2 py-1.5">Pick</th>
              <th className="px-2 py-1.5">Actual</th>
              <th className="px-4 py-1.5 text-right">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {showGroup && <td className="px-4 py-1.5 font-mono text-[11px] text-muted">{r.group}</td>}
                <td className="whitespace-nowrap px-4 py-1.5 text-cream">{r.home} v {r.away}</td>
                <td className="px-2 py-1.5 font-mono text-gold">{r.pick}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono text-muted">{r.actual}</td>
                <td className="px-4 py-1.5 text-right font-mono font-semibold text-cream">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Breakdown() {
  const { data: entrants } = useEntrants();
  const [id, setId] = useState<number | null>(null);
  const { data, isLoading } = useEntrantBreakdown(id);

  const weeks = ["Week 1", "Week 2", "Week 3"];
  const groupTotal = data ? sum(data.group) : 0;
  const koTotal = data ? sum(data.knockout) : 0;

  return (
    <div className="fl-enter">
      <div className="mb-1 text-[11px] uppercase tracking-[1.8px] text-gold">Admin</div>
      <h1 className="font-display text-4xl font-medium tracking-tight text-cream">Score breakdown</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
        Every game an entrant scored on - pick, actual result and points - to reconcile against an external sheet.
      </p>

      <div className="mt-6 mb-6">
        <select
          value={id ?? ""}
          onChange={(e) => setId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-xs rounded-lg border border-line bg-[#0f120e] px-3 py-2 text-sm text-cream focus:border-gold focus:outline-none"
        >
          <option value="">Choose an entrant…</option>
          {[...(entrants ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>

      {id != null && isLoading && <p className="font-mono text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="mb-5 flex flex-wrap gap-3 text-sm">
            <span className="fl-card px-3 py-1.5">Group <span className="font-mono font-semibold text-gold">{groupTotal}</span></span>
            <span className="fl-card px-3 py-1.5">Knockout <span className="font-mono font-semibold text-gold">{koTotal}</span></span>
            <span className="fl-card px-3 py-1.5">Total <span className="font-mono font-semibold text-gold">{groupTotal + koTotal}</span></span>
          </div>

          {weeks.map((w) => (
            <Section key={w} title={w} rows={data.group.filter((r) => r.phase === w)} showGroup />
          ))}
          <Section title="Knockout" rows={data.knockout} />
        </>
      )}
    </div>
  );
}
