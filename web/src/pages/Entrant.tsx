import type { ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import { useWallchart, useLeaderboard, useGroups, useWcGroups, useTopScorer, usePhasesStarted, type WallchartMatch } from "../api.js";
import { flagFor } from "../flags.js";
import ScoredChips from "../components/ScoredChips.js";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
const gbp = (n: number) => "£" + n.toLocaleString("en-GB");

// Position label among `all` values; tied positions get an "=" suffix (e.g. 3rd=).
function posLabel(value: number, all: number[]): string {
  const rank = 1 + all.filter((v) => v > value).length;
  const tied = all.filter((v) => v === value).length > 1;
  return (tied ? "Joint " : "") + ordinal(rank);
}

// A position rendered in brackets: smaller and muted next to the main value.
function Pos({ children }: { children: ReactNode }) {
  return <span className="text-[11px] text-muted">({children})</span>;
}

const OVERALL_PRIZE: Record<number, number> = {
  1: 500, 2: 325, 3: 200, 4: 175, 5: 150, 6: 125, 7: 100, 8: 90, 9: 80, 10: 80,
};

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="fl-card px-3 py-3 text-center">
      <div className="font-mono text-base leading-tight" style={{ color: accent ? "#c9a86a" : "#e8e4d8" }}>{value}</div>
      <div className="mt-1.5 text-[10px] uppercase tracking-[1px] text-muted">{label}</div>
    </div>
  );
}

const MATCH_COLS = "grid grid-cols-[1fr_46px_1fr] items-center gap-1.5";

function MatchRow({ m }: { m: WallchartMatch }) {
  const finished = m.status === "FINISHED" && m.actualHome != null;
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className={MATCH_COLS + " text-[12.5px]"}>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span className="truncate text-cream">{m.home}</span>
          <span>{flagFor(m.home)}</span>
        </div>
        <div className="text-center font-mono">
          {finished ? (
            <span className="text-cream">{m.actualHome}–{m.actualAway}</span>
          ) : (
            <span className="text-gold">{m.predHome}–{m.predAway}</span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span>{flagFor(m.away)}</span>
          <span className="truncate text-cream">{m.away}</span>
        </div>
      </div>
      {finished && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px]">
          <span className="text-muted">Predicted</span>
          <span className="font-mono text-gold">{m.predHome}–{m.predAway}</span>
          <ScoredChips pick={`${m.predHome}-${m.predAway}`} hs={m.actualHome ?? 0} as={m.actualAway ?? 0} homeCode={m.homeCode ?? ""} awayCode={m.awayCode ?? ""} />
          <span className="font-mono font-semibold text-gold">+{m.points ?? 0}</span>
        </div>
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
  const { data: phases } = usePhasesStarted();

  if (isLoading)
    return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error || !data) return <p className="text-down">Couldn’t load this entrant.</p>;

  const eid = Number(id);
  const lb = leaderboard ?? [];
  const me = lb.find((e) => e.entrantId === eid);

  type Phase = "week1" | "week2" | "week3" | "r32";
  const overallPos = me ? posLabel(me.total, lb.map((e) => e.total)) : "-";
  const phaseStarted: Record<Phase, boolean | undefined> = {
    week1: phases?.week1, week2: phases?.week2, week3: phases?.week3, r32: phases?.r32,
  };
  // "X pts (Joint Nth)" once the period has started; a dash before it kicks off.
  const phaseValue = (f: Phase): ReactNode => {
    if (!me || !phaseStarted[f]) return "-";
    const all = lb.map((e) => e[f]);
    return <>{me[f]} pts <Pos>{posLabel(me[f], all)}</Pos></>;
  };

  // Knockout: "E (Joint 1st)" - group letter + position - or "Eliminated".
  let knockoutValue: ReactNode = "-";
  for (const g of groups ?? []) {
    const ge = g.entrants.find((e) => e.entrantId === eid);
    if (!ge) continue;
    const wc = wcGroups?.find((w) => w.group === g.group);
    knockoutValue = wc?.decided && !ge.qualifying
      ? "Eliminated"
      : <>Group {g.group} <Pos>{posLabel(ge.total, g.entrants.map((x) => x.total))}</Pos></>;
    break;
  }

  // Prize money WON: only counts a prize once its period is fully decided -
  // a week/round when all its games are played, and the overall / wooden spoon /
  // top-scorer prizes only when the whole tournament is finished.
  let prize = 0;
  if (me && lb.length) {
    const highestIn = (f: Phase) => {
      const max = Math.max(0, ...lb.map((e) => e[f]));
      return max > 0 && me[f] === max;
    };
    const done: Record<Phase, boolean | undefined> = {
      week1: phases?.week1Done, week2: phases?.week2Done, week3: phases?.week3Done, r32: phases?.r32Done,
    };
    for (const f of ["week1", "week2", "week3", "r32"] as Phase[]) if (done[f] && highestIn(f)) prize += 125;
    if (phases?.done) {
      const rank = 1 + lb.filter((e) => e.total > me.total).length;
      if (rank <= 10) prize += OVERALL_PRIZE[rank] ?? 0;
      if (me.total === Math.min(...lb.map((e) => e.total))) prize += 75; // wooden spoon
      if (topScorer?.length) {
        const top = topScorer[0].total;
        if (top > 0 && topScorer.find((t) => t.entrantId === eid)?.total === top) prize += 125;
      }
    }
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
          <div className="mt-1 font-mono text-sm text-gold">{overallPos} overall</div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="font-mono text-3xl leading-none text-gold">{data.totals.total}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[1px] text-muted">Total points</div>
          </div>
          <div className="h-10 w-px self-center bg-line" />
          <div className="text-right">
            <div className="font-mono text-3xl leading-none text-gold">{gbp(prize)}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[1px] text-muted">Prize money won</div>
          </div>
        </div>
      </div>

      {/* stat cards */}
      <div className="mb-7 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Knockout" value={knockoutValue} />
        <Stat label="Week 1" value={phaseValue("week1")} />
        <Stat label="Week 2" value={phaseValue("week2")} />
        <Stat label="Week 3" value={phaseValue("week3")} />
        <Stat label="Round of 32" value={phaseValue("r32")} />
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
