import { useState } from "react";
import { Link } from "react-router-dom";
import { type LiveMatch } from "../api.js";
import { flagFor } from "../flags.js";
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

/** Compact status pill content; null for scheduled games (the kickoff time shows instead). */
function statusOf(m: LiveMatch): { label: string; color: string; pulse: boolean } | null {
  if (m.status === "FINISHED") return { label: "FT", color: "#b9bdb4", pulse: false };
  if (m.status === "PAUSED") return { label: "HT", color: "#e3c558", pulse: false };
  if (m.status === "IN_PLAY")
    return { label: m.minute != null ? `${m.minute}'` : "Live", color: "#d9534f", pulse: true };
  return null;
}

/** One-line summary card for the dashboard. Full detail (predictions, events) lives on the fixture page. */
export default function CompactMatchCard({ m, hideStage = false }: { m: LiveMatch; hideStage?: boolean }) {
  const { data: me } = useMe();
  const myId = me?.entrantId;
  const [showEvents, setShowEvents] = useState(false);
  const [show, setShow] = useState(false);
  const st = statusOf(m);
  const scheduled = m.status === "SCHEDULED";
  const events = m.events ?? [];
  const finished = m.status === "FINISHED";
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
  const date = m.kickoff ? new Date(m.kickoff).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "";
  // left side of the header: stage (unless the page already groups by it) + venue
  const left = [hideStage ? "" : shortStage(m), m.venue].filter(Boolean).join(" · ");
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
        {/* header: stage/venue (left) · date + status/time (right) */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[10px] uppercase tracking-wide text-muted">{left}</span>
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wide">
            {date && <span className="text-muted">{date}</span>}
            {st ? (
              <span className="flex items-center gap-1" style={{ color: st.color }}>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: st.color, animation: st.pulse ? "loadDots 1.2s infinite" : undefined }}
                />
                {st.label}
              </span>
            ) : (
              <span className="text-muted">{time}</span>
            )}
          </span>
        </div>

        {/* teams + score */}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className="truncate text-[15px] text-cream">{m.home}</span>
            <span className="shrink-0">{flagFor(m.home)}</span>
          </div>
          <div className="min-w-[52px] shrink-0 text-center font-mono text-[18px] tabular-nums text-cream">
            {scheduled ? (
              <span className="text-muted">v</span>
            ) : (
              <>
                {m.homeScore}
                <span className="mx-1 text-muted">–</span>
                {m.awayScore}
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0">{flagFor(m.away)}</span>
            <span className="truncate text-[15px] text-cream">{m.away}</span>
            {/* caret next to the away team; toggles key events. The score stays dead-centre
                because this column and the home column are both flex-1 (equal width). */}
            {events.length > 0 && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowEvents((v) => !v);
                }}
                aria-label={showEvents ? "Hide key events" : "Show key events"}
                className="ml-1 shrink-0 px-0.5 text-[18px] leading-none text-muted transition-colors hover:text-cream"
              >
                {/* one glyph rotated, so up and down are identical shapes */}
                <span className={"inline-block transition-transform" + (showEvents ? " rotate-180" : "")}>▾</span>
              </button>
            )}
          </div>
        </div>
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
            koPick(mine)
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
              <span className="inline-flex items-center gap-1">
                {flagFor(m.koMatchup.homeName)}<span className="font-mono text-cream">{m.koMatchup.home}</span> v <span className="font-mono text-cream">{m.koMatchup.away}</span>{flagFor(m.koMatchup.awayName)} {frac(m.koMatchup.count, m.mostCommonTotal)}
              </span>
              <span>·</span>
              <span><span className="font-mono text-cream">{m.mostCommonScore?.replace("-", "–")}</span> {frac(m.mostCommonScoreCount, m.mostCommonTotal)}</span>
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
              className="border-t border-line px-3 pb-3 transition-opacity duration-[250ms]"
              style={{ opacity: show ? 1 : 0, transitionDelay: show ? "250ms" : "0ms" }}
            >
              <div className="grid grid-cols-[24px_1fr_auto] items-center px-2 py-1.5 text-[9px] uppercase tracking-[1.5px] text-muted">
                <div>#</div>
                <div>Entrant</div>
                <div className="whitespace-nowrap text-right">{isLive ? "Live Prediction" : "Prediction"}</div>
              </div>
              {board.map((b, i) => (
                <div
                  key={b.entrantId}
                  className={"grid grid-cols-[24px_1fr_auto] items-center gap-2 rounded-lg border-t border-line px-2 py-2" + (b.entrantId === myId ? " bg-gold/10 ring-1 ring-inset ring-gold/40" : "")}
                >
                  <div className="font-mono text-[11px] text-muted">{rankFor(i)}</div>
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
