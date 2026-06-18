import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useWallchart, useLeaderboard, useGroups, useWcGroups, useTopScorer, usePhasesStarted } from "../api.js";
import { standingKey, knockoutGroupKey } from "@wc/shared";
import FormCell from "./FormCell.js";
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

function Stat({ label, value, pos, accent, to, won }: { label: string; value: ReactNode; pos?: string; accent?: boolean; to?: string; won?: boolean }) {
  return (
    <div className={"fl-card relative px-3 py-3 text-center" + (won ? " border-gold bg-gold/10" : "")}>
      {to && (
        <Link to={to} aria-label={`View ${label}`} className="absolute right-1.5 top-1.5 text-muted transition-colors hover:text-gold">
          <EyeIcon />
        </Link>
      )}
      {won && <div className="text-[11px]">🏆</div>}
      <div className="font-mono text-base leading-tight" style={{ color: won || accent ? "#c9a86a" : "#e8e4d8" }}>{value}</div>
      {pos && <div className="mt-1.5 text-[11px] text-gold">({pos})</div>}
      <div className={"mt-1.5 text-[10px] uppercase tracking-[1px] " + (won ? "text-gold" : "text-muted")}>{label}</div>
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
  // Composite ranking keys (points + exact/result tiebreaks) so every position
  // label here matches the standings tables exactly. See standingKey.
  const keyOf = (e: typeof lb[number]) => standingKey(e.total, e.exactCount ?? 0, e.resultCount ?? 0);
  const phaseKeyOf = (e: typeof lb[number], f: Phase) => standingKey(e[f], e.statsByPhase?.[f]?.exact ?? 0, e.statsByPhase?.[f]?.result ?? 0);
  const overallPos = me ? posLabel(keyOf(me), lb.map(keyOf)) : "-";
  const phaseStarted: Record<Phase, boolean | undefined> = {
    week1: phases?.week1, week2: phases?.week2, week3: phases?.week3, r32: phases?.r32, r16: phases?.r16,
  };
  type Card = { value: string; pos?: string };

  // "X pts" + "Joint Nth" once the period has started; "-" / "TBC" before it kicks off.
  const phaseValue = (f: Phase): Card => {
    if (!me || !phaseStarted[f]) return { value: "-", pos: "TBC" };
    return { value: `${me[f]}pt${me[f] === 1 ? "" : "s"}`, pos: posLabel(phaseKeyOf(me, f), lb.map((e) => phaseKeyOf(e, f))) };
  };

  // Knockout: "Group E" + position - or "Eliminated".
  let knockout: Card = { value: "-" };
  for (const g of groups ?? []) {
    const ge = g.entrants.find((e) => e.entrantId === eid);
    if (!ge) continue;
    const wc = wcGroups?.find((w) => w.group === g.group);
    const gKey = (x: typeof ge) => knockoutGroupKey(x.total, x.overallTotal ?? 0);
    knockout = wc?.decided && !ge.qualifying
      ? { value: "Eliminated" }
      : { value: `Group ${g.group}`, pos: posLabel(gKey(ge), g.entrants.map(gKey)) };
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

  // Which competitions this entrant has WON: the period is fully decided and
  // they're top of it (reused for the gold stat cards + the header winner chips).
  const phaseDoneOf = (f: Phase) =>
    ({ week1: phases?.week1Done, week2: phases?.week2Done, week3: phases?.week3Done, r32: phases?.r32Done, r16: phases?.r16Done }[f]);
  const wonPhase = (f: Phase): boolean =>
    !!me && lb.length > 0 && !!phaseDoneOf(f) && me[f] > 0 && phaseKeyOf(me, f) === Math.max(...lb.map((e) => phaseKeyOf(e, f)));
  const wonOverall = !!phases?.done && !!me && lb.length > 0 && keyOf(me) === Math.max(...lb.map(keyOf));
  const wonTopScorer = !!phases?.done && !!ts && ts.total > 0 && ts.total === Math.max(0, ...(topScorer ?? []).map((t) => t.total));

  // Prize money WON: only counts a prize once its period is fully decided -
  // a week/round when all its games are played, and the overall / wooden spoon /
  // top-scorer prizes only when the whole tournament is finished.
  let prize = 0;
  if (me && lb.length) {
    const highestIn = (f: Phase) => me[f] > 0 && phaseKeyOf(me, f) === Math.max(...lb.map((e) => phaseKeyOf(e, f)));
    const done: Record<Phase, boolean | undefined> = {
      week1: phases?.week1Done, week2: phases?.week2Done, week3: phases?.week3Done, r32: phases?.r32Done, r16: phases?.r16Done,
    };
    for (const f of ["week1", "week2", "week3", "r32", "r16"] as Phase[]) if (done[f] && highestIn(f)) prize += 125;
    if (phases?.done) {
      const rank = 1 + lb.filter((e) => keyOf(e) > keyOf(me)).length;
      if (rank <= 10) prize += OVERALL_PRIZE[rank] ?? 0;
      if (keyOf(me) === Math.min(...lb.map(keyOf))) prize += 75; // wooden spoon
      if (topScorer?.length) {
        const top = topScorer[0].total;
        if (top > 0 && topScorer.find((t) => t.entrantId === eid)?.total === top) prize += 125;
      }
    }
  }

  // A stat card only appears once its week/round/competition has actually started.
  // Knockout + Top Scorer both run off the group games, so they begin with Week 1.
  const statCards = [
    { label: "Knockout", card: knockout, to: "/standings/knockout", show: !!phases?.week1, won: false },
    { label: "Top scorer", card: tsCard, to: "/standings/top-scorer", show: !!phases?.week1, won: wonTopScorer },
    { label: "Week 1", card: phaseValue("week1"), to: "/standings/week-1", show: !!phases?.week1, won: wonPhase("week1") },
    { label: "Week 2", card: phaseValue("week2"), to: "/standings/week-2", show: !!phases?.week2, won: wonPhase("week2") },
    { label: "Week 3", card: phaseValue("week3"), to: "/standings/week-3", show: !!phases?.week3, won: wonPhase("week3") },
    { label: "Round of 32", card: phaseValue("r32"), to: "/standings/round-of-32", show: !!phases?.r32, won: wonPhase("r32") },
    { label: "Round of 16", card: phaseValue("r16"), to: "/standings/round-of-16", show: !!phases?.r16, won: wonPhase("r16") },
  ].filter((c) => c.show);

  // "Week 1 Winner" etc chips for every competition this entrant has won.
  const PHASE_WIN_LABEL: Record<Phase, string> = {
    week1: "Week 1 Winner", week2: "Week 2 Winner", week3: "Week 3 Winner", r32: "Round of 32 Winner", r16: "Round of 16 Winner",
  };
  const wonChips: string[] = [];
  if (wonOverall) wonChips.push("Champion");
  for (const f of ["week1", "week2", "week3", "r32", "r16"] as Phase[]) if (wonPhase(f)) wonChips.push(PHASE_WIN_LABEL[f]);
  if (wonTopScorer) wonChips.push("Top Scorer Winner");

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
          {wonChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
              {wonChips.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/50 bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">🏆 {c}</span>
              ))}
            </div>
          )}
          {me?.last5 && me.last5.length > 0 && (
            <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
              <span className="text-[10px] uppercase tracking-[1px] text-muted">Form</span>
              <FormCell games={me.last5} className="flex items-center gap-0.5" />
            </div>
          )}
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

      {/* stat cards - only those whose week/competition has started; the grid
          auto-fits so however many show, they fill the row evenly */}
      {statCards.length > 0 && (
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2">
          {statCards.map((c) => (
            <Stat key={c.label} label={c.label} {...c.card} to={linkCards ? c.to : undefined} won={c.won} />
          ))}
        </div>
      )}
    </>
  );
}
