import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useGroups, useLeaderboard, useStats, useConsensus, usePhasesStarted, useTopScorer, useLiveMatches, type GroupEntrant, type StatLeader, type Consensus, type LiveTier, type FormGame } from "../api.js";
import TabSelect from "../components/TabSelect.js";
import ScoredChips from "../components/ScoredChips.js";
import PointsPill from "../components/PointsPill.js";
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

function GroupRow({ e, myId, label, liveGames = [], anyLive, cols }: { e: GroupEntrant; myId?: number | null; label: string; liveGames?: LiveGame[]; anyLive: boolean; cols: string }) {
  return (
    <Link
      to={`/entrant/${e.entrantId}`}
      className={cols + " border-t border-line px-3 py-2 text-[13px] transition-colors first:border-t-0 hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
    >
      <div className="font-mono text-xs">
        {e.qualifying ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span>
        ) : (
          <span className="pl-1.5 text-muted">{label}</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={"truncate " + (e.qualifying ? "text-cream" : "text-muted")}>{e.name}</span>
        {e.entrantId === myId && <YouBadge />}
        {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
      </div>
      {anyLive && <LiveCell games={liveGames} />}
      <FormCell games={e.last5 ?? []} className="flex items-center justify-center gap-0.5" />
      <div className="text-right font-mono text-sm font-semibold text-cream">{e.total}</div>
    </Link>
  );
}

const subTab = (active: boolean) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (active ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

type Row = { entrantId: number; name: string; week1: number; week2: number; week3: number; r32: number; r16: number; total: number; exactCount?: number; resultCount?: number; nameIncomplete?: boolean; consensus?: boolean; live?: { total: number; week1: number; week2: number; week3: number; exact: number }; last5?: FormGame[]; formByPhase?: Partial<Record<Phase, FormGame[]>> };
const consensusRow = (c: Consensus): Row => ({ entrantId: -1, name: c.name, week1: c.week1, week2: c.week2, week3: c.week3, r32: c.r32, r16: c.r16, total: c.total, consensus: true });

// A row of colour-coded points chips for an entrant's recent games. Hovering a
// chip pops a tooltip (portal'd to body so the card's overflow-hidden can't clip
// it) with the fixture, the prediction vs the final score, and the outcome chip.
function FormCell({ games, className = "hidden items-center justify-center gap-0.5 sm:flex" }: { games: FormGame[]; className?: string }) {
  const [tip, setTip] = useState<{ g: FormGame; x: number; y: number } | null>(null);
  return (
    <div className={className}>
      {games.length ? games.map((g, i) => (
        <span
          key={i}
          className="inline-flex"
          onMouseEnter={(ev) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setTip({ g, x: r.left + r.width / 2, y: r.top }); }}
          onMouseLeave={() => setTip(null)}
        >
          <PointsPill points={g.points} tier={g.tier} compact />
        </span>
      )) : <span className="font-mono text-[11px] text-muted">–</span>}
      {tip && createPortal(
        <div className="pointer-events-none fixed z-[60]" style={{ left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)" }}>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-[#0f120e] px-2.5 py-2 shadow-xl">
            <span className="font-mono text-[11px] text-cream">{flagFor(tip.g.homeName)} {tip.g.home} v {tip.g.away} {flagFor(tip.g.awayName)}</span>
            <span className="font-mono text-[10px] text-muted">Pred {tip.g.predHome}-{tip.g.predAway} · Final {tip.g.hs}-{tip.g.as}</span>
            <ScoredChips pick={`${tip.g.predHome}-${tip.g.predAway}`} hs={tip.g.hs} as={tip.g.as} homeCode={tip.g.home} awayCode={tip.g.away} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Overall({ everyone }: { everyone: Consensus | null }) {
  const { data, isLoading, error } = useLeaderboard();
  const { data: stats } = useStats();
  const { data: me } = useMe();
  const live = useLivePoints();
  const myId = me?.entrantId;
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  // A dedicated Live column (chip + points pill per in-play game) only appears
  // while something's actually being scored, so the table is unchanged otherwise.
  const anyLive = [...live.values()].some((g) => g.length > 0);
  // Re-derive the total from the confirmed base + the live feed (same source as
  // the chips) so the points column moves the instant a goal lands, not a poll
  // behind. e.total already folds in the server's (slower) live delta, so strip
  // it back out (e.live.total) before adding the fresh client figure.
  const liveOf = (id: number) => (live.get(id) ?? []).reduce((s, g) => s + g.points, 0);
  const dispTotal = (e: Row) => e.total - (e.live?.total ?? 0) + liveOf(e.entrantId);
  // The Live column is a FIXED width (content wraps inside it) so a row with three
  // live games can't stretch the column and shove every other column out of line.
  // Each row is its own grid, so the Form column must be a FIXED width (not auto)
  // - otherwise it sizes to each row's own content (a word in the header, five
  // chips in a body row) and the mismatch shifts every later column out of line.
  const cols = anyLive
    ? "grid grid-cols-[30px_1fr_150px_44px] sm:grid-cols-[30px_1fr_186px_48px_56px_96px_44px] items-center gap-1"
    : "grid grid-cols-[30px_1fr_44px] sm:grid-cols-[30px_1fr_48px_56px_96px_44px] items-center gap-1";
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => dispTotal(b) - dispTotal(a) || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, dispTotal, (e) => !!e.consensus);
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Most Exact Scores" l={stats?.mostExact} unit="exact score" />
        <StatCard label="Most correct results" l={stats?.mostResults} unit="result" />
        <StatCard label="Longest Exact Score Streak" l={stats?.longestExactStreak} unit="in a row" unitPlural="in a row" />
        <StatCard label="Longest Correct Result Streak" l={stats?.longestResultStreak} unit="in a row" unitPlural="in a row" />
      </div>
      <div className="fl-card overflow-hidden">
        <div className={cols + " px-4 py-2 text-[9px] uppercase tracking-wide text-muted"}>
          <div>#</div><div>Entrant</div>
          {anyLive && <div className="text-left">Live Prediction</div>}
          <div className="hidden text-center sm:block">Exact</div>
          <div className="hidden text-center sm:block">Results</div>
          <div className="hidden text-center sm:block">Form</div>
          <div className="whitespace-nowrap text-right">{anyLive ? "Live Pts" : "Pts"}</div>
        </div>
        {list.map((e) => {
          const label = rankLabel(e);
          return e.consensus ? (
            <div key="everyone" className={cols + " border-t border-line bg-gold-soft px-4 py-2.5 text-[13px]"}>
              <div className="pl-1.5 font-mono text-xs text-gold">{label}</div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium text-gold">👥 {e.name}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted">consensus</span>
              </div>
              {anyLive && <div />}
              <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{e.exactCount ?? "–"}</div>
              <div className="hidden text-center font-mono text-[11px] text-gold/80 sm:block">{e.resultCount ?? "–"}</div>
              <div className="hidden sm:block" />
              <div className="text-right font-mono text-sm font-semibold text-gold">{e.total}</div>
            </div>
          ) : (
            (() => {
            const liveGames = live.get(e.entrantId) ?? [];
            return (
            <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className={cols + " border-t border-line px-4 py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}>
              <div className="font-mono text-xs">
                {label !== "=" && Number(label) <= 3 ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span>
                ) : (
                  <span className="pl-1.5 text-muted">{label}</span>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-cream">{e.name}</span>
                {e.entrantId === myId && <YouBadge />}
                {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
              </div>
              {anyLive && <LiveCell games={liveGames} />}
              <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{e.exactCount ?? 0}</div>
              <div className="hidden text-center font-mono text-[11px] text-muted sm:block">{e.resultCount ?? 0}</div>
              <FormCell games={e.last5 ?? []} />
              <div className="text-right font-mono text-sm font-semibold text-cream">{dispTotal(e)}</div>
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
      <div className="grid gap-4 lg:grid-cols-2">
        {data.map((g) => {
          const rankLabel = rankLabeller(g.entrants, (e) => e.total);
          const liveOf = (eid: number) => groupGames(live.get(eid) ?? [], g.group);
          const anyLive = g.entrants.some((e) => liveOf(e.entrantId).length > 0);
          // Form is a FIXED width so the header and every row share identical
          // tracks (see the overall table); the Live column only appears when a
          // game in THIS WC group is in play.
          const cols = anyLive
            ? "grid grid-cols-[28px_1fr_130px_92px_44px] items-center gap-1"
            : "grid grid-cols-[28px_1fr_92px_44px] items-center gap-1";
          return (
            <div key={g.group} className="fl-card overflow-hidden">
              <div className={cols + " border-b border-line px-3 py-3 text-[9px] uppercase tracking-wide text-muted"}>
                <div className="col-span-2 font-display text-lg normal-case tracking-normal text-cream">Group {g.group}</div>
                {anyLive && <div className="text-left">Live</div>}
                <div className="text-center">Form</div>
                <div className="text-right">{anyLive ? "Live Pts" : "Pts"}</div>
              </div>
              {g.entrants.map((e, i) => (
                <div key={e.entrantId}>
                  <GroupRow e={e} myId={me?.entrantId} label={rankLabel(e)} liveGames={liveOf(e.entrantId)} anyLive={anyLive} cols={cols} />
                  {i === 1 && <div className="border-t border-dashed" style={{ borderColor: "rgba(201,168,106,0.4)" }} />}
                </div>
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
  const live = useLivePoints();
  const myId = me?.entrantId;
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  const anyLive = [...live.values()].some((g) => phaseGames(g, phase).length > 0);
  const cols = anyLive
    ? "grid grid-cols-[36px_1fr_150px_52px] sm:grid-cols-[36px_1fr_150px_92px_52px] items-center gap-1"
    : "grid grid-cols-[36px_1fr_52px] sm:grid-cols-[36px_1fr_92px_52px] items-center gap-1";
  // Live-derive the phase total from the live feed (see Overall). Only the group
  // weeks have a server live delta to strip; r32/r16 have none yet.
  const liveKey = phase === "week1" || phase === "week2" || phase === "week3" ? phase : null;
  const dispPhase = (e: Row) => e[phase] - (liveKey ? e.live?.[liveKey] ?? 0 : 0) + phaseGames(live.get(e.entrantId) ?? [], phase).reduce((s, g) => s + g.points, 0);
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => dispPhase(b) - dispPhase(a) || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, dispPhase, (e) => !!e.consensus);
  return (
    <div className="fl-card overflow-hidden">
      <div className={cols + " px-4 py-2 text-[9px] uppercase tracking-wide text-muted"}>
        <div>#</div><div>Entrant</div>{anyLive && <div className="text-left">Live Prediction</div>}<div className="hidden text-center sm:block">Form</div><div className="whitespace-nowrap text-right">{anyLive ? "Live Pts" : "Pts"}</div>
      </div>
      {list.map((e) => {
        const label = rankLabel(e);
        return e.consensus ? (
          <div key="everyone" className={cols + " border-t border-line bg-gold-soft px-4 py-2.5 text-[13px]"}>
            <div className="pl-1.5 font-mono text-xs text-gold">{label}</div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-medium text-gold">👥 {e.name}</span>
              <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted">consensus</span>
            </div>
            {anyLive && <div />}
            <div className="hidden sm:block" />
            <div className="text-right font-mono text-sm font-semibold text-gold">{e[phase]}</div>
          </div>
        ) : (
          <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className={cols + " border-t border-line px-4 py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}>
            <div className="font-mono text-xs">
              {label !== "=" && Number(label) <= 3 && dispPhase(e) > 0 ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span> : <span className="pl-1.5 text-muted">{label}</span>}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-cream">{e.name}</span>
              {e.entrantId === myId && <YouBadge />}
              {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
            </div>
            {anyLive && <LiveCell games={phaseGames(live.get(e.entrantId) ?? [], phase)} />}
            <FormCell games={e.formByPhase?.[phase] ?? []} />
            <div className="text-right font-mono text-sm font-semibold text-cream">{dispPhase(e)}</div>
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
          <div>#</div><div>Entrant &amp; players</div><div className="text-right">Goals</div>
        </div>
        {list.map((e) => {
          const label = rankLabel(e);
          return (
          <Link
            key={e.entrantId}
            to={`/entrant/${e.entrantId}`}
            className={cols + " border-t border-line px-4 py-2.5 transition-colors first:border-t-0 hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
          >
            <div className="font-mono text-xs">
              {label !== "=" && Number(label) <= 3 && e.total > 0 ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span> : <span className="pl-1.5 text-muted">{label}</span>}
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
