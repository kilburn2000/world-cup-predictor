import { useState } from "react";
import { type LiveMatch } from "../api.js";
import { flagFor } from "../flags.js";
import { useMe } from "../auth.js";
import ScoredChips from "./ScoredChips.js";
import PointsPill from "./PointsPill.js";

const YouBadge = () => <span className="shrink-0 rounded bg-gold/20 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-gold">You</span>;

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}

const STAGE_LABELS: Record<string, string> = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  THIRD_PLACE: "Third-place play-off",
  FINAL: "Final",
};
function stageLabel(m: LiveMatch) {
  if (m.stage === "GROUP") return m.group ? `Group ${m.group}` : "Group stage";
  return STAGE_LABELS[m.stage] ?? m.stage;
}

/** Small football icon - clearly distinct from a yellow card. */
function BallIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#f4f1e8" stroke="#10110d" strokeWidth="1.2" />
      <polygon points="12,6.6 16,9.5 14.5,14 9.5,14 8,9.5" fill="#10110d" />
      <path
        d="M12 2.2 L12 6.6 M21.6 9 L16 9.5 M18.2 19.2 L14.5 14 M5.8 19.2 L9.5 14 M2.4 9 L8 9.5"
        stroke="#10110d"
        strokeWidth="1"
        fill="none"
      />
    </svg>
  );
}

/** Derive the match phase + status pill from status/minute/events. */
function phaseOf(m: LiveMatch) {
  const goals = m.events.filter((e) => e.type === "goal");
  const lastGoal = goals.length ? goals[goals.length - 1] : null;
  const goalFlash =
    m.status === "IN_PLAY" && lastGoal != null && m.minute != null && lastGoal.minute === m.minute;

  if (m.status === "SCHEDULED") {
    const t = m.kickoff ? new Date(m.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Upcoming";
    return { label: t, color: "#8d9388", bg: "rgba(141,147,136,0.12)", border: "rgba(141,147,136,0.3)", pulse: false, goalFlash: false, lastGoal: null };
  }
  if (m.status === "FINISHED")
    return { label: "Full time", color: "#b9bdb4", bg: "rgba(185,189,180,0.12)", border: "rgba(185,189,180,0.32)", pulse: false, goalFlash: false, lastGoal };
  if (m.status === "PAUSED")
    return { label: "Half time", color: "#e3c558", bg: "rgba(227,197,88,0.12)", border: "rgba(227,197,88,0.4)", pulse: false, goalFlash: false, lastGoal };
  if (m.half && /half-?time/i.test(m.half))
    return { label: "Half-time", color: "#e3c558", bg: "rgba(227,197,88,0.12)", border: "rgba(227,197,88,0.4)", pulse: false, goalFlash: false, lastGoal };
  if (m.minute != null && m.minute <= 1)
    return { label: "Kick-off", color: "#c9a86a", bg: "rgba(201,168,106,0.12)", border: "rgba(201,168,106,0.4)", pulse: true, goalFlash, lastGoal };
  const shortHalf = m.half
    ? /extra/i.test(m.half) ? "ET" : /second/i.test(m.half) ? "2nd" : /first/i.test(m.half) ? "1st" : ""
    : "";
  return {
    label: (m.minute != null ? `${m.minute}'` : "Live") + (shortHalf ? ` · ${shortHalf}` : ""),
    color: "#d9534f",
    bg: "rgba(217,83,79,0.1)",
    border: "rgba(217,83,79,0.35)",
    pulse: true,
    goalFlash,
    lastGoal,
  };
}

const frac = (n?: number, total?: number) =>
  `${n ?? 0}/${total ?? 0} (${total ? Math.round(((n ?? 0) / total) * 100) : 0}%)`;

export default function MatchCard({ m }: { m: LiveMatch }) {
  const ph = phaseOf(m);
  // Once a game's under way, rank predictions by the points they'd score at the
  // current scoreline; before kick-off (points null) the order is unchanged.
  const board = [...m.board].sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name));
  const { data: me } = useMe();
  const myId = me?.entrantId;
  const [show, setShow] = useState(false);
  const finished = m.status === "FINISHED";
  // a points figure takes its chip's colour (gold exact / green points / red none)
  const PTS_TONE: Record<string, string> = { exact: "#c9a86a", result: "#6bbf86", diff: "#6bbf86", miss: "#e08a84" };
  const total = board.length;
  const exactN = board.filter((b) => b.tier === "exact").length;
  const resultN = board.filter((b) => b.tier === "exact" || b.tier === "result").length;
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="fl-card overflow-hidden">
      {/* scoreboard */}
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[1px] text-muted">
            {stageLabel(m)}
            {m.venue ? ` · ${m.venue}` : ""}
          </div>
          <div
            className="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[11.5px] uppercase tracking-[0.5px]"
            style={{ color: ph.color, background: ph.bg, borderColor: ph.border }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: ph.color, animation: ph.pulse ? "loadDots 1.2s infinite" : undefined }}
            />
            {ph.label}
          </div>
        </div>

        {/* GOAL! flash */}
        {ph.goalFlash && ph.lastGoal && (
          <div
            className="mb-3 flex items-center justify-center gap-2.5 rounded-[10px] border px-3.5 py-2"
            style={{ background: "rgba(201,168,106,0.14)", borderColor: "rgba(201,168,106,0.4)" }}
          >
            <BallIcon size={18} />
            <span className="font-mono text-xs uppercase tracking-[2px] text-gold">
              Goal - {ph.lastGoal.player ?? ""} ({ph.lastGoal.team === "home" ? m.homeCode : m.awayCode})
            </span>
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 font-display text-base leading-tight text-cream sm:text-2xl">
              {m.home}<span className="align-middle">{flagFor(m.home)}</span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">{m.homeCode}</div>
          </div>
          <div className="flex items-center gap-3.5 font-mono text-[34px] tracking-wide sm:text-[38px]">
            {m.status === "SCHEDULED" ? (
              <span className="text-xl text-muted">v</span>
            ) : (
              <>
                <span>{m.homeScore}</span>
                <span className="text-2xl text-muted">–</span>
                <span>{m.awayScore}</span>
              </>
            )}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 font-display text-base leading-tight text-cream sm:text-2xl">
              <span className="align-middle">{flagFor(m.away)}</span>{m.away}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">{m.awayCode}</div>
          </div>
        </div>
      </div>

      {/* logged-in entrant's own prediction; chips + points once the game's under way */}
      {m.myPick && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-line px-5 py-2 text-[12.5px] sm:px-6">
          <span className="text-[9px] uppercase tracking-wide text-gold/80">Your prediction</span>
          <span className="font-mono text-cream">{m.myPick.replace("-", "–")}</span>
          {(m.status === "FINISHED" || m.status === "IN_PLAY") && (
            <>
              <ScoredChips pick={m.myPick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />
              {m.myPoints != null && <PointsPill points={m.myPoints} tier={m.myTier} />}
            </>
          )}
        </div>
      )}

      {/* finished → who got it right; otherwise → the crowd's most-predicted */}
      {m.mostCommonScore && (
        <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 border-b border-line px-5 py-2.5 text-[12.5px] text-muted sm:px-6">
          {finished ? (
            <>
              <span className="text-[9px] uppercase tracking-wide">Got it right</span>
              <span><span className="mr-2 font-mono text-cream">{exactN}</span>Exact ({pctOf(exactN)}%)</span>
              <span>·</span>
              <span><span className="mr-2 font-mono text-cream">{resultN}</span>Result ({pctOf(resultN)}%)</span>
            </>
          ) : (
            <>
              <span className="text-[9px] uppercase tracking-wide">Most predicted</span>
              <span>
                <span className="font-mono text-cream">{m.mostCommonScore.replace("-", "–")}</span> {frac(m.mostCommonScoreCount, m.mostCommonTotal)}
              </span>
              <span>·</span>
              <span>
                {m.mostCommonResult === "DRAW" ? (
                  <span className="font-mono text-cream">Draw</span>
                ) : (
                  <>
                    <span className="mr-1">{flagFor(m.mostCommonResult === "HOME" ? m.home : m.away)}</span>
                    <span className="font-mono text-cream">{m.mostCommonResult === "HOME" ? m.homeCode : m.awayCode}</span> Win
                  </>
                )}{" "}
                {frac(m.mostCommonResultCount, m.mostCommonTotal)}
              </span>
            </>
          )}
        </div>
      )}

      {m.events && m.events.length > 0 && (
        <div className="border-b border-line px-5 py-3 sm:px-6">
          <div className="mb-1.5 text-[9px] uppercase tracking-wide text-muted">Key events</div>
          <div className="space-y-1">
            {[...m.events].sort((a, b) => a.minute - b.minute).map((ev, i) => {
              const colour = ev.type === "goal" ? "#c9a86a" : "#d9534f";
              const tag = ev.type === "goal" ? "⚽ Goal" : "🟥 Red card";
              const team = ev.team === "home" ? m.home : m.away;
              return (
                <div key={i} className="flex items-center gap-2 text-[12.5px]">
                  <span className="w-8 shrink-0 font-mono text-[11px] text-muted">{ev.minute}'</span>
                  <span>{flagFor(team)}</span>
                  <span className="truncate text-cream">{ev.player ?? team}</span>
                  <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide" style={{ color: colour }}>{tag}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {board.length > 0 && (
        <>
          <button
            onClick={() => setShow((v) => !v)}
            className="block w-full px-5 py-2.5 text-center text-[11.5px] uppercase tracking-wide text-muted transition-colors hover:text-cream sm:px-6"
          >
            {show ? "Hide all predictions ▴" : "Show all predictions ▾"}
          </button>
          {show && (
            <div className="px-5 pb-5 sm:px-6">
              <div className="grid grid-cols-[30px_1fr_54px_56px] items-center px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-muted sm:grid-cols-[34px_1fr_56px_104px_52px]">
                <div>#</div>
                <div>Entrant</div>
                <div className="text-center">Prediction</div>
                <div className="hidden text-center sm:block">Scored</div>
                <div className="text-right">Pts</div>
              </div>
              {board.map((b, i) => {
                return (
                  <div key={b.entrantId} className="border-t border-line">
                    <div className={"grid grid-cols-[30px_1fr_54px_56px] items-center rounded-lg px-3 py-2.5 sm:grid-cols-[34px_1fr_56px_104px_52px]" + (b.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}>
                      <div className="font-mono text-xs text-muted">{i + 1}</div>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[10px] text-muted">
                          {initials(b.name)}
                        </div>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13.5px] text-cream">{b.name}</span>
                          {b.entrantId === myId && <YouBadge />}
                        </div>
                      </div>
                      <div className="text-center font-mono text-[13px]">{b.pick}</div>
                      <div className="hidden justify-center sm:flex">
                        {b.points != null && <ScoredChips pick={b.pick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />}
                      </div>
                      <div className="text-right font-mono text-base font-semibold" style={{ color: b.tier ? PTS_TONE[b.tier] : "#8d9388" }}>
                        {b.points != null ? `${b.points}${b.points === 1 ? "pt" : "pts"}` : "–"}
                      </div>
                    </div>
                    {b.points != null && (
                      <div className="flex justify-end px-3 pb-2.5 sm:hidden">
                        <ScoredChips pick={b.pick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
