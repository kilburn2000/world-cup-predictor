import { useState } from "react";
import { Link } from "react-router-dom";
import { type LiveMatch } from "../api.js";
import { flagFor } from "../flags.js";
import { venueMeta } from "../venues.js";
import { useMe } from "../auth.js";
import PointsPill from "./PointsPill.js";
import ScoredChips from "./ScoredChips.js";

const frac = (n?: number, total?: number) =>
  `${n ?? 0}/${total ?? 0} (${total ? Math.round(((n ?? 0) / total) * 100) : 0}%)`;

const SHORT_STAGE: Record<string, string> = {
  LAST_32: "R32",
  LAST_16: "R16",
  QF: "QF",
  SF: "SF",
  THIRD_PLACE: "3rd",
  FINAL: "Final",
};
function shortStage(m: LiveMatch) {
  if (m.stage === "GROUP") return m.group ? `Group ${m.group}` : "Group";
  return SHORT_STAGE[m.stage] ?? m.stage;
}

/** Status/kickoff pill - same colour scheme as the larger match card (phaseOf). */
function pillOf(m: LiveMatch, time: string): { label: string; color: string; bg: string; border: string; pulse: boolean } {
  if (m.status === "FINISHED") return { label: "FT", color: "#b9bdb4", bg: "rgba(185,189,180,0.12)", border: "rgba(185,189,180,0.32)", pulse: false };
  if (m.status === "PAUSED") return { label: "HT", color: "#e3c558", bg: "rgba(227,197,88,0.12)", border: "rgba(227,197,88,0.4)", pulse: false };
  if (m.status === "IN_PLAY") return { label: m.minute != null ? `${m.minute}'` : "Live", color: "#d9534f", bg: "rgba(217,83,79,0.1)", border: "rgba(217,83,79,0.35)", pulse: true };
  return { label: time, color: "#8d9388", bg: "rgba(141,147,136,0.12)", border: "rgba(141,147,136,0.3)", pulse: false };
}

/** One-line summary card for the dashboard. Full detail (predictions, events) lives on the fixture page. */
export default function CompactMatchCard({ m }: { m: LiveMatch }) {
  const { data: me } = useMe();
  const myId = me?.entrantId;
  const [showEvents, setShowEvents] = useState(false);
  const [show, setShow] = useState(false);
  const scheduled = m.status === "SCHEDULED";
  const events = m.events ?? [];
  const finished = m.status === "FINISHED";
  // No rank before kick-off (every prediction is level), so drop the column.
  const showRank = m.status !== "SCHEDULED";
  const boardCols = showRank ? "grid grid-cols-[24px_1fr_auto]" : "grid grid-cols-[1fr_auto]";
  const isLive = m.status === "IN_PLAY" || m.status === "PAUSED";
  const board = [...(m.board ?? [])].sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name));
  const total = board.length;
  const exactN = board.filter((b) => b.tier === "exact").length;
  const resultN = board.filter((b) => b.tier === "exact" || b.tier === "result").length;
  const pctOf = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const rankFor = (i: number): string | number => {
    const pts = board[i].points ?? -1;
    if (i > 0 && (board[i - 1].points ?? -1) === pts) return "=";
    return 1 + board.filter((x) => (x.points ?? -1) > pts).length;
  };
  const time = m.kickoff
    ? new Date(m.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "TBC";
  const pill = pillOf(m, time);
  // top-left always shows the group (group stage) or round (knockout); the venue
  // sits below the score instead.
  const left = shortStage(m);
  const mine = board.find((b) => b.entrantId === myId);

  // A knockout pick: flag + code each side of the predicted score; "(p)" marks the
  // team the entrant has advancing on penalties when they predicted a draw.
  const koPick = (g: { predHome?: string | null; predAway?: string | null; predHomeName?: string | null; predAwayName?: string | null; pick: string; penSide?: "home" | "away" | null }) => (
    <span className="inline-flex items-center gap-1 font-mono text-cream">
      <span>{flagFor(g.predHomeName)}</span>{g.predHome}{g.penSide === "home" ? "(p)" : ""}
      <span className="mx-0.5">{g.pick.replace("-", "–")}</span>
      {g.predAway}{g.penSide === "away" ? "(p)" : ""}<span>{flagFor(g.predAwayName)}</span>
    </span>
  );

  return (
    <Link
      to={`/statistics/fixtures/${m.id}`}
      className="fl-card block transition-colors hover:border-gold/40"
    >
      <div className="px-4 py-3">
        {/* header: stage/venue (left) · status pill (right), same format as the larger card */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10px] uppercase tracking-wide text-muted">{left}</span>
          <span
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.5px]"
            style={{ color: pill.color, background: pill.bg, borderColor: pill.border }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: pill.color, animation: pill.pulse ? "loadDots 1.2s infinite" : undefined }}
            />
            {pill.label}
          </span>
        </div>

        {/* teams + score - the larger card's centred [1fr_auto_1fr] layout: team name in the
            display face with its FIFA code beneath, score dead-centre, caret beside the away team */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="min-w-0 text-right">
            <div className="flex items-center justify-end gap-2 font-display text-[15px] leading-tight text-cream">
              <span className="truncate">{m.home}</span><span className="shrink-0">{flagFor(m.home)}</span>
            </div>
            {m.homeCode && <div className="mt-0.5 font-mono text-[10px] text-muted">{m.homeCode}</div>}
          </div>
          <div className="shrink-0 text-center font-mono text-[19px] tabular-nums text-cream">
            {scheduled ? (
              <span className="text-base text-muted">v</span>
            ) : (
              <>
                {m.homeScore}
                <span className="mx-1 text-base text-muted">–</span>
                {m.awayScore}
              </>
            )}
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2 font-display text-[15px] leading-tight text-cream">
              <span className="shrink-0">{flagFor(m.away)}</span><span className="truncate">{m.away}</span>
              {events.length > 0 && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowEvents((v) => !v);
                  }}
                  aria-label={showEvents ? "Hide key events" : "Show key events"}
                  className="ml-1 shrink-0 px-0.5 text-[16px] leading-none text-muted transition-colors hover:text-cream"
                >
                  {/* one glyph rotated, so up and down are identical shapes */}
                  <span className={"inline-block transition-transform" + (showEvents ? " rotate-180" : "")}>▾</span>
                </button>
              )}
            </div>
            {m.awayCode && <div className="mt-0.5 font-mono text-[10px] text-muted">{m.awayCode}</div>}
          </div>
        </div>

        {/* venue (host-country flag + stadium + nearby city), below the fixture/result and above key events */}
        {m.venue && (
          <div className="mt-2.5 flex items-center justify-center gap-1 font-mono text-[10px] uppercase tracking-wide text-muted">
            {venueMeta(m.venue) && <span className="normal-case">{flagFor(venueMeta(m.venue)!.country)}</span>}
            <span>{venueMeta(m.venue)?.label ?? m.venue}</span>
          </div>
        )}
      </div>

      {/* key events, directly beneath the score (above the prediction), toggled by the
          caret. Opening: the space grows first (0.25s) then the content fades in (0.25s).
          Closing reverses it - content fades out, then the space collapses. The grid
          0fr->1fr trick animates the height; transition delays sequence the two phases. */}
      {events.length > 0 && (
        <div
          className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
          style={{ gridTemplateRows: showEvents ? "1fr" : "0fr", transitionDelay: showEvents ? "0ms" : "250ms" }}
        >
          <div className="overflow-hidden">
            <div
              className="space-y-1 border-t border-line px-4 py-2 transition-opacity duration-[250ms]"
              style={{ opacity: showEvents ? 1 : 0, transitionDelay: showEvents ? "250ms" : "0ms" }}
            >
              {[...events]
                .sort((a, b) => a.minute - b.minute)
                .map((ev, i) => {
                  const colour = ev.type === "goal" ? "#c9a86a" : "#d9534f";
                  const team = ev.team === "home" ? m.home : m.away;
                  return (
                    <div key={i} className="flex items-center gap-2 text-[12px]">
                      <span className="w-7 shrink-0 font-mono text-[10.5px] text-muted">{ev.minute}'</span>
                      <span className="shrink-0">{flagFor(team)}</span>
                      <span className="truncate text-cream">
                        {(ev.player ?? team)}
                        {ev.own ? " (o.g.)" : ev.penalty ? " (p)" : ""}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px]" style={{ color: colour }}>
                        {ev.type === "goal" ? "⚽" : "🟥"}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* your prediction + scoring */}
      {m.myPick && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line px-4 py-2 text-[12.5px]">
          <span className="text-[9px] uppercase tracking-wide text-muted">Your prediction</span>
          {mine?.predHome ? (
            <>
              {koPick(mine)}
              {(m.status === "FINISHED" || m.status === "IN_PLAY") && m.myPoints != null && (
                <PointsPill points={m.myPoints} tier={m.myTier} />
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

      {/* most-predicted line (or just a label for knockout) doubles as the toggle for
          the full predictions board */}
      {board.length > 0 && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow((v) => !v); }}
          aria-label={show ? "Hide all predictions" : "Show all predictions"}
          className="flex w-full flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 border-t border-line px-4 py-2 text-[11.5px] text-muted"
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
              <span><span className="mr-1.5 font-mono text-cream">{exactN}</span>Exact ({pctOf(exactN)}%)</span>
              <span>·</span>
              <span><span className="mr-1.5 font-mono text-cream">{resultN}</span>Result ({pctOf(resultN)}%)</span>
            </>
          ) : (
            <>
              <span className="text-[9px] uppercase tracking-wide">Most predicted</span>
              <span><span className="font-mono text-cream">{m.mostCommonScore.replace("-", "–")}</span> {frac(m.mostCommonScoreCount, m.mostCommonTotal)}</span>
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

      {/* full predictions board - same grow-then-fade reveal as the key events */}
      {board.length > 0 && (
        <div
          className="grid transition-[grid-template-rows] duration-[250ms] ease-out"
          style={{ gridTemplateRows: show ? "1fr" : "0fr", transitionDelay: show ? "0ms" : "250ms" }}
        >
          <div className="overflow-hidden">
            <div
              className="border-t border-line transition-opacity duration-[250ms]"
              style={{ opacity: show ? 1 : 0, transitionDelay: show ? "250ms" : "0ms" }}
            >
              <div className={boardCols + " items-center px-4 py-1.5 text-[9px] uppercase tracking-[1.5px] text-muted"}>
                {showRank && <div>#</div>}
                <div>Entrant</div>
                <div className="whitespace-nowrap text-right">{isLive ? "Live Prediction" : "Prediction"}</div>
              </div>
              {board.map((b, i) => (
                <div
                  key={b.entrantId}
                  className={boardCols + " items-center gap-2 border-t border-line px-4 py-2" + (b.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
                >
                  {showRank && <div className="font-mono text-[11px] text-muted">{rankFor(i)}</div>}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[12.5px] text-cream">{b.name}</span>
                    {b.entrantId === myId && <span className="shrink-0 rounded bg-gold/20 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-gold">You</span>}
                  </div>
                  <div className="flex items-center justify-end gap-1 whitespace-nowrap font-mono text-[12px] text-cream">
                    {b.predHome ? (
                      koPick(b)
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
    </Link>
  );
}
