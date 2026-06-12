import { useParams, Link } from "react-router-dom";
import { useWallchart, useLeaderboard, useGroups, useWcGroups, useTopScorer, type WallchartMatch, type LeaderboardRow } from "../api.js";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
const gbp = (n: number) => "£" + n.toLocaleString("en-GB");

// Position label among `all` values, with "Joint" when tied with someone else.
function posLabel(value: number, all: number[]): string {
  const rank = 1 + all.filter((v) => v > value).length;
  const tied = all.filter((v) => v === value).length > 1;
  return (tied ? "Joint " : "") + ordinal(rank);
}

const OVERALL_PRIZE: Record<number, number> = {
  1: 500, 2: 325, 3: 200, 4: 175, 5: 150, 6: 125, 7: 100, 8: 90, 9: 80, 10: 80,
};

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="fl-card px-3 py-3 text-center">
      <div className="font-mono text-lg leading-tight" style={{ color: accent ? "#c9a86a" : "#e8e4d8" }}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-gold">{sub}</div>}
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
  const { data: wcGroups } = useWcGroups();
  const { data: topScorer } = useTopScorer();

  if (isLoading)
    return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error || !data) return <p className="text-down">Couldn’t load this entrant.</p>;

  const eid = Number(id);
  const lb = leaderboard ?? [];
  const me = lb.find((e) => e.entrantId === eid);

  type Phase = "week1" | "week2" | "week3" | "r32";
  const overallPos = me ? posLabel(me.total, lb.map((e) => e.total)) : "-";
  // position bracket for a week/round (only once someone has scored in it)
  const phaseSub = (f: Phase): string | undefined => {
    if (!me) return undefined;
    const all = lb.map((e) => e[f]);
    return Math.max(0, ...all) > 0 ? `(${posLabel(me[f], all)})` : undefined;
  };

  // Knockout: their entrant group + position in it, or Eliminated.
  let knockoutValue = "-";
  let knockoutSub: string | undefined;
  for (const g of groups ?? []) {
    const ge = g.entrants.find((e) => e.entrantId === eid);
    if (!ge) continue;
    const wc = wcGroups?.find((w) => w.group === g.group);
    if (wc?.decided && !ge.qualifying) {
      knockoutValue = "Eliminated";
    } else {
      knockoutValue = `Group ${g.group}`;
      knockoutSub = `(${posLabel(ge.total, g.entrants.map((x) => x.total))})`;
    }
    break;
  }

  // Provisional prize money (what they'd win at the current standings).
  let prize = 0;
  if (me && lb.length) {
    const rank = 1 + lb.filter((e) => e.total > me.total).length;
    if (rank <= 10) prize += OVERALL_PRIZE[rank] ?? 0;
    const highestIn = (f: Phase | "total") => {
      const max = Math.max(0, ...lb.map((e) => e[f]));
      return max > 0 && (me as LeaderboardRow)[f] === max;
    };
    for (const f of ["week1", "week2", "week3", "r32"] as Phase[]) if (highestIn(f)) prize += 125;
    if (me.total === Math.min(...lb.map((e) => e.total))) prize += 75; // wooden spoon
  }
  if (topScorer?.length) {
    const top = topScorer[0].total;
    if (top > 0 && topScorer.find((t) => t.entrantId === eid)?.total === top) prize += 125;
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
        <div className="min-w-[180px] flex-1">
          <div className="text-[11px] uppercase tracking-[1.5px] text-muted">Entrant</div>
          <div className="mt-0.5 font-display text-3xl text-cream">{data.entrant.name}</div>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <div className="font-mono text-3xl leading-none text-gold">{data.totals.total}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[1px] text-muted">Total points</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl leading-none text-gold">{gbp(prize)}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[1px] text-muted">Prize money</div>
          </div>
        </div>
      </div>

      {/* stat cards */}
      <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Overall position" value={overallPos} />
        <Stat label="Knockout" value={knockoutValue} sub={knockoutSub} />
        <Stat label="Week 1" value={me?.week1 ?? 0} sub={phaseSub("week1")} />
        <Stat label="Week 2" value={me?.week2 ?? 0} sub={phaseSub("week2")} />
        <Stat label="Week 3" value={me?.week3 ?? 0} sub={phaseSub("week3")} />
        <Stat label="Round of 32" value={me?.r32 ?? 0} sub={phaseSub("r32")} />
      </div>

      {/* group stage */}
      <h3 className="mb-3 font-display text-base text-cream">Group stage</h3>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
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
