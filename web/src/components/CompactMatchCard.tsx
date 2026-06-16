import { useState } from "react";
import { Link } from "react-router-dom";
import { type LiveMatch } from "../api.js";
import { flagFor } from "../flags.js";
import PointsPill from "./PointsPill.js";
import ScoredChips from "./ScoredChips.js";

const SHORT_STAGE: Record<string, string> = {
  LAST_32: "R32",
  LAST_16: "R16",
  QF: "QF",
  SF: "SF",
  THIRD_PLACE: "3rd",
  FINAL: "Final",
};
function shortStage(m: LiveMatch) {
  if (m.stage === "GROUP") return m.group ? `Grp ${m.group}` : "Grp";
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
export default function CompactMatchCard({ m }: { m: LiveMatch }) {
  const [showEvents, setShowEvents] = useState(false);
  const st = statusOf(m);
  const scheduled = m.status === "SCHEDULED";
  const events = m.events ?? [];
  const time = m.kickoff
    ? new Date(m.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "TBC";

  return (
    <Link
      to={`/statistics/fixtures/${m.id}`}
      className="fl-card block transition-colors hover:border-gold/40"
    >
      <div className="px-4 py-3">
        {/* header: stage + status */}
        <div className="mb-2 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{shortStage(m)}</span>
          {st ? (
            <span
              className="flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-wide"
              style={{ color: st.color }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: st.color, animation: st.pulse ? "loadDots 1.2s infinite" : undefined }}
              />
              {st.label}
            </span>
          ) : (
            <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted">{time}</span>
          )}
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
    </Link>
  );
}
