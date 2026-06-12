import { useTable } from "../api.js";

export default function LiveTable() {
  const { data, isLoading, error } = useTable();

  if (isLoading)
    return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the table.</p>;
  if (!data?.length)
    return <p className="text-muted">No standings yet - seed the tournament.</p>;

  return (
    <div className="fl-enter">
      <h1 className="mb-1 font-display text-3xl font-medium text-cream">Group Tables</h1>
      <p className="mb-6 text-[13.5px] text-muted">
        Live standings across all {data.length} groups · top two advance.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((g) => (
          <div key={g.group} className="fl-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h3 className="font-display text-base text-cream">Group {g.group}</h3>
              <div className="font-mono text-[9px] uppercase tracking-[1.5px] text-muted">
                P · GD · Pts
              </div>
            </div>
            <div>
              {g.rows.map((r, i) => {
                const advancing = i < 2;
                return (
                  <div
                    key={r.teamId}
                    className="grid grid-cols-[22px_1fr_28px_36px_30px] items-center border-t border-line px-4 py-2 text-[13px] first:border-t-0"
                  >
                    <div className="font-mono text-xs" style={{ color: advancing ? "#c9a86a" : "#8d9388" }}>
                      {i + 1}
                    </div>
                    <div className="flex items-center gap-2 truncate text-cream">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: advancing ? "#c9a86a" : "transparent" }}
                      />
                      <span className="truncate">{r.name}</span>
                    </div>
                    <div className="text-right font-mono text-xs text-muted">{r.played}</div>
                    <div className="text-right font-mono text-xs text-muted">
                      {r.gd > 0 ? `+${r.gd}` : r.gd}
                    </div>
                    <div className="text-right font-mono text-sm font-semibold text-cream">
                      {r.points}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
