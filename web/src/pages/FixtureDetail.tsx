import { useParams, Link } from "react-router-dom";
import { useFixture } from "../api.js";
import { flagFor } from "../flags.js";
import { useMe } from "../auth.js";
import ScoredChips from "../components/ScoredChips.js";

const YouBadge = () => <span className="shrink-0 rounded bg-gold/20 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-gold">You</span>;

const TIER: Record<string, { label: string; bg: string; fg: string }> = {
  exact: { label: "Exact", bg: "rgba(201,168,106,0.18)", fg: "#c9a86a" },
  result: { label: "Result", bg: "rgba(107,191,134,0.16)", fg: "#6bbf86" },
  diff: { label: "Partial", bg: "rgba(141,147,136,0.18)", fg: "#b9bdb4" },
  miss: { label: "No points", bg: "rgba(217,146,106,0.12)", fg: "#d9926a" },
};

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}

const STAGE: Record<string, string> = { GROUP: "Group", LAST_32: "Round of 32", LAST_16: "Round of 16", QF: "Quarter-final", SF: "Semi-final", THIRD_PLACE: "Third place", FINAL: "Final" };

export default function FixtureDetail() {
  const { id } = useParams();
  const { data, isLoading, error } = useFixture(id!);
  const { data: me } = useMe();
  const myId = me?.entrantId;

  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error || !data) return <p className="text-down">Couldn’t load this fixture.</p>;

  const m = data.match;
  const stage = m.stage === "GROUP" && m.group ? `Group ${m.group}` : STAGE[m.stage] ?? m.stage;
  const fmt = m.kickoff
    ? new Date(m.kickoff).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) + " BST"
    : "";
  const winners = data.board.filter((b) => (b.points ?? 0) > 0).length;

  // most common predicted scoreline
  const pickCounts = new Map<string, number>();
  for (const b of data.board) pickCounts.set(b.pick, (pickCounts.get(b.pick) ?? 0) + 1);
  let topPick = "";
  let topPickCount = 0;
  for (const [p, c] of pickCounts) if (c > topPickCount) { topPick = p; topPickCount = c; }

  // most common predicted result (outcome)
  const resultCounts = { home: 0, draw: 0, away: 0 };
  for (const b of data.board) {
    const [ph, pa] = b.pick.split("-").map(Number);
    if (ph > pa) resultCounts.home++;
    else if (ph < pa) resultCounts.away++;
    else resultCounts.draw++;
  }
  const topResultKey = (["home", "draw", "away"] as const).reduce((a, b) => (resultCounts[b] > resultCounts[a] ? b : a));
  const topResultLabel = topResultKey === "draw" ? "Draw" : `${topResultKey === "home" ? m.home : m.away} Win`;
  const topResultCount = resultCounts[topResultKey];

  return (
    <div className="fl-enter mx-auto max-w-2xl">

      <div className="fl-card mb-5 px-5 py-5">
        <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[1px] text-muted">
          <span>{stage}</span>
          <span>{m.status === "IN_PLAY" ? "Live" : m.status === "FINISHED" ? "Full time" : fmt}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 font-display text-2xl text-cream">
              {m.home ?? "TBD"}<span>{flagFor(m.home)}</span>
            </div>
            {m.homeCode && <div className="mt-0.5 font-mono text-[11px] text-muted">{m.homeCode}</div>}
          </div>
          <div className="font-mono text-3xl text-cream">
            {data.played ? `${m.homeScore}–${m.awayScore}` : <span className="text-xl text-muted">v</span>}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 font-display text-2xl text-cream">
              <span>{flagFor(m.away)}</span>{m.away ?? "TBD"}
            </div>
            {m.awayCode && <div className="mt-0.5 font-mono text-[11px] text-muted">{m.awayCode}</div>}
          </div>
        </div>
      </div>

      {data.events.length > 0 && (
        <div className="fl-card mb-5 px-5 py-4">
          <div className="mb-2 text-[10px] uppercase tracking-[1.5px] text-muted">Key events</div>
          <div className="space-y-1.5">
            {data.events.map((ev, i) => {
              const colour = ev.type === "goal" ? "#c9a86a" : "#d9534f";
              const tag = ev.type === "goal" ? "⚽ Goal" : "🟥 Red card";
              const team = ev.team === "home" ? m.home : m.away;
              return (
                <div key={i} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-9 shrink-0 font-mono text-[12px] text-muted">{ev.minute}'</span>
                  <span>{flagFor(team)}</span>
                  <span className="truncate text-cream">{ev.player ?? team}</span>
                  <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide" style={{ color: colour }}>{tag}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.board.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3">
          <div className="fl-card p-4">
            <div className="text-[10px] uppercase tracking-[1.5px] text-muted">Most predicted score</div>
            <div className="mt-1 font-mono text-2xl text-cream">{topPick ? topPick.replace("-", "–") : "–"}</div>
            <div className="text-[11px] text-muted">{topPickCount} {topPickCount === 1 ? "entrant" : "entrants"}</div>
          </div>
          <div className="fl-card p-4">
            <div className="text-[10px] uppercase tracking-[1.5px] text-muted">Most predicted result</div>
            <div className="mt-1 truncate font-display text-lg text-cream">{topResultLabel}</div>
            <div className="text-[11px] text-muted">{topResultCount} {topResultCount === 1 ? "entrant" : "entrants"}</div>
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg text-cream">Points this game</h2>
        {data.board.length > 0 && (
          <span className="text-[12px] text-muted">
            {data.played ? <><span className="font-mono text-gold">{winners}</span> scored</> : "predictions"}
          </span>
        )}
      </div>

      {data.board.length === 0 ? (
        <p className="fl-card px-5 py-8 text-center text-[13px] text-muted">
          {m.stage === "GROUP"
            ? "No predictions for this fixture."
            : "Knockout games aren’t scored per-game - they count toward each entrant’s progression points."}
        </p>
      ) : (
        <div className="fl-card overflow-hidden">
          <div className="grid grid-cols-[28px_minmax(0,1fr)_46px_108px_42px] items-center px-4 py-2 text-[10px] uppercase tracking-[1.5px] text-muted">
            <div>#</div><div>Entrant</div><div className="text-center">Prediction</div><div className="text-center">Scored</div><div className="text-right">Pts</div>
          </div>
          {data.board.map((b, i) => {
            const t = b.tier ? TIER[b.tier] : null;
            return (
              <Link key={b.entrantId} to={`/entrant/${b.entrantId}`} className={"grid grid-cols-[28px_minmax(0,1fr)_46px_108px_42px] items-center border-t border-line px-4 py-2.5 transition-colors hover:bg-gold-soft" + (b.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}>
                <div className="font-mono text-xs text-muted">{i + 1}</div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[10px] text-muted">{initials(b.name)}</div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] text-cream">{b.name}</span>
                    {b.entrantId === myId && <YouBadge />}
                  </div>
                </div>
                <div className="text-center font-mono text-[13px]">{b.pick}</div>
                <div className="flex justify-center">
                  {data.played && (
                    <ScoredChips pick={b.pick} hs={m.homeScore ?? 0} as={m.awayScore ?? 0} homeCode={m.homeCode ?? ""} awayCode={m.awayCode ?? ""} />
                  )}
                </div>
                <div className="text-right font-mono text-base" style={{ color: data.played ? (t?.fg ?? "#8d9388") : "#8d9388" }}>{data.played ? `+${b.points}` : "–"}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
