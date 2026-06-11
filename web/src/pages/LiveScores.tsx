import { Link } from "react-router-dom";
import { useLiveMatches, type LiveMatch, type LiveBoardRow, type LiveEvent } from "../api.js";
import { flagFor } from "../flags.js";
import LiveTabs from "../components/LiveTabs.js";

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

const TIER: Record<LiveBoardRow["tier"], { label: string; bg: string; fg: string }> = {
  exact: { label: "Exact", bg: "rgba(201,168,106,0.18)", fg: "#c9a86a" },
  result: { label: "Result", bg: "rgba(107,191,134,0.16)", fg: "#6bbf86" },
  diff: { label: "Partial", bg: "rgba(141,147,136,0.18)", fg: "#b9bdb4" },
  miss: { label: "No points", bg: "rgba(217,146,106,0.12)", fg: "#d9926a" },
};

/** Small football icon — clearly distinct from a yellow card. */
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

function MatchCard({ m }: { m: LiveMatch }) {
  const ph = phaseOf(m);
  const ft = m.status === "FINISHED";
  const winners = m.board.filter((b) => b.points > 0).length;
  const topPts = m.board.length ? m.board[0].points : 0;
  const leaders = m.board
    .filter((b) => b.points === topPts && topPts > 0)
    .map((b) => b.name.split(" ")[0]);
  const board = m.board.slice(0, 10);
  const rest = Math.max(0, m.board.length - 10);

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
              Goal — {ph.lastGoal.player ?? ""} ({ph.lastGoal.team === "home" ? m.homeCode : m.awayCode})
            </span>
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="text-right">
            <div className="font-display text-2xl leading-tight text-cream">
              {m.home} <span className="align-middle">{flagFor(m.home)}</span>
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
            <div className="font-display text-2xl leading-tight text-cream">
              <span className="align-middle">{flagFor(m.away)}</span> {m.away}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">{m.awayCode}</div>
          </div>
        </div>
      </div>

      {/* upcoming: no board yet, just the kickoff */}
      {m.status === "SCHEDULED" ? (
        <div className="px-5 pb-5 pt-4 text-center text-[13px] text-muted sm:px-6">
          Kicks off {m.kickoff ? new Date(m.kickoff).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "today"} · predictions locked
        </div>
      ) : (
      <div className="px-5 pb-5 pt-4 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="font-display text-base text-cream">
            {ft ? "Final" : "If it ends"} {m.home} {m.homeScore}–{m.awayScore} {m.away}
          </div>
          <div className="text-[11.5px] text-muted">
            <span className="font-mono text-gold">{winners}</span> entrants ·{" "}
            {ft ? "points awarded" : "points in play"}
            {leaders.length > 0 && (
              <>
                {" "}· leaders <span className="text-cream">{leaders.join(", ")}</span>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[30px_1fr_54px_56px] items-center px-3 py-1.5 text-[10px] uppercase tracking-[1.5px] text-muted sm:grid-cols-[34px_1fr_60px_92px_56px]">
          <div>#</div>
          <div>Entrant</div>
          <div className="text-center">Pick</div>
          <div className="hidden text-center sm:block">Outcome</div>
          <div className="text-right">Pts</div>
        </div>
        {board.map((b, i) => {
          const t = TIER[b.tier];
          return (
            <div
              key={b.entrantId}
              className="grid grid-cols-[30px_1fr_54px_56px] items-center rounded-lg border-t border-line px-3 py-2.5 sm:grid-cols-[34px_1fr_60px_92px_56px]"
            >
              <div className="font-mono text-xs text-muted">{i + 1}</div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[10px] text-muted">
                  {initials(b.name)}
                </div>
                <div className="text-[13.5px] text-cream">{b.name}</div>
              </div>
              <div className="text-center font-mono text-[13px]">{b.pick}</div>
              <div className="hidden text-center sm:block">
                <span
                  className="rounded px-2 py-0.5 font-mono text-[10.5px]"
                  style={{ background: t.bg, color: t.fg }}
                >
                  {t.label}
                </span>
              </div>
              <div className="text-right font-mono text-base" style={{ color: t.fg }}>
                +{b.points}
              </div>
            </div>
          );
        })}
        {rest > 0 && (
          <div className="pt-3 text-center text-[11.5px] text-muted">+ {rest} more entrants</div>
        )}
      </div>
      )}
      <Link
        to={`/live/fixtures/${m.id}`}
        state={{ from: "/live/scores", label: "Live Scores" }}
        className="block border-t border-line px-5 py-2.5 text-center text-[12.5px] text-gold transition-colors hover:bg-gold-soft"
      >
        Points breakdown →
      </Link>
    </div>
  );
}

export default function LiveScores() {
  const { data, isLoading, error } = useLiveMatches();
  const matches = data ?? [];
  const live = matches.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
  const upcoming = matches.filter((m) => m.status === "SCHEDULED");
  const finished = matches.filter((m) => m.status === "FINISHED");

  return (
    <div className="fl-enter">
      <LiveTabs />
      <div className="mb-6">
        {live.length ? (
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[1.5px] text-[#d9534f]">
            <span className="h-2 w-2 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
            {live.length} live now
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[1.5px] text-muted">
            <span className="h-2 w-2 rounded-full bg-muted" />
            No matches in play
          </div>
        )}
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">Live Scores</h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
          Today’s fixtures and every result so far. For matches in play, each entrant’s points update
          live with the score.
        </p>
      </div>

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load live scores.</p>}

      {!isLoading && !error && matches.length === 0 && (
        <div className="fl-card px-7 py-14 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-line text-2xl text-muted">◷</div>
          <div className="font-display text-2xl text-cream">Nothing scheduled</div>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted">
            No fixtures today and no results yet. Match cards and the points-in-play board appear here
            once games kick off.
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
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-muted">Today’s fixtures</h2>
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
