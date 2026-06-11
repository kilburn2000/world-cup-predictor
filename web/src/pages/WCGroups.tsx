import { useWcGroups, type WcStanding } from "../api.js";
import { flagFor } from "../flags.js";
import LiveTabs from "../components/LiveTabs.js";

function Row({ t, pos }: { t: WcStanding; pos: number }) {
  const qualify = pos <= 2;
  return (
    <div className="grid grid-cols-[22px_1fr_22px_22px_22px_30px_34px] items-center gap-1 border-t border-line px-3 py-1.5 text-[12.5px] first:border-t-0">
      <div className="font-mono text-[11px] text-muted">{pos}</div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span>{flagFor(t.name)}</span>
        <span className={"truncate " + (qualify ? "text-cream" : "text-muted")}>{t.name}</span>
      </div>
      <div className="text-center font-mono text-[11px] text-muted">{t.played}</div>
      <div className="text-center font-mono text-[11px] text-muted">{t.won}</div>
      <div className="text-center font-mono text-[11px] text-muted">{t.lost}</div>
      <div className="text-center font-mono text-[11px] text-muted">{t.gd > 0 ? `+${t.gd}` : t.gd}</div>
      <div className="text-right font-mono text-sm font-semibold text-cream">{t.points}</div>
    </div>
  );
}

export default function WCGroups() {
  const { data, isLoading, error } = useWcGroups();

  return (
    <div className="fl-enter">
      <LiveTabs />
      <h1 className="mb-1 font-display text-3xl font-medium text-cream">Groups</h1>
      <p className="mb-6 text-[13px] text-muted">
        The real World Cup groups. Top two qualify automatically; the best third-placed teams also go through.
      </p>

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load group tables.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((g) => (
          <div key={g.group} className="fl-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <div className="font-display text-base text-cream">Group {g.group}</div>
              <div className="grid grid-cols-[22px_22px_22px_30px_34px] gap-1 text-[9px] uppercase tracking-wide text-muted">
                <div className="text-center">P</div>
                <div className="text-center">W</div>
                <div className="text-center">L</div>
                <div className="text-center">GD</div>
                <div className="text-right">Pts</div>
              </div>
            </div>
            {g.table.map((t, i) => (
              <div key={t.teamId}>
                <Row t={t} pos={i + 1} />
                {i === 1 && <div className="border-t border-dashed" style={{ borderColor: "rgba(201,168,106,0.4)" }} />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
