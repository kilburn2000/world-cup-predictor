import { useLeaderboard, useTopScorer, usePhasesStarted, type LeaderboardRow, type PhasesStarted } from "../api.js";
import { standingKey } from "@wc/shared";

type Field = "week1" | "week2" | "week3" | "r32" | "r16" | "knockout";

// A prize is settled once its period is fully decided. Weekly/round prizes lock
// in when that phase finishes; the overall placings, wooden spoon, top scorer and
// the knockout competition only at the end of the tournament.
const DONE_FLAG: Record<Field, keyof PhasesStarted> = {
  week1: "week1Done", week2: "week2Done", week3: "week3Done", r32: "r32Done", r16: "r16Done", knockout: "done",
};

// Small status chip: "Won" once settled, otherwise "Projected".
function PrizeStatus({ won }: { won: boolean }) {
  return won ? (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gold">✓ Won</span>
  ) : (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">Projected</span>
  );
}

const PHASE_PRIZES: { label: string; amount: number; field: Field }[] = [
  { label: "Highest Week 1 Score", amount: 125, field: "week1" },
  { label: "Highest Week 2 Score", amount: 125, field: "week2" },
  { label: "Highest Week 3 Score", amount: 125, field: "week3" },
  { label: "Highest Round of 32 Score", amount: 125, field: "r32" },
  { label: "Highest Round of 16 Score", amount: 125, field: "r16" },
  { label: "Knockout Competition Winner", amount: 125, field: "knockout" },
];

const OVERALL_PRIZES = [
  { place: 1, amount: 500 }, { place: 2, amount: 325 }, { place: 3, amount: 200 },
  { place: 4, amount: 175 }, { place: 5, amount: 150 }, { place: 6, amount: 125 },
  { place: 7, amount: 100 }, { place: 8, amount: 90 }, { place: 9, amount: 80 }, { place: 10, amount: 80 },
];
const prizeAt = (place: number) => OVERALL_PRIZES.find((p) => p.place === place)?.amount ?? 0;
const LAST_AMOUNT = 75; // wooden spoon
const TOP_SCORER_AMOUNT = 125; // side competition

const gbp = (n: number) =>
  "£" + n.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const total = LAST_AMOUNT + TOP_SCORER_AMOUNT + [...PHASE_PRIZES, ...OVERALL_PRIZES].reduce((s, p) => s + p.amount, 0);
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};
const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const holderText = (names: string[]) => (names.length === 0 ? "-" : names.join(", "));

interface PrizeGroup {
  start: number;
  end: number;
  size: number;
  names: string[];
  pool: number;
  share: number;
}

export default function Prizes() {
  const { data } = useLeaderboard();
  const { data: phases } = usePhasesStarted();
  const rows = data ?? [];
  const overallWon = !!phases?.done; // overall placings + wooden spoon + top scorer
  // Same composite ranking as the standings: points, then exacts, then results.
  const keyOf = (e: LeaderboardRow) => standingKey(e.total, e.exactCount ?? 0, e.resultCount ?? 0);
  const phaseKeyOf = (e: LeaderboardRow, f: "week1" | "week2" | "week3" | "r32" | "r16") =>
    standingKey(e[f], e.statsByPhase?.[f]?.exact ?? 0, e.statsByPhase?.[f]?.result ?? 0);
  const { data: scorers } = useTopScorer();
  const scorerRows = scorers ?? [];
  const topGoals = scorerRows[0]?.total ?? 0;
  const scorerHolder = !scorerRows.length
    ? "-"
    : topGoals === 0
      ? "No goals scored as yet"
      : holderText(scorerRows.filter((e) => e.total === topGoals).map((e) => e.name));

  // Highest phase score, tie-broken by exacts then results within that phase.
  const weeklyLeaders = (field: "week1" | "week2" | "week3" | "r32" | "r16"): string[] => {
    if (!rows.length || Math.max(0, ...rows.map((e) => e[field])) <= 0) return [];
    const max = Math.max(...rows.map((e) => phaseKeyOf(e, field)));
    return rows.filter((e) => phaseKeyOf(e, field) === max).map((e) => e.name);
  };

  const scorerLeaders = topGoals > 0 ? scorerRows.filter((e) => e.total === topGoals).map((e) => e.name) : [];
  const scorerShare = scorerLeaders.length ? TOP_SCORER_AMOUNT / scorerLeaders.length : TOP_SCORER_AMOUNT;

  // Project the prize table from the current standings: entrants level on points
  // are joint, and pool the prize money for the positions they collectively
  // occupy, splitting it equally. (rows arrive sorted by total desc.)
  const groups: PrizeGroup[] = [];
  let i = 0;
  let place = 1;
  while (i < rows.length && place <= 10) {
    const t = keyOf(rows[i]);
    let j = i;
    while (j < rows.length && keyOf(rows[j]) === t) j++;
    const size = j - i;
    const start = place;
    const end = place + size - 1;
    let pool = 0;
    for (let p = start; p <= end; p++) pool += prizeAt(p);
    groups.push({ start, end, size, names: rows.slice(i, j).map((e) => e.name), pool, share: pool / size });
    place = end + 1;
    i = j;
  }

  // Wooden spoon: the strictly lowest composite key (points, then exacts, then results).
  const minKey = rows.length ? Math.min(...rows.map(keyOf)) : null;
  const lastNames = minKey === null ? [] : rows.filter((e) => keyOf(e) === minKey).map((e) => e.name);
  const lastShare = lastNames.length ? LAST_AMOUNT / lastNames.length : LAST_AMOUNT;

  return (
    <div className="fl-enter">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[1.8px] text-gold">The pot</div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">Prizes</h1>
        </div>
        <div className="fl-card px-4 py-2.5 text-right">
          <div className="text-[10px] uppercase tracking-[1.5px] text-muted">Total prize pool</div>
          <div className="font-mono text-2xl text-gold">{gbp(total)}</div>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[11px] uppercase tracking-[1.8px] text-gold">Overall standings</h2>
        <PrizeStatus won={overallWon} />
      </div>
      <div className="fl-card mb-7 overflow-hidden">
        {groups.length === 0 && (
          <div className="px-4 py-4 text-[13px] text-muted">Standings will appear once games are played.</div>
        )}
        {groups.flatMap((g) => {
          const top3 = g.start <= 3;
          const joint = g.size > 1;
          const posLabel = joint ? `Joint ${ordinal(g.start)}` : `${ordinal(g.start)} Overall`;
          return g.names.map((name, idx) => (
            <div key={`${g.start}-${idx}`} className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-line px-4 py-3 first:border-t-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px] " +
                    (top3 ? "bg-gold/15 font-semibold text-gold" : "border border-line text-muted")
                  }
                >
                  {MEDAL[g.start] ?? g.start}
                </span>
                <div className="min-w-0">
                  <div className="text-cream">{name}</div>
                  <div className="text-[11px] text-muted">{posLabel}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-base font-semibold text-gold">{gbp(g.share)}</div>
                {joint && (
                  <div className="text-[10px] text-muted">{gbp(g.pool)} across {ordinal(g.start)}–{ordinal(g.end)}</div>
                )}
              </div>
            </div>
          ));
        })}
        {/* wooden spoon */}
        {lastNames.map((name, idx) => (
          <div key={`spoon-${idx}`} className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-line px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-[13px]">🥄</span>
              <div className="min-w-0">
                <div className="text-cream">{name}</div>
                <div className="text-[11px] text-muted">Wooden Spoon</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-base font-semibold text-gold">{gbp(lastShare)}</div>
              {lastNames.length > 1 && (
                <div className="text-[10px] text-muted">{gbp(LAST_AMOUNT)} across {lastNames.length} entrants</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-gold">Weekly &amp; round prizes</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {PHASE_PRIZES.map((p) => {
          const won = !!phases?.[DONE_FLAG[p.field]];
          const leaders = p.field === "knockout" ? [] : weeklyLeaders(p.field);
          const share = leaders.length ? p.amount / leaders.length : p.amount;
          const holder =
            p.field === "knockout" ? "Not decided yet" : leaders.length ? holderText(leaders) : "Not played yet";
          return (
            <div key={p.label} className="fl-card px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13.5px] text-cream">{p.label}</span>
                  <PrizeStatus won={won} />
                </div>
                <span className="shrink-0 font-mono text-base font-semibold text-gold">
                  {gbp(share)}{leaders.length > 1 ? " each" : ""}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">{holder}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 mt-7 flex items-center gap-2">
        <h2 className="text-[11px] uppercase tracking-[1.8px] text-gold">Top scorer</h2>
        <PrizeStatus won={overallWon} />
      </div>
      <div className="fl-card px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13.5px] text-cream">Most combined goals from your two players</span>
          <span className="font-mono text-base font-semibold text-gold">
            {gbp(scorerShare)}{scorerLeaders.length > 1 ? " each" : ""}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-muted">{scorerHolder}</div>
      </div>
    </div>
  );
}
