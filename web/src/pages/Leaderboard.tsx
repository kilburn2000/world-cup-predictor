import { Fragment, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useGroups, useLeaderboard, useStats, useConsensus, usePhasesStarted, useTopScorer, useLiveMatches, useFixtures, type GroupEntrant, type StatLeader, type Consensus, type LiveTier, type FormGame, type LiveMatch } from "../api.js";
import { standingKey } from "@wc/shared";
import TabSelect from "../components/TabSelect.js";
import ScoredChips from "../components/ScoredChips.js";
import PointsPill from "../components/PointsPill.js";
import FormCell from "../components/FormCell.js";
import { flagFor } from "../flags.js";
import { useMe } from "../auth.js";

// Per-entrant provisional points from matches in play right now: the points each
// would win if every live game ended at its current score, plus what they're
// scoring on (for the chips). Built from each live match's precomputed board.
type LiveGame = { pick: string; hs: number; as: number; homeCode: string; awayCode: string; tier: LiveTier | null; points: number; group: string | null; stage: string; matchday: number | null };
type LiveAgg = Map<number, LiveGame[]>;
function useLivePoints(): LiveAgg {
  const { data } = useLiveMatches(0);
  return useMemo(() => {
    const m: LiveAgg = new Map();
    for (const mt of data ?? []) {
      if (mt.status !== "IN_PLAY" && mt.status !== "PAUSED") continue;
      for (const b of mt.board) {
        if (b.points == null) continue;
        const arr = m.get(b.entrantId) ?? [];
        arr.push({ pick: b.pick, hs: mt.homeScore, as: mt.awayScore, homeCode: mt.homeCode, awayCode: mt.awayCode, tier: b.tier, points: b.points, group: mt.group ?? null, stage: mt.stage, matchday: mt.matchday ?? null });
        m.set(b.entrantId, arr);
      }
    }
    return m;
  }, [data]);
}

// One entrant's live predictions for a given context (already filtered), rendered
// as: predicted score + scoring chip + points pill, one line each. Shared by the
// Overall, Knockout and per-phase standings tables.
function LiveCell({ games }: { games: LiveGame[] }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 overflow-hidden">
      {games.map((g, i) => (
        <span key={i} className="flex items-center gap-1 whitespace-nowrap">
          <span className="mr-1.5 font-mono text-[10px] text-cream/90">{g.pick.replace("-", "–")}</span>
          <ScoredChips pick={g.pick} hs={g.hs} as={g.as} homeCode={g.homeCode} awayCode={g.awayCode} />
          <PointsPill points={g.points} tier={g.tier} />
        </span>
      ))}
    </div>
  );
}

// Which live games count toward a given standings view.
const phaseGames = (games: LiveGame[], phase: "week1" | "week2" | "week3" | "r32" | "r16") =>
  games.filter((g) =>
    phase === "r32" ? g.stage === "LAST_32"
    : phase === "r16" ? g.stage === "LAST_16"
    : g.stage === "GROUP" && g.matchday === ({ week1: 1, week2: 2, week3: 3 } as const)[phase],
  );
const groupGames = (games: LiveGame[], group: string) => games.filter((g) => g.stage === "GROUP" && g.group === group);

// Gold "you" badge for the logged-in entrant's own row.
const YouBadge = () => <span className="shrink-0 rounded bg-gold/20 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-gold">You</span>;

// Standard competition ranking: ties share a position (the first shows the
// number, the rest "="), and the next distinct value skips. Consensus rows don't
// occupy a position. `list` must already be sorted desc by `value`.
function rankLabeller<T>(list: T[], value: (t: T) => number, isConsensus: (t: T) => boolean = () => false) {
  const reals = list.filter((x) => !isConsensus(x));
  return (e: T): string => {
    const rank = 1 + reals.filter((x) => value(x) > value(e)).length;
    if (isConsensus(e)) return String(rank);
    const idx = reals.indexOf(e);
    return idx > 0 && value(reals[idx - 1]) === value(e) ? "=" : String(rank);
  };
}


// Pick country code -> country name flagFor() understands.
const SCORER_COUNTRY: Record<string, string> = {
  POR: "Portugal", ENG: "England", NED: "Netherlands", BRA: "Brazil", ARG: "Argentina",
  SPA: "Spain", FRA: "France", COL: "Colombia", GER: "Germany", NOR: "Norway",
};

function StatCard({ label, l, unit, unitPlural }: { label: string; l?: StatLeader; unit: string; unitPlural?: string }) {
  const has = l && l.name && l.value > 0;
  return (
    <div className="fl-card p-4">
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted">{label}</div>
      {has ? (
        <>
          <div className="mt-1 truncate font-display text-base text-cream">
            {l!.others ? `${l!.others + 1} entrants` : l!.name}
          </div>
          <div className="font-mono text-[11px] text-gold">{l!.value} {l!.value === 1 ? unit : unitPlural ?? unit + "s"}</div>
        </>
      ) : (
        <div className="mt-1 text-sm text-muted">None yet</div>
      )}
    </div>
  );
}

function GroupRow({ e, myId, label, liveGames = [], anyLive, showPred, nextPick }: { e: GroupEntrant; myId?: number | null; label: string; liveGames?: LiveGame[]; anyLive: boolean; showPred: boolean; nextPick?: string }) {
  return (
    <Link
      to={`/entrant/${e.entrantId}`}
      className={SUB_ROW + " border-t border-line py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
    >
      <div className="text-center font-mono text-xs">
        {e.qualifying ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span>
        ) : (
          <span className="text-muted">{label}</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={"truncate " + (e.qualifying ? "text-cream" : "text-muted")}>{e.name}</span>
        {e.entrantId === myId && <YouBadge />}
        {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
      </div>
      {showPred && (anyLive ? <LiveCell games={liveGames} /> : <NextPredCell pick={nextPick} />)}
      <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{e.exactCount ?? 0}</div>
      <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{e.resultCount ?? 0}</div>
      <FormCell games={e.last5 ?? []} className="hidden items-center justify-center gap-0.5 sm:flex" />
      <div className="text-center font-mono text-sm font-semibold text-cream">{e.total}</div>
    </Link>
  );
}

const subTab = (active: boolean) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (active ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

type Row = { entrantId: number; name: string; week1: number; week2: number; week3: number; r32: number; r16: number; total: number; exactCount?: number; resultCount?: number; nameIncomplete?: boolean; consensus?: boolean; live?: { total: number; week1: number; week2: number; week3: number; exact: number }; last5?: FormGame[]; formByPhase?: Partial<Record<Phase, FormGame[]>>; statsByPhase?: Partial<Record<Phase, { exact: number; result: number }>> };
const consensusRow = (c: Consensus): Row => ({ entrantId: -1, name: c.name, week1: c.week1, week2: c.week2, week3: c.week3, r32: c.r32, r16: c.r16, total: c.total, consensus: true });

// Standings tables are a CSS subgrid: the card is the grid (its columns set by a
// `grid-cols-[...]` template with `auto` content columns), and the header + every
// row are SUB_ROW - a full-width subgrid sharing those columns. So each column
// auto-sizes to the widest of its header/cells across all rows (no fixed widths,
// no padding gaps inside a column) while the rows stay perfectly aligned. The
// first/last tracks are gutters; rank sits in column 2 (col-start-2), a 1fr name
// column fills the slack so the stat columns group on the right.
const SUB_ROW = "col-span-full grid grid-cols-subgrid items-center gap-x-5 px-4";

// The next not-yet-started fixture matching a scope (earliest kickoff) + each
// entrant's predicted score for it, for the "Next Prediction" column shown when
// nothing's live. Picks come straight off the fixture's board.
function nextPredFor(fixtures: LiveMatch[] | undefined, scope: (m: LiveMatch) => boolean): { game: LiveMatch; picks: Map<number, string> } | null {
  const game = (fixtures ?? [])
    .filter((m) => m.status === "SCHEDULED" && m.kickoff && scope(m))
    .sort((a, b) => ((a.kickoff ?? "") < (b.kickoff ?? "") ? -1 : 1))[0];
  if (!game) return null;
  const picks = new Map<number, string>();
  for (const b of game.board ?? []) picks.set(b.entrantId, b.pick);
  return { game, picks };
}

// One entrant's predicted score for the next game.
function NextPredCell({ pick }: { pick?: string }) {
  return <div className="text-center font-mono text-[12px] text-cream">{pick ? pick.replace("-", "–") : <span className="text-muted">–</span>}</div>;
}

function Overall({ everyone }: { everyone: Consensus | null }) {
  const { data, isLoading, error } = useLeaderboard();
  const { data: stats } = useStats();
  const { data: me } = useMe();
  const { data: fixtures } = useFixtures();
  const live = useLivePoints();
  const myId = me?.entrantId;
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  // A dedicated Live column (chip + points pill per in-play game) only appears
  // while something's actually being scored, so the table is unchanged otherwise.
  const anyLive = [...live.values()].some((g) => g.length > 0);
  // When nothing's live, the same slot shows everyone's prediction for the next
  // upcoming fixture instead.
  const next = anyLive ? null : nextPredFor(fixtures, () => true);
  const showPred = anyLive || !!next;
  // Re-derive the total from the confirmed base + the live feed (same source as
  // the chips) so the points column moves the instant a goal lands, not a poll
  // behind. e.total already folds in the server's (slower) live delta, so strip
  // it back out (e.live.total) before adding the fresh client figure.
  const liveOf = (id: number) => (live.get(id) ?? []).reduce((s, g) => s + g.points, 0);
  const dispTotal = (e: Row) => e.total - (e.live?.total ?? 0) + liveOf(e.entrantId);
  // Subgrid columns (see SUB_ROW): gutter, rank, name(1fr fills), [live/next pred],
  // exact, results, form, pts. All stat columns are `auto` so each is exactly as
  // wide as its widest header/cell. Exact/Results/Form hide on mobile.
  const parentCols = showPred
    ? "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto]"
    : "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto]";
  // points first, then exacts, then results (see standingKey), then name.
  const keyOf = (e: Row) => standingKey(dispTotal(e), e.exactCount ?? 0, e.resultCount ?? 0);
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => keyOf(b) - keyOf(a) || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, keyOf, (e) => !!e.consensus);
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Most Exacts" l={stats?.mostExact} unit="exact score" />
        <StatCard label="Most Results" l={stats?.mostResults} unit="result" />
        <StatCard label="Longest Exact Streak" l={stats?.longestExactStreak} unit="in a row" unitPlural="in a row" />
        <StatCard label="Longest Result Streak" l={stats?.longestResultStreak} unit="in a row" unitPlural="in a row" />
      </div>
      <div className={"fl-card overflow-hidden " + parentCols}>
        <div className={SUB_ROW + " py-2 text-[9px] uppercase tracking-wide text-muted"}>
          <div className="text-center">#</div><div className="text-left">Entrant</div>
          {showPred && <div className={anyLive ? "text-left" : "whitespace-nowrap text-center"}>{anyLive ? "Live Prediction" : "Next Prediction"}</div>}
          <div className="hidden text-center sm:block">Exact</div>
          <div className="hidden text-center sm:block">Results</div>
          <div className="hidden text-center sm:block">Form</div>
          <div className="whitespace-nowrap text-center">{anyLive ? "Live Pts" : "Pts"}</div>
        </div>
        {list.map((e) => {
          const label = rankLabel(e);
          return e.consensus ? (
            <div key="everyone" className={SUB_ROW + " border-t border-line bg-gold-soft py-2.5 text-[13px]"}>
              <div className="text-center font-mono text-xs text-gold">{label}</div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium text-gold">👥 {e.name}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted">consensus</span>
              </div>
              {showPred && <div />}
              <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{e.exactCount ?? "–"}</div>
              <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{e.resultCount ?? "–"}</div>
              <div className="hidden sm:block" />
              <div className="text-center font-mono text-sm font-semibold text-gold">{e.total}</div>
            </div>
          ) : (
            (() => {
            const liveGames = live.get(e.entrantId) ?? [];
            return (
            <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className={SUB_ROW + " border-t border-line py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}>
              <div className="text-center font-mono text-xs">
                {label !== "=" && Number(label) <= 3 ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span>
                ) : (
                  <span className="text-muted">{label}</span>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-cream">{e.name}</span>
                {e.entrantId === myId && <YouBadge />}
                {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
              </div>
              {showPred && (anyLive ? <LiveCell games={liveGames} /> : <NextPredCell pick={next!.picks.get(e.entrantId)} />)}
              <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{e.exactCount ?? 0}</div>
              <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{e.resultCount ?? 0}</div>
              <FormCell games={e.last5 ?? []} />
              <div className="text-center font-mono text-sm font-semibold text-cream">{dispTotal(e)}</div>
            </Link>
            );
            })()
          );
        })}
      </div>
    </>
  );
}

function Knockout() {
  const { data, isLoading, error } = useGroups();
  const { data: me } = useMe();
  const { data: fixtures } = useFixtures();
  const live = useLivePoints();
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the groups.</p>;
  if (!data?.length) return <p className="text-muted">No groups set yet.</p>;
  return (
    <>
      <p className="mb-4 text-[13px] text-muted">
        Each entrant is scored <span className="text-cream">only on their own World Cup group’s games</span> (Group A on WC Group A, etc.).
        The <span className="text-gold">top two</span> in each group qualify for the knockout bracket.
      </p>
      <div className="space-y-4">
        {data.map((g) => {
          // Group-scoped tiebreak: points, then exacts, then results - all on the
          // entrant's own WC group games only (the backend already sorts + decides
          // who qualifies the same way).
          const keyOf = (e: GroupEntrant) => standingKey(e.total, e.exactCount ?? 0, e.resultCount ?? 0);
          const rankLabel = rankLabeller(g.entrants, keyOf);
          const liveOf = (eid: number) => groupGames(live.get(eid) ?? [], g.group);
          const anyLive = g.entrants.some((e) => liveOf(e.entrantId).length > 0);
          // Next upcoming game in THIS WC group, for the Next Prediction column.
          const next = anyLive ? null : nextPredFor(fixtures, (m) => m.stage === "GROUP" && m.group === g.group);
          const showPred = anyLive || !!next;
          // Subgrid columns (see SUB_ROW): gutter, rank, name(1fr), [live/next pred],
          // exact, results, form, pts, gutter.
          const parentCols = showPred
            ? "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto]"
            : "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto]";
          return (
            <div key={g.group} className={"fl-card overflow-hidden " + parentCols}>
              <div className={SUB_ROW + " border-b border-line py-3 text-[9px] uppercase tracking-wide text-muted"}>
                <div className="col-span-2 font-display text-lg normal-case tracking-normal text-cream">Group {g.group}</div>
                {showPred && <div className={anyLive ? "text-center" : "whitespace-nowrap text-center"}>{anyLive ? "Live" : "Next Prediction"}</div>}
                <div className="hidden text-center sm:block">Exact</div>
                <div className="hidden text-center sm:block">Results</div>
                <div className="hidden text-center sm:block">Form</div>
                <div className="text-center">{anyLive ? "Live Pts" : "Pts"}</div>
              </div>
              {g.entrants.map((e, i) => (
                <Fragment key={e.entrantId}>
                  <GroupRow e={e} myId={me?.entrantId} label={rankLabel(e)} liveGames={liveOf(e.entrantId)} anyLive={anyLive} showPred={showPred} nextPick={next?.picks.get(e.entrantId)} />
                  {i === 1 && <div className="col-span-full border-t border-dashed" style={{ borderColor: "rgba(201,168,106,0.4)" }} />}
                </Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

type Phase = "week1" | "week2" | "week3" | "r32" | "r16";

function PhaseBoard({ phase, everyone }: { phase: Phase; everyone: Consensus | null }) {
  const { data, isLoading, error } = useLeaderboard();
  const { data: me } = useMe();
  const { data: fixtures } = useFixtures();
  const live = useLivePoints();
  const myId = me?.entrantId;
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  const anyLive = [...live.values()].some((g) => phaseGames(g, phase).length > 0);
  // Next upcoming fixture in THIS phase, for the Next Prediction column.
  const inPhase = (m: LiveMatch) =>
    phase === "r32" ? m.stage === "LAST_32"
    : phase === "r16" ? m.stage === "LAST_16"
    : m.stage === "GROUP" && m.matchday === ({ week1: 1, week2: 2, week3: 3 } as const)[phase];
  const next = anyLive ? null : nextPredFor(fixtures, inPhase);
  const showPred = anyLive || !!next;
  // Subgrid columns (see SUB_ROW): rank, name(1fr), [live/next pred], exact, results, form, pts.
  const parentCols = showPred
    ? "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto]"
    : "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto]";
  // Live-derive the phase total from the live feed (see Overall). Only the group
  // weeks have a server live delta to strip; r32/r16 have none yet.
  const liveKey = phase === "week1" || phase === "week2" || phase === "week3" ? phase : null;
  const dispPhase = (e: Row) => e[phase] - (liveKey ? e.live?.[liveKey] ?? 0 : 0) + phaseGames(live.get(e.entrantId) ?? [], phase).reduce((s, g) => s + g.points, 0);
  // Tiebreak scoped to THIS phase's games: phase points, then phase exacts, then
  // phase results (see standingKey).
  const st = (e: Row) => e.statsByPhase?.[phase];
  const keyOf = (e: Row) => standingKey(dispPhase(e), st(e)?.exact ?? 0, st(e)?.result ?? 0);
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => keyOf(b) - keyOf(a) || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, keyOf, (e) => !!e.consensus);
  return (
    <div className={"fl-card overflow-hidden " + parentCols}>
      <div className={SUB_ROW + " py-2 text-[9px] uppercase tracking-wide text-muted"}>
        <div className="text-center">#</div><div className="text-left">Entrant</div>{showPred && <div className={anyLive ? "text-left" : "whitespace-nowrap text-center"}>{anyLive ? "Live Prediction" : "Next Prediction"}</div>}<div className="hidden text-center sm:block">Exact</div><div className="hidden text-center sm:block">Results</div><div className="hidden text-center sm:block">Form</div><div className="whitespace-nowrap text-center">{anyLive ? "Live Pts" : "Pts"}</div>
      </div>
      {list.map((e) => {
        const label = rankLabel(e);
        return e.consensus ? (
          <div key="everyone" className={SUB_ROW + " border-t border-line bg-gold-soft py-2.5 text-[13px]"}>
            <div className="text-center font-mono text-xs text-gold">{label}</div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-gold">👥 {e.name}</span>
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted">consensus</span>
            </div>
            {showPred && <div />}
            <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{st(e)?.exact ?? "–"}</div>
            <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{st(e)?.result ?? "–"}</div>
            <div className="hidden sm:block" />
            <div className="text-center font-mono text-sm font-semibold text-gold">{e[phase]}</div>
          </div>
        ) : (
          <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className={SUB_ROW + " border-t border-line py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}>
            <div className="text-center font-mono text-xs">
              {label !== "=" && Number(label) <= 3 && dispPhase(e) > 0 ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span> : <span className="text-muted">{label}</span>}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-cream">{e.name}</span>
              {e.entrantId === myId && <YouBadge />}
              {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
            </div>
            {showPred && (anyLive ? <LiveCell games={phaseGames(live.get(e.entrantId) ?? [], phase)} /> : <NextPredCell pick={next!.picks.get(e.entrantId)} />)}
            <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{st(e)?.exact ?? 0}</div>
            <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{st(e)?.result ?? 0}</div>
            <FormCell games={e.formByPhase?.[phase] ?? []} />
            <div className="text-center font-mono text-sm font-semibold text-cream">{dispPhase(e)}</div>
          </Link>
        );
      })}
    </div>
  );
}

function TopScorers() {
  const { data, isLoading, error } = useTopScorer();
  const { data: me } = useMe();
  const myId = me?.entrantId;
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the top scorer table.</p>;
  const list = data ?? [];
  const rankLabel = rankLabeller(list, (e) => e.total);
  const cols = "grid grid-cols-[28px_1fr_auto] items-center gap-2";
  return (
    <>
      <div className="fl-card overflow-hidden">
        <div className={cols + " border-b border-line px-4 py-2 text-[9px] uppercase tracking-wide text-muted"}>
          <div className="text-center">#</div><div>Entrant &amp; players</div><div className="text-right">Goals</div>
        </div>
        {list.map((e) => {
          const label = rankLabel(e);
          return (
          <Link
            key={e.entrantId}
            to={`/entrant/${e.entrantId}`}
            className={cols + " border-t border-line px-4 py-2.5 transition-colors first:border-t-0 hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
          >
            <div className="text-center font-mono text-xs">
              {label !== "=" && Number(label) <= 3 && e.total > 0 ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span> : <span className="text-muted">{label}</span>}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13.5px] text-cream">
                <span className="truncate">{e.name}</span>
                {e.entrantId === myId && <YouBadge />}
                {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                {e.players.map((p) => (
                  <span key={p.name} className="inline-flex items-center gap-1">
                    <span className="text-cream">{p.name}</span>
                    <span className="text-[10px] uppercase tracking-wide">{p.country}</span>
                    <span>{flagFor(SCORER_COUNTRY[p.country] ?? p.country)}</span>
                    <span className="font-mono text-gold">{p.goals}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right font-mono text-lg font-semibold text-cream">{e.total}</div>
          </Link>
          );
        })}
      </div>
    </>
  );
}

type Tab = "overall" | "knockout" | "topscorer" | Phase;
// Each tab is its own route: /standings/<slug>.
const TAB_SLUG: Record<Tab, string> = {
  overall: "overall", knockout: "knockout", topscorer: "top-scorer",
  week1: "week-1", week2: "week-2", week3: "week-3", r32: "round-of-32", r16: "round-of-16",
};
const SLUG_TAB: Record<string, Tab> = Object.fromEntries(
  Object.entries(TAB_SLUG).map(([k, v]) => [v, k as Tab]),
) as Record<string, Tab>;
const TABS: { key: Tab; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "knockout", label: "Knockout" },
  { key: "topscorer", label: "Top Scorer" },
  { key: "week1", label: "Week 1" },
  { key: "week2", label: "Week 2" },
  { key: "week3", label: "Week 3" },
  { key: "r32", label: "Round of 32" },
  { key: "r16", label: "Round of 16" },
];
const TITLES: Record<Tab, string> = {
  overall: "Overall", knockout: "Knockout competition", topscorer: "Top Scorer",
  week1: "Week 1", week2: "Week 2", week3: "Week 3", r32: "Round of 32", r16: "Round of 16",
};

export default function Leaderboard() {
  const navigate = useNavigate();
  const { tab: slug } = useParams();
  const tab: Tab = SLUG_TAB[slug ?? ""] ?? "overall";
  const setTab = (t: Tab) => navigate(`/standings/${TAB_SLUG[t]}`);
  const [showConsensus, setShowConsensus] = useState(false);
  const { data: consensus } = useConsensus();
  const { data: started } = usePhasesStarted();
  // Week / R32 tabs only appear once a game in that period has kicked off.
  const visibleTabs = TABS.filter((t) =>
    t.key === "week1" ? started?.week1
    : t.key === "week2" ? started?.week2
    : t.key === "week3" ? started?.week3
    : t.key === "r32" ? started?.r32
    : t.key === "r16" ? started?.r16
    : true,
  );
  const consensusTab = tab !== "knockout" && tab !== "topscorer";
  const everyone = showConsensus && consensusTab ? consensus ?? null : null;

  const sub =
    tab === "overall" ? "The main competition - every entrant ranked on all their predictions across the whole tournament."
    : tab === "knockout" ? "A second competition: entrant groups, scored on each player’s own World Cup group, top two into the bracket."
    : tab === "topscorer" ? "Each entrant has two players - the pair with the most combined goals across the tournament wins."
    : `Points scored in ${TITLES[tab]} only.`;

  return (
    <div className="fl-enter">
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Standings</div>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">{TITLES[tab]}</h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">{sub}</p>
      </div>

      <div className="mb-5">
        {/* Mobile: tabs collapse into a dropdown. */}
        <div className="flex items-center gap-2 sm:hidden">
          <TabSelect
            className="flex-1"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={visibleTabs.map((t) => ({ value: t.key, label: t.label }))}
          />
          {consensusTab && (
            <button
              onClick={() => setShowConsensus((v) => !v)}
              title="Score a pretend entrant who always picks the crowd's most-predicted scoreline"
              className={
                "shrink-0 rounded-lg px-3.5 py-2.5 text-sm transition-colors " +
                (showConsensus ? "border border-gold bg-gold-soft text-cream" : "border border-line text-muted hover:text-cream")
              }
            >
              {showConsensus ? "✓ " : ""}👥
            </button>
          )}
        </div>
        {/* Desktop: full pill row. */}
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {visibleTabs.map((t) => (
            <button key={t.key} className={subTab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
          {consensusTab && (
            <button
              onClick={() => setShowConsensus((v) => !v)}
              title="Score a pretend entrant who always picks the crowd's most-predicted scoreline"
              className={
                "ml-auto rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
                (showConsensus ? "border border-gold bg-gold-soft text-cream" : "border border-line text-muted hover:text-cream")
              }
            >
              {showConsensus ? "✓ " : ""}👥 Everyone
            </button>
          )}
        </div>
      </div>

      {tab === "overall" ? <Overall everyone={everyone} /> : tab === "knockout" ? <Knockout /> : tab === "topscorer" ? <TopScorers /> : <PhaseBoard phase={tab} everyone={everyone} />}
    </div>
  );
}
