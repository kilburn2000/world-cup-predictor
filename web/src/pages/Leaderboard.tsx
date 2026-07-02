import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useGroups, useLeaderboard, useStats, useConsensus, usePhasesStarted, useTopScorer, useLiveMatches, useFixtures, useEntrantKnockout, type GroupEntrant, type StatLeader, type Consensus, type LiveTier, type FormGame, type LiveMatch, type LiveBoardRow, type EntrantKoTie } from "../api.js";
import { standingKey, knockoutGroupKey } from "@wc/shared";
import TabSelect from "../components/TabSelect.js";
import ScoredChips from "../components/ScoredChips.js";
import PointsPill from "../components/PointsPill.js";
import KoOutcomeChip from "../components/KoOutcomeChip.js";
import FormCell from "../components/FormCell.js";
import TrendModal from "../components/TrendModal.js";
import { flagFor } from "../flags.js";
import { useMe } from "../auth.js";

// Rank cell that, when clicked, opens the entrant's position-trend modal. Lives
// inside the row <Link>, so it stops the click from navigating to the entrant.
function RankCell({ label, top3, onOpen }: { label: string; top3: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      title="View position trend"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
      className="flex items-center justify-center font-mono text-xs"
    >
      {top3 ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold transition hover:ring-1 hover:ring-gold">{label}</span>
      ) : (
        <span className="text-muted underline-offset-2 transition hover:text-gold hover:underline">{label}</span>
      )}
    </button>
  );
}

// Per-entrant provisional points from matches in play right now: the points each
// would win if every live game ended at its current score, plus what they're
// scoring on (for the chips). Built from each live match's precomputed board.
type LiveGame = { pick: string; hs: number; as: number; home: string; away: string; homeCode: string; awayCode: string; minute: number | null; tier: LiveTier | null; points: number; group: string | null; stage: string; matchday: number | null; predHome?: string | null; predAway?: string | null; predHomeName?: string | null; predAwayName?: string | null; penSide?: "home" | "away" | null };
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
        arr.push({ pick: b.pick, hs: mt.homeScore, as: mt.awayScore, home: mt.home, away: mt.away, homeCode: mt.homeCode, awayCode: mt.awayCode, minute: mt.minute ?? null, tier: b.tier, points: b.points, group: mt.group ?? null, stage: mt.stage, matchday: mt.matchday ?? null, predHome: b.predHome, predAway: b.predAway, predHomeName: b.predHomeName, predAwayName: b.predAwayName, penSide: b.penSide });
        m.set(b.entrantId, arr);
      }
    }
    return m;
  }, [data]);
}

// One live game's prediction: the entrant's predicted score + scoring chip (the
// points pill lives in its own adjacent column - see LiveCell). Shared by the
// Overall, Knockout and per-phase standings tables.
function LiveLine({ g }: { g: LiveGame }) {
  const ko = g.stage !== "GROUP" && g.predHome;
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      {ko ? (
        // Knockout: show the teams the entrant predicted (flags + FIFA codes) around
        // their score, since their matchup can differ from the actual fixture.
        <span className="mr-1.5 flex items-center gap-1 font-mono text-[10px]">
          <span>{flagFor(g.predHomeName)}</span>
          <span className="text-muted">{g.predHome}{g.penSide === "home" ? "(p)" : ""}</span>
          <span className="text-cream/90">{g.pick.replace("-", "–")}</span>
          <span className="text-muted">{g.predAway}{g.penSide === "away" ? "(p)" : ""}</span>
          <span>{flagFor(g.predAwayName)}</span>
        </span>
      ) : (
        <span className="mr-1.5 font-mono text-[10px] text-cream/90">{g.pick.replace("-", "–")}</span>
      )}
      {ko ? (
        <KoOutcomeChip
          points={g.points} homeCode={g.homeCode} awayCode={g.awayCode}
          predHome={Number(g.pick.split("-")[0])} predAway={Number(g.pick.split("-")[1])}
          actualHome={g.hs} actualAway={g.as}
          homeCorrect={g.predHomeName === g.home} awayCorrect={g.predAwayName === g.away}
        />
      ) : (
        <ScoredChips pick={g.pick} hs={g.hs} as={g.as} homeCode={g.homeCode} awayCode={g.awayCode} />
      )}
    </span>
  );
}

// Hover tooltip for a live game: fixture, the entrant's pick vs the live score,
// and the scoring chips. Portal'd to body so a card's overflow can't clip it.
function LiveTip({ tip }: { tip: { g: LiveGame; x: number; y: number } }) {
  const g = tip.g;
  return createPortal(
    <div className="pointer-events-none fixed z-[60]" style={{ left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)" }}>
      <div className="flex flex-col items-center gap-1 rounded-lg border bg-[#0f120e] px-2.5 py-2 shadow-xl" style={{ borderColor: "rgba(217,83,79,0.6)" }}>
        <span className="whitespace-nowrap font-mono text-[11px] text-cream">{flagFor(g.home)} {g.homeCode} v {g.awayCode} {flagFor(g.away)}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] text-[#d9534f]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
          LIVE · {g.hs}-{g.as}{g.minute != null ? ` · ${g.minute}'` : ""}
        </span>
        {g.stage !== "GROUP" && g.predHome ? (
          <span className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-muted">
            Pred <span>{flagFor(g.predHomeName)}</span> {g.predHome}{g.penSide === "home" ? "(p)" : ""}
            <span className="text-cream">{g.pick.replace("-", "–")}</span>
            {g.predAway}{g.penSide === "away" ? "(p)" : ""} <span>{flagFor(g.predAwayName)}</span>
          </span>
        ) : (
          <span className="whitespace-nowrap font-mono text-[10px] text-muted">Pred {g.pick.replace("-", "–")}</span>
        )}
        <span className="flex items-center gap-1">
          {g.stage !== "GROUP" && g.predHome ? (
            <KoOutcomeChip
              points={g.points} homeCode={g.homeCode} awayCode={g.awayCode}
              predHome={Number(g.pick.split("-")[0])} predAway={Number(g.pick.split("-")[1])}
              actualHome={g.hs} actualAway={g.as}
              homeCorrect={g.predHomeName === g.home} awayCorrect={g.predAwayName === g.away}
            />
          ) : (
            <ScoredChips pick={g.pick} hs={g.hs} as={g.as} homeCode={g.homeCode} awayCode={g.awayCode} />
          )}
          <PointsPill points={g.points} tier={g.tier} />
        </span>
      </div>
    </div>,
    document.body,
  );
}

// Renders TWO grid cells: the live prediction, then its points pill in the next
// column. When several games are live the prediction cell becomes a slider
// rotating through them every 5s (synced across rows via the wall clock) rather
// than stacking; a single live game shows statically. Hovering a line shows its
// game tooltip and freezes the rotation so it doesn't slide out from under the
// cursor - the pill cell tracks the same (frozen) game.
const ROTATE_MS = 5000;
function LiveCell({ games }: { games: LiveGame[] }) {
  const rotate = games.length > 1;
  const [, force] = useState(0);
  const [tip, setTip] = useState<{ g: LiveGame; x: number; y: number } | null>(null);
  const idxRef = useRef(0);
  useEffect(() => {
    if (!rotate) return;
    const id = setInterval(() => force((t) => t + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [rotate]);
  if (!games.length) return <><div /><div /></>;
  const enter = (g: LiveGame, ev: ReactMouseEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ g, x: r.left + r.width / 2, y: r.top });
  };
  if (rotate && !tip) idxRef.current = Math.floor(Date.now() / ROTATE_MS) % games.length; // freeze while hovering
  const idx = rotate ? idxRef.current : 0;
  const g = games[idx];
  return (
    <>
      <div className="hidden min-w-0 items-center gap-2 overflow-hidden lg:flex">
        <span key={idx} className={(rotate ? "fl-enter " : "") + "inline-flex"} onMouseEnter={(e) => enter(g, e)} onMouseLeave={() => setTip(null)}><LiveLine g={g} /></span>
        {rotate && (
          <span className="flex shrink-0 items-center gap-0.5">
            {games.map((_, i) => (
              <span key={i} className={"h-1 w-1 rounded-full " + (i === idx ? "bg-gold" : "bg-muted/40")} />
            ))}
          </span>
        )}
        {tip && <LiveTip tip={tip} />}
      </div>
      <div className="flex items-center justify-center"><PointsPill points={g.points} tier={g.tier} /></div>
    </>
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

// Trophy badge for the winner of a completed competition.
const WinnerBadge = () => <span className="shrink-0 rounded bg-gold/25 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-gold" title="Winner">🏆 Winner</span>;
// Row highlight: gold for a declared winner, the softer gold for the logged-in entrant.
const rowAccent = (won: boolean, you: boolean) =>
  won ? " bg-gold/20 ring-1 ring-inset ring-gold/70" : you ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "";

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

function GroupRow({ e, myId, label, liveGames = [], anyLive, showPred, nextRow, nextStage, qualified, onOpenTrend }: { e: GroupEntrant; myId?: number | null; label: string; liveGames?: LiveGame[]; anyLive: boolean; showPred: boolean; nextRow?: LiveBoardRow; nextStage?: string; qualified?: boolean; onOpenTrend: () => void }) {
  return (
    <Link
      to={`/entrant/${e.entrantId}`}
      className={SUB_ROW + " border-t border-line py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
    >
      <RankCell label={label} top3={!!e.qualifying} onOpen={onOpenTrend} />
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={"truncate " + (e.qualifying ? "text-cream" : "text-muted")}>{e.name}</span>
        {qualified && <span className="shrink-0 rounded bg-gold/20 px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-gold" title="Qualified for the knockout bracket">Q</span>}
        {e.entrantId === myId && <YouBadge />}
        {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
      </div>
      {showPred && (anyLive ? <LiveCell games={liveGames} /> : <NextPredCell row={nextRow} stage={nextStage} />)}
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

type Row = { entrantId: number; name: string; week1: number; week2: number; week3: number; r32: number; r16: number; total: number; exactCount?: number; resultCount?: number; nameIncomplete?: boolean; consensus?: boolean; live?: { total: number; week1: number; week2: number; week3: number; r32: number; r16: number; exact: number }; last5?: FormGame[]; formByPhase?: Partial<Record<Phase, FormGame[]>>; statsByPhase?: Partial<Record<Phase, { exact: number; result: number }>> };
const consensusRow = (c: Consensus): Row => ({ entrantId: -1, name: c.name, week1: c.week1, week2: c.week2, week3: c.week3, r32: c.r32, r16: c.r16, total: c.total, consensus: true });

// Standings tables are a CSS subgrid: the card is the grid (its columns set by a
// `grid-cols-[...]` template with `auto` content columns), and the header + every
// row are SUB_ROW - a full-width subgrid sharing those columns. So each column
// auto-sizes to the widest of its header/cells across all rows (no fixed widths,
// no padding gaps inside a column) while the rows stay perfectly aligned. The
// first/last tracks are gutters; rank sits in column 2 (col-start-2), a 1fr name
// column fills the slack so the stat columns group on the right.
const SUB_ROW = "col-span-full grid grid-cols-subgrid items-center gap-x-5 px-4";

// Grid template for a standings table. The entrant name (the 1fr column) is the
// priority and must never be squeezed out. Columns reveal progressively:
//   mobile  - rank, name, pts (+ the compact live points pill when a game is live)
//   sm:     - Exact / Results / Form join in
//   lg:     - the wide prediction column (flags + FIFA codes for a knockout) joins,
//             splitting into prediction + points-pill when live
// so the name keeps its room on phones and small-desktop widths alike.
function tableCols(showPred: boolean, anyLive: boolean): string {
  if (!showPred) return "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto]";
  if (anyLive) return "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto_auto]";
  return "grid gap-x-5 grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto] lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto]";
}

// The next not-yet-started fixture matching a scope (earliest kickoff) + each
// entrant's predicted score for it, for the "Next Prediction" column shown when
// nothing's live. Picks come straight off the fixture's board.
function nextPredFor(fixtures: LiveMatch[] | undefined, scope: (m: LiveMatch) => boolean): { game: LiveMatch; picks: Map<number, LiveBoardRow> } | null {
  const game = (fixtures ?? [])
    .filter((m) => m.status === "SCHEDULED" && m.kickoff && scope(m))
    .sort((a, b) => ((a.kickoff ?? "") < (b.kickoff ?? "") ? -1 : 1))[0];
  if (!game) return null;
  const picks = new Map<number, LiveBoardRow>();
  for (const b of game.board ?? []) picks.set(b.entrantId, b);
  return { game, picks };
}

// One entrant's prediction for the next game: their score, and for a knockout tie
// the teams they predicted too (flags + FIFA codes), since the matchup can differ.
// The prediction column is secondary to the entrant name, so it's hidden on mobile
// (where it would squeeze the name) and only shows from sm: up.
function NextPredCell({ row, stage, game }: { row?: LiveBoardRow; stage?: string; game?: LiveMatch }) {
  if (!row) return <div className="hidden text-center lg:block"><span className="text-muted">–</span></div>;
  const st = stage ?? game?.stage;
  if (st && st !== "GROUP" && row.predHome) {
    // Tick a predicted team once the tie is actually drawn and the entrant put that
    // team in the matching position (home/away) - a correctly-placed knockout pick.
    const homeOk = !!game?.homeKnown && !!row.predHomeName && row.predHomeName === game.home;
    const awayOk = !!game?.awayKnown && !!row.predAwayName && row.predAwayName === game.away;
    return (
      <div className="hidden items-center justify-center gap-1 font-mono text-[10px] lg:flex">
        <span>{flagFor(row.predHomeName)}</span>
        <span className="text-muted">{row.predHome}{row.penSide === "home" ? "(p)" : ""}{homeOk && <span className="text-[#6bbf86]"> ✓</span>}</span>
        <span className="text-cream">{row.pick.replace("-", "–")}</span>
        <span className="text-muted">{row.predAway}{row.penSide === "away" ? "(p)" : ""}</span>
        <span>{flagFor(row.predAwayName)}{awayOk && <span className="text-[#6bbf86]"> ✓</span>}</span>
      </div>
    );
  }
  return <div className="hidden text-center font-mono text-[12px] text-cream lg:block">{row.pick.replace("-", "–")}</div>;
}

// A strip above a standings table flagging that a game is currently being scored,
// so the "Pts" column reads as live without relabelling it. The fixture itself is
// already shown in the header bar, so this just states the standings are live.
// Renders nothing when no relevant game is in play.
function LiveBanner({ games }: { games: LiveMatch[] }) {
  if (!games.length) return null;
  return (
    <div className="mb-3 flex items-center gap-1.5 rounded-xl px-3.5 py-2.5" style={{ border: "1px solid rgba(217,83,79,0.3)", background: "rgba(217,83,79,0.07)" }}>
      <span className="flex items-center gap-1.5 text-[#d9534f]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
        <span className="text-[10px] font-semibold uppercase tracking-[1.5px]">{games.length > 1 ? "Games in progress" : "Game in progress"}</span>
      </span>
      <span className="text-[11px] text-muted">Standings are live</span>
    </div>
  );
}

// In-play fixtures (any), used to populate the banner above tables.
const liveFixtures = (fixtures: LiveMatch[] | undefined, scope: (m: LiveMatch) => boolean = () => true) =>
  (fixtures ?? []).filter((m) => (m.status === "IN_PLAY" || m.status === "PAUSED") && scope(m));

function Overall({ everyone }: { everyone: Consensus | null }) {
  const { data, isLoading, error } = useLeaderboard();
  const { data: stats } = useStats();
  const { data: me } = useMe();
  const { data: fixtures } = useFixtures();
  const { data: phases } = usePhasesStarted();
  const live = useLivePoints();
  const myId = me?.entrantId;
  const [trendFor, setTrendFor] = useState<{ id: number; name: string } | null>(null);
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  // A dedicated Live column (chip + points pill per in-play game) only appears
  // while something's actually being scored, so the table is unchanged otherwise.
  const anyLive = [...live.values()].some((g) => g.length > 0);
  const liveCount = Math.max(0, ...[...live.values()].map((g) => g.length));
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
  const parentCols = tableCols(showPred, anyLive);
  // points first, then exacts, then results (see standingKey), then name.
  const keyOf = (e: Row) => standingKey(dispTotal(e), e.exactCount ?? 0, e.resultCount ?? 0);
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => keyOf(b) - keyOf(a) || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, keyOf, (e) => !!e.consensus);
  // Once the whole tournament is over, gold-highlight the winner(s) - the top of
  // the table (ties share the crown).
  const maxKey = Math.max(0, ...list.filter((e) => !e.consensus).map(keyOf));
  const won = (e: Row) => !!phases?.done && !e.consensus && maxKey > 0 && keyOf(e) === maxKey;
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
          {showPred && <div className={anyLive ? "hidden text-left lg:block" : "hidden whitespace-nowrap text-center lg:block"}>{anyLive ? (liveCount > 1 ? "Live Predictions" : "Live Prediction") : "Next Prediction"}</div>}{showPred && anyLive && <div className="whitespace-nowrap text-center">Live Pts</div>}
          <div className="hidden text-center sm:block">Exact</div>
          <div className="hidden text-center sm:block">Results</div>
          <div className="hidden text-center sm:block">Form</div>
          <div className="whitespace-nowrap text-center">Pts</div>
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
              {showPred && <div className="hidden lg:block" />}{showPred && anyLive && <div />}
              <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{e.exactCount ?? "–"}</div>
              <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{e.resultCount ?? "–"}</div>
              <div className="hidden sm:block" />
              <div className="text-center font-mono text-sm font-semibold text-gold">{e.total}</div>
            </div>
          ) : (
            (() => {
            const liveGames = live.get(e.entrantId) ?? [];
            return (
            <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className={SUB_ROW + " border-t border-line py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + rowAccent(won(e), e.entrantId === myId)}>
              <RankCell label={label} top3={label !== "=" && Number(label) <= 3} onOpen={() => setTrendFor({ id: e.entrantId, name: e.name })} />
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={"truncate " + (won(e) ? "text-gold" : "text-cream")}>{e.name}</span>
                {won(e) && <WinnerBadge />}
                {e.entrantId === myId && <YouBadge />}
                {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
              </div>
              {showPred && (anyLive ? <LiveCell games={liveGames} /> : <NextPredCell row={next!.picks.get(e.entrantId)} game={next!.game} />)}
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
      {trendFor && <TrendModal entrantId={trendFor.id} entrantName={trendFor.name} scope="overall" scopeLabel="Overall" onClose={() => setTrendFor(null)} />}
    </>
  );
}

function EntrantGroups() {
  const { data, isLoading, error } = useGroups();
  const { data: me } = useMe();
  const { data: fixtures } = useFixtures();
  const { data: phases } = usePhasesStarted();
  const live = useLivePoints();
  // Once the WC group stage is done, the top two of each entrant group have
  // qualified for the knockout bracket - mark them with a Q.
  const groupStageDone = !!phases?.week3Done;
  const [trendFor, setTrendFor] = useState<{ id: number; name: string; group: string } | null>(null);
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the groups.</p>;
  if (!data?.length) return <p className="text-muted">No groups set yet.</p>;
  return (
    <>
      <div className="space-y-4">
        {data.map((g) => {
          // Group competition: group points, then overall points (the backend
          // already sorts + decides who qualifies the same way).
          const keyOf = (e: GroupEntrant) => knockoutGroupKey(e.total, e.overallTotal ?? 0);
          const rankLabel = rankLabeller(g.entrants, keyOf);
          const liveOf = (eid: number) => groupGames(live.get(eid) ?? [], g.group);
          const anyLive = g.entrants.some((e) => liveOf(e.entrantId).length > 0);
          const liveCount = Math.max(0, ...g.entrants.map((e) => liveOf(e.entrantId).length));
          // Next upcoming game in THIS WC group, for the Next Prediction column.
          const next = anyLive ? null : nextPredFor(fixtures, (m) => m.stage === "GROUP" && m.group === g.group);
          const showPred = anyLive || !!next;
          // Subgrid columns (see SUB_ROW): gutter, rank, name(1fr), [live/next pred],
          // exact, results, form, pts, gutter.
          const parentCols = tableCols(showPred, anyLive);
          return (
            <div key={g.group} className={"fl-card overflow-hidden " + parentCols}>
              <div className={SUB_ROW + " border-b border-line py-3 text-[9px] uppercase tracking-wide text-muted"}>
                <div className="col-span-2 font-display text-lg normal-case tracking-normal text-cream">Group {g.group}</div>
                {showPred && <div className={anyLive ? "hidden text-left lg:block" : "hidden whitespace-nowrap text-center lg:block"}>{anyLive ? (liveCount > 1 ? "Live Predictions" : "Live Prediction") : "Next Prediction"}</div>}{showPred && anyLive && <div className="whitespace-nowrap text-center">Live Pts</div>}
                <div className="hidden text-center sm:block">Exact</div>
                <div className="hidden text-center sm:block">Results</div>
                <div className="hidden text-center sm:block">Form</div>
                <div className="text-center">Pts</div>
              </div>
              {g.entrants.map((e, i) => (
                <Fragment key={e.entrantId}>
                  <GroupRow e={e} myId={me?.entrantId} label={rankLabel(e)} liveGames={liveOf(e.entrantId)} anyLive={anyLive} showPred={showPred} nextRow={next?.picks.get(e.entrantId)} nextStage={next?.game.stage} qualified={groupStageDone && !!e.qualifying} onOpenTrend={() => setTrendFor({ id: e.entrantId, name: e.name, group: g.group })} />
                  {i === 1 && <div className="col-span-full border-t border-dashed" style={{ borderColor: "rgba(201,168,106,0.4)" }} />}
                </Fragment>
              ))}
            </div>
          );
        })}
      </div>
      {trendFor && <TrendModal entrantId={trendFor.id} entrantName={trendFor.name} scope="knockout" scopeLabel={`Knockout · Group ${trendFor.group}`} onClose={() => setTrendFor(null)} />}
    </>
  );
}

// One player in a knockout tie: name + their points for that round, greened +
// ticked when they won the tie (once the round is decided), muted when they lost.
function TiePlayer({ p, winnerId, decided, started, myId }: { p: EntrantKoTie["a"]; winnerId: number | null; decided: boolean; started: boolean; myId?: number | null }) {
  const won = decided && p != null && winnerId === p.id;
  const lost = decided && p != null && winnerId != null && winnerId !== p.id;
  return (
    <div className={"flex items-center justify-between gap-2 py-0.5 text-[13px] " + (won ? "text-gold" : lost ? "text-muted" : "text-cream")}>
      <span className="flex min-w-0 items-center gap-1.5">
        {p ? (
          <Link to={`/entrant/${p.id}`} className={"truncate hover:underline " + (won ? "font-medium" : "")}>{p.name}</Link>
        ) : <span className="text-muted">TBD</span>}
        {won && <span className="shrink-0 text-gold" title="Through to the next round">▶</span>}
        {p && p.id === myId && <YouBadge />}
      </span>
      {/* no score shown until the round has actually kicked off */}
      {p && <span className="shrink-0 font-mono text-[12px]">{started ? p.points : "–"}</span>}
    </div>
  );
}

function EntrantBracket() {
  const { data, isLoading } = useEntrantKnockout();
  const { data: me } = useMe();
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (!data?.qualified) return <p className="text-[13px] text-muted">The knockout bracket is seeded once the group stage finishes - the top two of each entrant group go through.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data.rounds.map((r) => (
        <div key={r.round} className="fl-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="font-display text-sm text-cream">{r.label}</span>
            {r.decided ? <span className="text-[9px] uppercase tracking-wide text-gold">Decided</span>
              : r.started ? <span className="text-[9px] uppercase tracking-wide text-[#d9534f]">In progress</span>
              : <span className="text-[9px] uppercase tracking-wide text-muted">Not started</span>}
          </div>
          <div className="px-4 py-1">
            {r.ties.map((t, i) => (
              <div key={i} className="border-t border-line py-1.5 first:border-t-0">
                <TiePlayer p={t.a} winnerId={t.winnerId} decided={t.decided} started={r.started} myId={me?.entrantId} />
                <TiePlayer p={t.b} winnerId={t.winnerId} decided={t.decided} started={r.started} myId={me?.entrantId} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// The Knockout competition: the entrant group stage, then (once the groups finish)
// the player-vs-player bracket. A sub-toggle switches between the two phases.
function Knockout() {
  const { data: ko } = useEntrantKnockout();
  const [phase, setPhase] = useState<"group" | "bracket" | null>(null);
  const qualified = !!ko?.qualified;
  const bracketBegun = !!ko?.rounds?.[0]?.started; // WC Round of 16 has kicked off
  const eff = phase ?? (qualified && bracketBegun ? "bracket" : "group");
  const pill = (active: boolean) =>
    "rounded-lg px-3.5 py-1.5 text-sm transition-colors " + (active ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");
  return (
    <>
      {qualified && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button className={pill(eff === "group")} onClick={() => setPhase("group")}>Group Stage</button>
          <button className={pill(eff === "bracket")} onClick={() => setPhase("bracket")}>Knockout Bracket</button>
        </div>
      )}
      {eff === "bracket" ? <EntrantBracket /> : <EntrantGroups />}
    </>
  );
}

type Phase = "week1" | "week2" | "week3" | "r32" | "r16";

function PhaseBoard({ phase, everyone }: { phase: Phase; everyone: Consensus | null }) {
  const { data, isLoading, error } = useLeaderboard();
  const { data: me } = useMe();
  const { data: fixtures } = useFixtures();
  const { data: phases } = usePhasesStarted();
  const live = useLivePoints();
  const myId = me?.entrantId;
  const [trendFor, setTrendFor] = useState<{ id: number; name: string } | null>(null);
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  const anyLive = [...live.values()].some((g) => phaseGames(g, phase).length > 0);
  const liveCount = Math.max(0, ...[...live.values()].map((g) => phaseGames(g, phase).length));
  // Next upcoming fixture in THIS phase, for the Next Prediction column.
  const inPhase = (m: LiveMatch) =>
    phase === "r32" ? m.stage === "LAST_32"
    : phase === "r16" ? m.stage === "LAST_16"
    : m.stage === "GROUP" && m.matchday === ({ week1: 1, week2: 2, week3: 3 } as const)[phase];
  const next = anyLive ? null : nextPredFor(fixtures, inPhase);
  const showPred = anyLive || !!next;
  // Subgrid columns (see SUB_ROW): rank, name(1fr), [live/next pred], exact, results, form, pts.
  const parentCols = tableCols(showPred, anyLive);
  // Live-derive the phase total from the live feed (see Overall): strip the server's
  // live delta for this phase, then add the fresh live-feed figure. Every phase
  // (weeks + r32/r16) now carries a live delta, so the key is just the phase.
  const dispPhase = (e: Row) => e[phase] - (e.live?.[phase] ?? 0) + phaseGames(live.get(e.entrantId) ?? [], phase).reduce((s, g) => s + g.points, 0);
  // Tiebreak scoped to THIS phase's games: phase points, then phase exacts, then
  // phase results (see standingKey).
  const st = (e: Row) => e.statsByPhase?.[phase];
  const keyOf = (e: Row) => standingKey(dispPhase(e), st(e)?.exact ?? 0, st(e)?.result ?? 0);
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => keyOf(b) - keyOf(a) || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, keyOf, (e) => !!e.consensus);
  // Gold-highlight the winner once this week/round is fully decided.
  const phaseDone = !!(phase === "week1" ? phases?.week1Done : phase === "week2" ? phases?.week2Done : phase === "week3" ? phases?.week3Done : phase === "r32" ? phases?.r32Done : phases?.r16Done);
  const maxKey = Math.max(0, ...list.filter((e) => !e.consensus).map(keyOf));
  const won = (e: Row) => phaseDone && !e.consensus && maxKey > 0 && keyOf(e) === maxKey;
  return (
    <>
    <div className={"fl-card overflow-hidden " + parentCols}>
      <div className={SUB_ROW + " py-2 text-[9px] uppercase tracking-wide text-muted"}>
        <div className="text-center">#</div><div className="text-left">Entrant</div>{showPred && <div className={anyLive ? "hidden text-left lg:block" : "hidden whitespace-nowrap text-center lg:block"}>{anyLive ? (liveCount > 1 ? "Live Predictions" : "Live Prediction") : "Next Prediction"}</div>}{showPred && anyLive && <div className="whitespace-nowrap text-center">Live Pts</div>}<div className="hidden text-center sm:block">Exact</div><div className="hidden text-center sm:block">Results</div><div className="hidden text-center sm:block">Form</div><div className="whitespace-nowrap text-center">Pts</div>
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
            {showPred && <div className="hidden lg:block" />}{showPred && anyLive && <div />}
            <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{st(e)?.exact ?? "–"}</div>
            <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{st(e)?.result ?? "–"}</div>
            <div className="hidden sm:block" />
            <div className="text-center font-mono text-sm font-semibold text-gold">{e[phase]}</div>
          </div>
        ) : (
          <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className={SUB_ROW + " border-t border-line py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + rowAccent(won(e), e.entrantId === myId)}>
            <RankCell label={label} top3={label !== "=" && Number(label) <= 3 && dispPhase(e) > 0} onOpen={() => setTrendFor({ id: e.entrantId, name: e.name })} />
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={"truncate " + (won(e) ? "text-gold" : "text-cream")}>{e.name}</span>
              {won(e) && <WinnerBadge />}
              {e.entrantId === myId && <YouBadge />}
              {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
            </div>
            {showPred && (anyLive ? <LiveCell games={phaseGames(live.get(e.entrantId) ?? [], phase)} /> : <NextPredCell row={next!.picks.get(e.entrantId)} game={next!.game} />)}
            <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{st(e)?.exact ?? 0}</div>
            <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{st(e)?.result ?? 0}</div>
            <FormCell games={e.formByPhase?.[phase] ?? []} />
            <div className="text-center font-mono text-sm font-semibold text-cream">{dispPhase(e)}</div>
          </Link>
        );
      })}
    </div>
    {trendFor && <TrendModal entrantId={trendFor.id} entrantName={trendFor.name} scope={phase} scopeLabel={TITLES[phase]} onClose={() => setTrendFor(null)} />}
    </>
  );
}

function TopScorers() {
  const { data, isLoading, error } = useTopScorer();
  const { data: me } = useMe();
  const { data: phases } = usePhasesStarted();
  const myId = me?.entrantId;
  const [trendFor, setTrendFor] = useState<{ id: number; name: string } | null>(null);
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the top scorer table.</p>;
  const list = data ?? [];
  const rankLabel = rankLabeller(list, (e) => e.total);
  // Top scorer is settled at tournament end; gold-highlight the winner(s) then.
  const maxGoals = Math.max(0, ...list.map((e) => e.total));
  const won = (e: typeof list[number]) => !!phases?.done && maxGoals > 0 && e.total === maxGoals;
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
            className={cols + " border-t border-line px-4 py-2.5 transition-colors first:border-t-0 hover:bg-gold-soft" + rowAccent(won(e), e.entrantId === myId)}
          >
            <RankCell label={label} top3={label !== "=" && Number(label) <= 3 && e.total > 0} onOpen={() => setTrendFor({ id: e.entrantId, name: e.name })} />
            <div className="min-w-0">
              <div className={"flex items-center gap-1.5 text-[13.5px] " + (won(e) ? "text-gold" : "text-cream")}>
                <span className="truncate">{e.name}</span>
                {won(e) && <WinnerBadge />}
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
      {trendFor && <TrendModal entrantId={trendFor.id} entrantName={trendFor.name} scope="topscorer" scopeLabel="Top Scorer" onClose={() => setTrendFor(null)} />}
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
  const { data: fixtures } = useFixtures();
  // Week / R32 tabs only appear once a game in that period has kicked off.
  const visibleTabs = TABS.filter((t) =>
    t.key === "week1" ? started?.week1
    : t.key === "week2" ? started?.week2
    : t.key === "week3" ? started?.week3
    : t.key === "r32" ? started?.r32
    : t.key === "r16" ? started?.r16
    : true,
  );
  // A competition is "complete" once its period is fully decided: weeks/rounds when
  // that phase finishes, overall/knockout/top-scorer at tournament end.
  const isComplete = (key: Tab): boolean =>
    key === "week1" ? !!started?.week1Done
    : key === "week2" ? !!started?.week2Done
    : key === "week3" ? !!started?.week3Done
    : key === "r32" ? !!started?.r32Done
    : key === "r16" ? !!started?.r16Done
    : !!started?.done;
  const consensusTab = tab !== "knockout" && tab !== "topscorer";
  const everyone = showConsensus && consensusTab ? consensus ?? null : null;

  const sub =
    tab === "overall" ? "The main competition - every entrant ranked on all their predictions across the whole tournament."
    : tab === "knockout" ? (
        <>A second competition: each entrant is scored <span className="text-cream">only on their own World Cup group’s games</span> (Group A on WC Group A, etc.). The <span className="text-gold">top two</span> in each group qualify for the knockout bracket.</>
      )
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
            options={visibleTabs.map((t) => ({ value: t.key, label: t.label + (isComplete(t.key) ? " ✓" : "") }))}
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
            <button key={t.key} className={subTab(tab === t.key)} onClick={() => setTab(t.key)}>
              {t.label}{isComplete(t.key) && <span className="ml-1.5 text-gold">✓</span>}
            </button>
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

      <LiveBanner games={liveFixtures(fixtures)} />

      {tab === "overall" ? <Overall everyone={everyone} /> : tab === "knockout" ? <Knockout /> : tab === "topscorer" ? <TopScorers /> : <PhaseBoard phase={tab} everyone={everyone} />}
    </div>
  );
}
