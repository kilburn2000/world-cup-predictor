import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useGroups, useLeaderboard, useStats, useConsensus, usePhasesStarted, useTopScorer, type GroupEntrant, type StatLeader, type Consensus, type PhasesStarted } from "../api.js";
import TabSelect from "../components/TabSelect.js";
import { flagFor } from "../flags.js";
import { useMe } from "../auth.js";

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

// A points cell: the number once there's a score, "0" once the phase has kicked
// off (so a started week reads 0, not blank), and "–" before it begins.
const cell = (v: number, started?: boolean) => (v > 0 ? v : started ? 0 : "–");

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

function LiveDot() {
  return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />;
}

function GroupRow({ e, started, myId, label }: { e: GroupEntrant; started?: PhasesStarted; myId?: number | null; label: string }) {
  return (
    <Link
      to={`/entrant/${e.entrantId}`}
      className={"grid grid-cols-[28px_1fr_34px_34px_34px_44px] items-center gap-1 border-t border-line px-3 py-2 text-[13px] transition-colors first:border-t-0 hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
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
        {e.live && <LiveDot />}
      </div>
      <div className="text-center font-mono text-[11px] text-muted">{cell(e.week1, started?.week1)}</div>
      <div className="text-center font-mono text-[11px] text-muted">{cell(e.week2, started?.week2)}</div>
      <div className="text-center font-mono text-[11px] text-muted">{cell(e.week3, started?.week3)}</div>
      <div className="text-right font-mono text-sm font-semibold text-cream">{e.total}</div>
    </Link>
  );
}

const subTab = (active: boolean) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (active ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

type Row = { entrantId: number; name: string; week1: number; week2: number; week3: number; r32: number; total: number; nameIncomplete?: boolean; consensus?: boolean };
const consensusRow = (c: Consensus): Row => ({ entrantId: -1, name: c.name, week1: c.week1, week2: c.week2, week3: c.week3, r32: c.r32, total: c.total, consensus: true });

function Overall({ everyone }: { everyone: Consensus | null }) {
  const { data, isLoading, error } = useLeaderboard();
  const { data: stats } = useStats();
  const { data: started } = usePhasesStarted();
  const { data: me } = useMe();
  const myId = me?.entrantId;
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  const cols = "grid grid-cols-[30px_1fr_30px_30px_30px_38px_44px] items-center gap-1";
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, (e) => e.total, (e) => !!e.consensus);
  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Most correct scores" l={stats?.mostExact} unit="exact score" />
        <StatCard label="Most correct results" l={stats?.mostResults} unit="result" />
        <StatCard label="Longest exact streak" l={stats?.longestExactStreak} unit="in a row" unitPlural="in a row" />
        <StatCard label="Longest result streak" l={stats?.longestResultStreak} unit="in a row" unitPlural="in a row" />
      </div>
      <div className="fl-card overflow-hidden">
        <div className={cols + " px-4 py-2 text-[9px] uppercase tracking-wide text-muted"}>
          <div>#</div><div>Entrant</div>
          <div className="text-center">W1</div><div className="text-center">W2</div><div className="text-center">W3</div>
          <div className="text-center">R32</div><div className="text-right">Pts</div>
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
              <div className="text-center font-mono text-[11px] text-gold/80">{cell(e.week1, started?.week1)}</div>
              <div className="text-center font-mono text-[11px] text-gold/80">{cell(e.week2, started?.week2)}</div>
              <div className="text-center font-mono text-[11px] text-gold/80">{cell(e.week3, started?.week3)}</div>
              <div className="text-center font-mono text-[11px] text-gold/80">{cell(e.r32, started?.r32)}</div>
              <div className="text-right font-mono text-sm font-semibold text-gold">{e.total}</div>
            </div>
          ) : (
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
              <div className="text-center font-mono text-[11px] text-muted">{cell(e.week1, started?.week1)}</div>
              <div className="text-center font-mono text-[11px] text-muted">{cell(e.week2, started?.week2)}</div>
              <div className="text-center font-mono text-[11px] text-muted">{cell(e.week3, started?.week3)}</div>
              <div className="text-center font-mono text-[11px] text-muted">{cell(e.r32, started?.r32)}</div>
              <div className="text-right font-mono text-sm font-semibold text-cream">{e.total}</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Knockout() {
  const { data, isLoading, error } = useGroups();
  const { data: started } = usePhasesStarted();
  const { data: me } = useMe();
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
          return (
            <div key={g.group} className="fl-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="font-display text-lg text-cream">Group {g.group}</div>
                <div className="grid grid-cols-[34px_34px_34px_44px] gap-1 text-[9px] uppercase tracking-wide text-muted">
                  <div className="text-center">W1</div><div className="text-center">W2</div><div className="text-center">W3</div><div className="text-right">Pts</div>
                </div>
              </div>
              {g.entrants.map((e, i) => (
                <div key={e.entrantId}>
                  <GroupRow e={e} started={started} myId={me?.entrantId} label={rankLabel(e)} />
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

type Phase = "week1" | "week2" | "week3" | "r32";

function PhaseBoard({ phase, everyone }: { phase: Phase; everyone: Consensus | null }) {
  const { data, isLoading, error } = useLeaderboard();
  const { data: me } = useMe();
  const myId = me?.entrantId;
  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the leaderboard.</p>;
  const cols = "grid grid-cols-[36px_1fr_52px] items-center gap-1";
  const list: Row[] = [...(data ?? []), ...(everyone ? [consensusRow(everyone)] : [])].sort(
    (a, b) => b[phase] - a[phase] || a.name.localeCompare(b.name),
  );
  const rankLabel = rankLabeller(list, (e) => e[phase], (e) => !!e.consensus);
  return (
    <div className="fl-card overflow-hidden">
      <div className={cols + " px-4 py-2 text-[9px] uppercase tracking-wide text-muted"}>
        <div>#</div><div>Entrant</div><div className="text-right">Pts</div>
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
            <div className="text-right font-mono text-sm font-semibold text-gold">{e[phase]}</div>
          </div>
        ) : (
          <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className={cols + " border-t border-line px-4 py-2.5 text-[13px] transition-colors hover:bg-gold-soft" + (e.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}>
            <div className="font-mono text-xs">
              {label !== "=" && Number(label) <= 3 && e[phase] > 0 ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{label}</span> : <span className="pl-1.5 text-muted">{label}</span>}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-cream">{e.name}</span>
              {e.entrantId === myId && <YouBadge />}
              {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
            </div>
            <div className="text-right font-mono text-sm font-semibold text-cream">{e[phase]}</div>
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
  week1: "week-1", week2: "week-2", week3: "week-3", r32: "round-of-32",
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
];
const TITLES: Record<Tab, string> = {
  overall: "Overall", knockout: "Knockout competition", topscorer: "Top Scorer",
  week1: "Week 1", week2: "Week 2", week3: "Week 3", r32: "Round of 32",
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
