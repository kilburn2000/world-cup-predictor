import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useWallchart, useLeaderboard, useGroups, useWcGroups, useTopScorer, usePhasesStarted } from "../api.js";
import { flagFor } from "../flags.js";

const EyeIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
const gbp = (n: number) => "£" + n.toLocaleString("en-GB");

// Pick country code -> country name flagFor() understands.
const SCORER_COUNTRY: Record<string, string> = {
  POR: "Portugal", ENG: "England", NED: "Netherlands", BRA: "Brazil", ARG: "Argentina",
  SPA: "Spain", FRA: "France", COL: "Colombia", GER: "Germany", NOR: "Norway",
};

// Position label among `all` values; ties are prefixed "Joint" (e.g. Joint 3rd).
function posLabel(value: number, all: number[]): string {
  const rank = 1 + all.filter((v) => v > value).length;
  const tied = all.filter((v) => v === value).length > 1;
  return (tied ? "Joint " : "") + ordinal(rank);
}

const OVERALL_PRIZE: Record<number, number> = {
  1: 500, 2: 325, 3: 200, 4: 175, 5: 150, 6: 125, 7: 100, 8: 90, 9: 80, 10: 80,
};

function Stat({ label, value, pos, accent, to }: { label: string; value: ReactNode; pos?: string; accent?: boolean; to?: string }) {
  return (
    <div className="fl-card relative px-3 py-3 text-center">
      {to && (
        <Link to={to} aria-label={`View ${label}`} className="absolute right-1.5 top-1.5 text-muted transition-colors hover:text-gold">
          <EyeIcon />
        </Link>
      )}
      <div className="font-mono text-base leading-tight" style={{ color: accent ? "#c9a86a" : "#e8e4d8" }}>{value}</div>
      {pos && <div className="mt-1.5 text-[11px] text-gold">({pos})</div>}
      <div className="mt-1.5 text-[10px] uppercase tracking-[1px] text-muted">{label}</div>
    </div>
  );
}

// The entrant header (avatar, name, overall position, top-scorer picks, total +
// prize) and the six stat cards. Shared by the entrant detail page and the
// personalised homepage.
export default function EntrantSummary({ id, eyebrow = "Entrant", linkCards = true }: { id: string | number; eyebrow?: string; linkCards?: boolean }) {
  const { data, isLoading, error } = useWallchart(id);
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

  type Phase = "week1" | "week2" | "week3" | "r32" | "r16";
  const overallPos = me ? posLabel(me.total, lb.map((e) => e.total)) : "-";
  const phaseStarted: Record<Phase, boolean | undefined> = {
    week1: phases?.week1, week2: phases?.week2, week3: phases?.week3, r32: phases?.r32, r16: phases?.r16,
  };
  type Card = { value: string; pos?: string };

  // "X pts" + "Joint Nth" once the period has started; "-" / "TBC" before it kicks off.
  const phaseValue = (f: Phase): Card => {
    if (!me || !phaseStarted[f]) return { value: "-", pos: "TBC" };
    const all = lb.map((e) => e[f]);
    return { value: `${me[f]}pt${me[f] === 1 ? "" : "s"}`, pos: posLabel(me[f], all) };
  };

  // Knockout: "Group E" + position - or "Eliminated".
  let knockout: Card = { value: "-" };
  for (const g of groups ?? []) {
    const ge = g.entrants.find((e) => e.entrantId === eid);
    if (!ge) continue;
    const wc = wcGroups?.find((w) => w.group === g.group);
    knockout = wc?.decided && !ge.qualifying
      ? { value: "Eliminated" }
      : { value: `Group ${g.group}`, pos: posLabel(ge.total, g.entrants.map((x) => x.total)) };
    break;
  }

  // Top scorer: combined goals of their two players + position. The competition
  // runs the whole tournament, so it shows a real position as soon as it starts.
  const ts = topScorer?.find((t) => t.entrantId === eid);
  const tsCard: Card = !ts
    ? { value: "-", pos: "TBC" }
    : {
        value: `${ts.total} ${ts.total === 1 ? "goal" : "goals"}`,
        pos: phases?.week1 ? posLabel(ts.total, topScorer!.map((t) => t.total)) : "TBC",
      };

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
      week1: phases?.week1Done, week2: phases?.week2Done, week3: phases?.week3Done, r32: phases?.r32Done, r16: phases?.r16Done,
    };
    for (const f of ["week1", "week2", "week3", "r32", "r16"] as Phase[]) if (done[f] && highestIn(f)) prize += 125;
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

  const inits = data.entrant.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* header */}
      <div className="fl-card flex flex-col flex-wrap items-center gap-5 p-6 text-center sm:flex-row sm:text-left">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-gold font-mono text-xl font-semibold text-gold">
          {inits}
        </div>
        <div className="min-w-[180px] flex-1">
          <div className="text-[11px] uppercase tracking-[1.5px] text-muted">{eyebrow}</div>
          <div className="mt-0.5 font-display text-3xl text-cream">{data.entrant.name}</div>
          <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-sm text-gold sm:justify-start">
            <span>{overallPos} overall</span>
            {linkCards && (
              <Link to="/standings/overall" aria-label="View overall standings" className="text-muted transition-colors hover:text-gold">
                <EyeIcon />
              </Link>
            )}
          </div>
          {ts && ts.players.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-muted sm:justify-start">
              <span className="text-[10px] uppercase tracking-[1px]">Top scorer picks</span>
              {ts.players.map((p) => (
                <span key={p.name} className="inline-flex items-center gap-1">
                  <span className="text-cream">{p.name}</span>
                  <span>{flagFor(SCORER_COUNTRY[p.country] ?? p.country)}</span>
                  <span className="font-mono text-gold">{p.goals}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center sm:text-right">
            <div className="font-mono text-3xl leading-none text-gold">{me?.total ?? data.totals.total}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[1px] text-muted">Total points</div>
          </div>
          <div className="h-10 w-px self-center bg-line" />
          <div className="text-center sm:text-right">
            <div className="font-mono text-3xl leading-none text-gold">{gbp(prize)}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[1px] text-muted">Prize money won</div>
          </div>
        </div>
      </div>

      {/* stat cards */}
      <div className="mt-4 flex flex-wrap justify-center gap-2 [&>*]:basis-[calc(50%-0.25rem)] sm:[&>*]:basis-[calc(25%-0.375rem)] lg:[&>*]:basis-[calc((100%-3rem)/7)]">
        <Stat label="Knockout" {...knockout} to={linkCards ? "/standings/knockout" : undefined} />
        <Stat label="Top scorer" {...tsCard} to={linkCards ? "/standings/top-scorer" : undefined} />
        <Stat label="Week 1" {...phaseValue("week1")} to={linkCards ? "/standings/week-1" : undefined} />
        <Stat label="Week 2" {...phaseValue("week2")} to={linkCards ? "/standings/week-2" : undefined} />
        <Stat label="Week 3" {...phaseValue("week3")} to={linkCards ? "/standings/week-3" : undefined} />
        <Stat label="Round of 32" {...phaseValue("r32")} to={linkCards ? "/standings/round-of-32" : undefined} />
        <Stat label="Round of 16" {...phaseValue("r16")} to={linkCards ? "/standings/round-of-16" : undefined} />
      </div>
    </>
  );
}
