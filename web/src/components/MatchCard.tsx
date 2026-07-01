import { useState } from "react";
import { type LiveMatch } from "../api.js";
import { flagFor } from "../flags.js";
import { venueMeta } from "../venues.js";
import { useMe } from "../auth.js";
import ScoredChips from "./ScoredChips.js";
import KoOutcomeChip from "./KoOutcomeChip.js";
import PointsPill from "./PointsPill.js";

const YouBadge = () => <span className="shrink-0 rounded bg-gold/20 px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide text-gold">You</span>;

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
  // Standard competition rank on points: ties share a position (first shows the
  // number, the rest "="). Before kick-off everyone's points are null, so all are joint 1st.
  const rankFor = (i: number): string | number => {
    const pts = board[i].points ?? -1;
    if (i > 0 && (board[i - 1].points ?? -1) === pts) return "=";
    return 1 + board.filter((x) => (x.points ?? -1) > pts).length;
  };
  const { data: me } = useMe();
  const myId = me?.entrantId;
  const [show, setShow] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const finished = m.status === "FINISHED";
  const isLive = m.status === "IN_PLAY" || m.status === "PAUSED";
  // Before kick-off every prediction is level (points null), so the rank column is
  // pointless - drop it until the game's under way.
  const showRank = m.status !== "SCHEDULED";
  const boardCols = showRank ? "grid grid-cols-[30px_1fr_auto] sm:grid-cols-[34px_1fr_auto]" : "grid grid-cols-[1fr_auto]";
  const total = board.length;
  const exactN = board.filter((b) => b.tier === "exact").length;
  const resultN = board.filter((b) => b.tier === "exact" || b.tier === "result").length;
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const mine = board.find((b) => b.entrantId === myId);

  // A knockout pick: flag + code each side of the score; "(p)" marks the team the
  // entrant has advancing on penalties when they predicted a draw.
  const koPick = (g: { predHome?: string | null; predAway?: string | null; predHomeName?: string | null; predAwayName?: string | null; pick: string; penSide?: "home" | "away" | null }) => (
    <span className="inline-flex items-center gap-1 font-mono text-cream">
      <span>{flagFor(g.predHomeName)}</span>{g.predHome}{g.penSide === "home" ? "(p)" : ""}
      <span className="mx-0.5">{g.pick.replace("-", "–")}</span>
      {g.predAway}{g.penSide === "away" ? "(p)" : ""}<span>{flagFor(g.predAwayName)}</span>
    </span>
  );

  return (
    <div className="fl-card overflow-hidden">
      {/* scoreboard */}
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <div className="mb-3.5 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[1px] text-muted">
            {stageLabel(m)}
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
              {ph.lastGoal.own ? "Own goal" : "Goal"} - {ph.lastGoal.player ?? ""}{ph.lastGoal.penalty ? " (p)" : ""} ({ph.lastGoal.team === "home" ? m.homeCode : m.awayCode})
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
          <div className="flex flex-col items-center">
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
            {m.penWinner && (
              <div className="mt-1 whitespace-nowrap text-[9px] uppercase tracking-wide text-gold">
                {(m.penWinner === "home" ? m.homeCode : m.awayCode)} won on pens
                {m.homePens != null && m.awayPens != null ? ` ${m.homePens}-${m.awayPens}` : ""}
              </div>
            )}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2 font-display text-base leading-tight text-cream sm:text-2xl">
              <span className="align-middle">{flagFor(m.away)}</span>{m.away}
              {/* caret next to the away team toggles the key events under the score
                  (only when the game has any). The score stays centred (1fr columns). */}
              {m.events && m.events.length > 0 && (
                <button
                  onClick={() => setShowEvents((v) => !v)}
                  aria-label={showEvents ? "Hide key events" : "Show key events"}
                  className="shrink-0 px-0.5 text-[18px] leading-none text-muted transition-colors hover:text-cream"
                >
                  <span className={"inline-block transition-transform" + (showEvents ? " rotate-180" : "")}>▾</span>
                </button>
              )}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">{m.awayCode}</div>
          </div>
        </div>

        {/* venue (host-country flag + stadium + nearby city), below the fixture/result */}
        {m.venue && (
          <div className="mt-3 flex items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted">
            {venueMeta(m.venue) && <span className="normal-case">{flagFor(venueMeta(m.venue)!.country)}</span>}
            <span>{venueMeta(m.venue)?.label ?? m.venue}</span>
          </div>
        )}
      </div>

      {/* key events directly under the score, toggled by the caret. Same reveal as the
          compact card: open grows the space (0.25s) then fades the content in (0.25s). */}
      {m.events && m.events.length > 0 && (
        <div
          className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
          style={{ gridTemplateRows: showEvents ? "1fr" : "0fr", transitionDelay: showEvents ? "0ms" : "250ms" }}
        >
          <div className="overflow-hidden">
            <div
              className="border-b border-line px-5 py-3 transition-opacity duration-[250ms] sm:px-6"
              style={{ opacity: showEvents ? 1 : 0, transitionDelay: showEvents ? "250ms" : "0ms" }}
            >
              <div className="space-y-1">
                {[...m.events].sort((a, b) => a.minute - b.minute).map((ev, i) => {
                  const colour = ev.type === "goal" ? "#c9a86a" : "#d9534f";
                  const tag = ev.type === "goal" ? "⚽ Goal" : "🟥 Red card";
                  const team = ev.team === "home" ? m.home : m.away;
                  return (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      <span className="w-7 shrink-0 font-mono text-[10.5px] text-muted">{ev.minute}'</span>
                      <span className="shrink-0">{flagFor(team)}</span>
                      <span className="truncate text-cream">{(ev.player ?? team)}{ev.own ? " (o.g.)" : ev.penalty ? " (p)" : ""}</span>
                      <span className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wide" style={{ color: colour }}>{tag}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* logged-in entrant's own prediction; chips + points once the game's under way */}
      {m.myPick && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-line px-5 py-2 text-[12.5px] sm:px-6">
          <span className="text-[9px] uppercase tracking-wide text-muted">Your prediction</span>
          {mine?.predHome ? (
            <>
              {koPick(mine)}
              {(m.status === "FINISHED" || m.status === "IN_PLAY") && (
                <>
                  <KoOutcomeChip
                    points={m.myPoints ?? 0} homeCode={m.homeCode} awayCode={m.awayCode}
                    predHome={Number(m.myPick.split("-")[0])} predAway={Number(m.myPick.split("-")[1])}
                    actualHome={m.homeScore} actualAway={m.awayScore}
                    homeCorrect={mine.predHomeName === m.home} awayCorrect={mine.predAwayName === m.away}
                  />
                  {m.myPoints != null && <PointsPill points={m.myPoints} tier={m.myTier} />}
                </>
              )}
            </>
          ) : (
            <>
              <span className="font-mono text-cream">{m.myPick.replace("-", "–")}</span>
              {(m.status === "FINISHED" || m.status === "IN_PLAY") && (
                <>
                  <ScoredChips pick={m.myPick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />
                  {m.myPoints != null && <PointsPill points={m.myPoints} tier={m.myTier} />}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* finished → who got it right; otherwise → the crowd's most-predicted. This line
          doubles as the toggle for the full predictions board (caret + click). */}
      {board.length > 0 && (
        <button
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide all predictions" : "Show all predictions"}
          className="flex w-full flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 border-b border-line px-5 py-2.5 text-[12.5px] text-muted sm:px-6"
        >
          {m.koMatchup ? (
            <>
              <span className="text-[9px] uppercase tracking-wide">Most predicted</span>
              {koPick({ predHome: m.koMatchup.home, predAway: m.koMatchup.away, predHomeName: m.koMatchup.homeName, predAwayName: m.koMatchup.awayName, pick: m.koMatchup.score, penSide: m.koMatchup.penSide })}
              <span className="text-muted">{frac(m.koMatchup.count, m.mostCommonTotal)}</span>
            </>
          ) : !m.mostCommonScore ? (
            <span className="text-[9px] uppercase tracking-wide">Everyone’s predictions</span>
          ) : finished ? (
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
          <span className="ml-1 inline-flex items-center gap-1 self-center text-[9px] uppercase tracking-wide text-gold/80">
            {show ? "Hide all" : "Show all"}
            <span className={"inline-block text-[12px] leading-none transition-transform" + (show ? " rotate-180" : "")}>▾</span>
          </span>
        </button>
      )}

      {/* full predictions board - same grow-then-fade reveal as the compact cards */}
      {board.length > 0 && (
        <div
          className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
          style={{ gridTemplateRows: show ? "1fr" : "0fr", transitionDelay: show ? "0ms" : "250ms" }}
        >
            <div className="overflow-hidden">
              <div
                className="transition-opacity duration-[250ms]"
                style={{ opacity: show ? 1 : 0, transitionDelay: show ? "250ms" : "0ms" }}
              >
              <div className={boardCols + " items-center px-5 py-1.5 text-[10px] uppercase tracking-[1.5px] text-muted sm:px-6"}>
                {showRank && <div>#</div>}
                <div>Entrant</div>
                <div className="whitespace-nowrap text-right">{isLive ? "Live Prediction" : "Prediction"}</div>
              </div>
              {board.map((b, i) => (
                <div
                  key={b.entrantId}
                  className={boardCols + " items-center gap-2 border-t border-line px-5 py-2.5 sm:px-6" + (b.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
                >
                  {showRank && <div className="font-mono text-xs text-muted">{rankFor(i)}</div>}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] text-cream">{b.name}</span>
                    {b.entrantId === myId && <YouBadge />}
                  </div>
                  {/* same shape AND spacing as the standings Live Prediction column:
                      gap-1 between items, with a wider score->chip gap (mr-1.5). */}
                  <div className="flex items-center justify-end gap-1 whitespace-nowrap font-mono text-[13px] text-cream">
                    {b.predHome ? (
                      <>
                        {koPick(b)}
                        {b.points != null && (
                          <>
                            <KoOutcomeChip
                              points={b.points} homeCode={m.homeCode} awayCode={m.awayCode}
                              predHome={Number(b.pick.split("-")[0])} predAway={Number(b.pick.split("-")[1])}
                              actualHome={m.homeScore} actualAway={m.awayScore}
                              homeCorrect={b.predHomeName === m.home} awayCorrect={b.predAwayName === m.away}
                            />
                            <PointsPill points={b.points} tier={b.tier} />
                          </>
                        )}
                      </>
                    ) : (
                      <>
                    <span className={b.points != null ? "mr-1.5" : ""}>{b.pick.replace("-", "–")}</span>
                    {b.points != null && (
                      <>
                        <ScoredChips pick={b.pick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />
                        <PointsPill points={b.points} tier={b.tier} />
                      </>
                    )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>
      )}
    </div>
  );
}
