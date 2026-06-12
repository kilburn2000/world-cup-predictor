import { useParams, Link } from "react-router-dom";
import { useWallchart, useLeaderboard, useGroups, type WallchartMatch } from "../api.js";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  const isNum = typeof value === "number";
  return (
    <div className="fl-card px-3 py-3 text-center">
      <div
        className={(isNum ? "font-mono text-2xl" : "font-display text-2xl") + " leading-tight"}
        style={{ color: accent ? "#c9a86a" : "#e8e4d8" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[10px] uppercase tracking-[1px] text-muted">{label}</div>
    </div>
  );
}

function MatchRow({ m }: { m: WallchartMatch }) {
  const finished = m.status === "FINISHED" && m.actualHome != null;
  const pts = m.points ?? 0;
  return (
    <div className="flex items-center gap-2 border-t border-line py-1.5 text-[13px] first:border-t-0">
      <span className="flex-1 truncate text-right text-cream">{m.home}</span>
      <span className="w-11 text-center font-mono text-gold">
        {m.predHome}–{m.predAway}
      </span>
      <span className="flex-1 truncate text-cream">{m.away}</span>
      {finished ? (
        <span className="flex w-[72px] items-center justify-end gap-1.5">
          <span className="font-mono text-[11px] text-muted">
            {m.actualHome}–{m.actualAway}
          </span>
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[11px]"
            style={
              pts > 0
                ? { background: "rgba(201,168,106,0.18)", color: "#c9a86a" }
                : { background: "rgba(217,146,106,0.14)", color: "#d9926a" }
            }
          >
            {pts}
          </span>
        </span>
      ) : (
        <span className="w-[72px] text-right font-mono text-[10px] uppercase tracking-wider text-muted">
          -
        </span>
      )}
    </div>
  );
}

export default function Entrant() {
  const { id } = useParams();
  const { data, isLoading, error } = useWallchart(id!);
  const { data: leaderboard } = useLeaderboard();
  const { data: groups } = useGroups();

  if (isLoading)
    return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error || !data) return <p className="text-down">Couldn’t load this entrant.</p>;

  const eid = Number(id);
  const me = leaderboard?.find((e) => e.entrantId === eid);
  const overallPos = me && leaderboard ? ordinal(1 + leaderboard.filter((e) => e.total > me.total).length) : "–";
  // Knockout standing: during the group stage everyone is "Group X"; the bracket
  // rounds (R16 → Final) fill in once the entrant knockout is wired up.
  let knockoutPos = "-";
  for (const g of groups ?? []) {
    if (g.entrants.some((e) => e.entrantId === eid)) { knockoutPos = `Group ${g.group}`; break; }
  }

  const byRound = new Map<string, typeof data.knockout>();
  for (const k of data.knockout) {
    if (!byRound.has(k.label)) byRound.set(k.label, []);
    byRound.get(k.label)!.push(k);
  }

  const inits = data.entrant.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="fl-enter">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-cream">
        ← Back to standings
      </Link>

      {/* header */}
      <div className="fl-card mb-4 mt-4 flex flex-wrap items-center gap-5 p-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-gold font-mono text-xl font-semibold text-gold">
          {inits}
        </div>
        <div className="min-w-[200px] flex-1">
          <div className="text-[11px] uppercase tracking-[1.5px] text-muted">Entrant</div>
          <div className="mt-0.5 font-display text-3xl text-cream">{data.entrant.name}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-4xl leading-none text-gold">{data.totals.total}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[1px] text-muted">Total points</div>
        </div>
      </div>

      {/* stat cards */}
      <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Overall position" value={overallPos} />
        <Stat label="Knockout" value={knockoutPos} />
        <Stat label="Week 1 Points" value={me?.week1 ?? 0} />
        <Stat label="Week 2 Points" value={me?.week2 ?? 0} />
        <Stat label="Week 3 Points" value={me?.week3 ?? 0} />
        <Stat label="Round of 32 Points" value={me?.r32 ?? 0} />
      </div>

      {/* group stage */}
      <h3 className="mb-3 font-display text-base text-cream">Group stage</h3>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.groups.map((g) => (
          <div key={g.group} className="fl-card overflow-hidden">
            <h4 className="border-b border-line px-4 py-2.5 font-display text-sm text-cream">
              Group {g.group}
            </h4>
            <div className="px-4 py-1">
              {g.matches.map((m, i) => (
                <MatchRow key={i} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* predicted bracket */}
      <h3 className="mb-3 font-display text-base text-cream">Predicted bracket</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...byRound.entries()].map(([label, matches]) => (
          <div key={label} className="fl-card overflow-hidden">
            <h4 className="border-b border-line px-4 py-2.5 font-display text-sm text-cream">{label}</h4>
            <div className="px-4 py-1">
              {matches.map((k) => (
                <div
                  key={k.slot}
                  className="flex items-center gap-2 border-t border-line py-1.5 text-[13px] first:border-t-0"
                >
                  <span className="flex-1 truncate text-right text-cream">{k.home}</span>
                  <span className="w-11 text-center font-mono text-gold">
                    {k.predHome}–{k.predAway}
                  </span>
                  <span className="flex-1 truncate text-cream">{k.away}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
