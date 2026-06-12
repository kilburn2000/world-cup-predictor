import { useState } from "react";
import { useLiveMatches, type LiveMatch, type LiveBoardRow, type LiveEvent } from "../api.js";
import { flagFor } from "../flags.js";
import LiveTabs from "../components/LiveTabs.js";
import ScoredChips from "../components/ScoredChips.js";

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

const TIER: Record<NonNullable<LiveBoardRow["tier"]>, { label: string; bg: string; fg: string }> = {
  exact: { label: "Exact", bg: "rgba(201,168,106,0.18)", fg: "#c9a86a" },
  result: { label: "Result", bg: "rgba(107,191,134,0.16)", fg: "#6bbf86" },
  diff: { label: "Partial", bg: "rgba(141,147,136,0.18)", fg: "#b9bdb4" },
  miss: { label: "No points", bg: "rgba(217,146,106,0.12)", fg: "#d9926a" },
};

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
  // a goal "just" happened if the newest goal's minute equals the live minute
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
  // half-time (ESPN keeps state "in" during the interval)
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

function MatchCard({ m }: { m: LiveMatch }) {
  const ph = phaseOf(m);
  const board = m.board; // all predictions
  const [show, setShow] = useState(false);
  const finished = m.status === "FINISHED";
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

      {/* finished → who got it right; otherwise → the crowd's most-predicted */}
      {m.mostCommonScore && (
        <div className="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 border-b border-line px-5 py-2.5 text-[11.5px] text-muted sm:px-6">
          {finished ? (
            <>
              <span className="text-[9px] uppercase tracking-wide">Got it right</span>
              <span><span className="mr-1.5 font-mono text-cream">{exactN}</span>Exact ({pctOf(exactN)}%)</span>
              <span>·</span>
              <span><span className="mr-1.5 font-mono text-cream">{resultN}</span>Result ({pctOf(resultN)}%)</span>
            </>
          ) : (
            <>
              <span className="text-[9px] uppercase tracking-wide">Most predicted</span>
              <span>
                <span className="font-mono text-cream">{m.mostCommonScore.replace("-", "–")}</span> {frac(m.mostCommonScoreCount, m.mostCommonTotal)}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                {m.mostCommonResult === "DRAW" ? (
                  <span>Draw</span>
                ) : (
                  <>
                    <span>{flagFor(m.mostCommonResult === "HOME" ? m.home : m.away)}</span>
                    <span>{(m.mostCommonResult === "HOME" ? m.homeCode : m.awayCode)} Win</span>
                  </>
                )}
                <span>{frac(m.mostCommonResultCount, m.mostCommonTotal)}</span>
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
              const tag = ev.type === "goal" ? "⚽ Goal" : "🟥 Red card";
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
            {show ? "Hide predictions ▴" : "Show predictions ▾"}
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
                const t = b.tier ? TIER[b.tier] : null;
                return (
                  <div key={b.entrantId} className="border-t border-line">
                    <div className="grid grid-cols-[30px_1fr_54px_56px] items-center rounded-lg px-3 py-2.5 sm:grid-cols-[34px_1fr_56px_104px_52px]">
                      <div className="font-mono text-xs text-muted">{i + 1}</div>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[10px] text-muted">
                          {initials(b.name)}
                        </div>
                        <div className="text-[13.5px] text-cream">{b.name}</div>
                      </div>
                      <div className="text-center font-mono text-[13px]">{b.pick}</div>
                      <div className="hidden justify-center sm:flex">
                        {b.points != null && <ScoredChips pick={b.pick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />}
                      </div>
                      <div className="text-right font-mono text-base" style={{ color: t?.fg ?? "#8d9388" }}>
                        {b.points != null ? `+${b.points}` : "–"}
                      </div>
                    </div>
                    {/* Mobile: the scoring breakdown can't fit inline, so stack it below. */}
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

export default function LiveScores({ day = 0 }: { day?: number }) {
  const { data, isLoading, error } = useLiveMatches(day);
  const matches = data ?? [];
  const live = matches.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
  const upcoming = matches.filter((m) => m.status === "SCHEDULED");
  const finished = matches.filter((m) => m.status === "FINISHED");

  const dayLabel = day === -1 ? "Yesterday" : day === 1 ? "Tomorrow" : "Today";
  // host-country (Pacific) date for the selected day
  const [hy, hmo, hd] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).split("-").map(Number);
  const dateLabel = new Date(hy, hmo - 1, hd + day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fl-enter">
      <LiveTabs />
      <div className="mb-6">
        {day === 0 &&
          (live.length ? (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[1.5px] text-[#d9534f]">
              <span className="h-2 w-2 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
              {live.length} live now
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[1.5px] text-muted">
              <span className="h-2 w-2 rounded-full bg-muted" />
              No matches in play
            </div>
          ))}
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">{dayLabel}’s Games</h1>
        <div className="mt-1 font-mono text-[12px] text-gold">{dateLabel}</div>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
          {day === -1
            ? "Yesterday’s results."
            : day === 1
              ? "Tomorrow’s fixtures."
              : "Today’s fixtures and results - points update live during games."}
        </p>
      </div>

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load live scores.</p>}

      {!isLoading && !error && matches.length === 0 && (
        <div className="fl-card px-7 py-14 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-line text-2xl text-muted">◷</div>
          <div className="font-display text-2xl text-cream">No games {dayLabel.toLowerCase()}</div>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
            There are no World Cup fixtures on this day.
          </p>
        </div>
      )}

      {live.length > 0 && (
        <div className="mb-7">
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-gold">Live now</h2>
          <div className="flex flex-col gap-5">{live.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="mb-7">
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-muted">{day === 0 ? "Today’s fixtures" : "Fixtures"}</h2>
          <div className="flex flex-col gap-5">{upcoming.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </div>
      )}
      {finished.length > 0 && (
        <div className="mb-7">
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-muted">Results</h2>
          <div className="flex flex-col gap-5">{finished.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </div>
      )}
    </div>
  );
}
