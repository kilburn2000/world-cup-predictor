import { useWcKnockout, type KoSide } from "../api.js";
import { flagFor } from "../flags.js";
import LiveTabs from "../components/LiveTabs.js";

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
  }) + " BST";
}

function Side({ s, align }: { s: KoSide; align: "left" | "right" }) {
  const cls = "flex items-center gap-2 min-w-0 " + (align === "right" ? "justify-end" : "");
  if (s.team) {
    return (
      <div className={cls}>
        {align === "left" && <span>{flagFor(s.team.name)}</span>}
        <span className="truncate font-display text-lg text-cream">{s.team.name}</span>
        {align === "right" && <span>{flagFor(s.team.name)}</span>}
      </div>
    );
  }
  return <div className={cls + " text-[13px] italic text-muted"}>{s.label}</div>;
}

export default function WCKnockout() {
  const { data, isLoading, error } = useWcKnockout();

  return (
    <div className="fl-enter">
      <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Statistics</div>
      <h1 className="mb-1 mt-2 font-display text-3xl font-medium text-cream">Knockout</h1>
      <p className="mb-5 text-[13px] text-muted">
        Who qualifies into each game. Each team appears only once its group is confirmed; until then you’ll
        see the qualifier it’s waiting on (e.g. “Winner E”, “3rd A/B/C/D/F”). Times in British Summer Time.
      </p>
      <LiveTabs />

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load the bracket.</p>}

      {(data?.rounds ?? []).map((r) => (
        <div key={r.round} className="mb-7">
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-gold">{r.round}</h2>
          <div className="flex flex-col gap-3">
            {r.matches.map((m) => (
              <div key={m.match} className="fl-card px-4 py-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span className="font-mono uppercase tracking-wide">Match {m.match}</span>
                  <span>
                    {fmtDate(m.kickoff)}
                    {m.venue ? <span className="text-muted"> · {m.venue}</span> : ""}
                  </span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <Side s={m.a} align="right" />
                  <span className="font-mono text-xs text-muted">v</span>
                  <Side s={m.b} align="left" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
