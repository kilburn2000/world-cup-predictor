import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useLiveMatches, type LiveMatch } from "../api.js";
import { useMe } from "../auth.js";
import { flagFor } from "../flags.js";
import PointsPill from "./PointsPill.js";
import KoOutcomeChip from "./KoOutcomeChip.js";
import ScoredChips from "./ScoredChips.js";

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}
const londonTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

const ROTATE_MS = 5000;

// In-play status label: half-time, the live minute, or a bare "Live" fallback.
const HALFTIME = /half[\s-]?time|^ht$/i;
function liveLabel(m: LiveMatch): string {
  if (m.status === "PAUSED" || (m.half && HALFTIME.test(m.half))) return "HT";
  return m.minute != null ? `${m.minute}'` : "Live";
}

const Avatar = ({ name }: { name: string | null }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold font-mono text-[10px] font-semibold text-gold">
    {name ? initials(name) : "?"}
  </span>
);

// One ticker row: a live game (score + the entrant's prediction/chip/points) or
// an upcoming game (kickoff + their predicted score).
function Row({ m, live, name }: { m: LiveMatch; live: boolean; name: string | null }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const ko = m.stage !== "GROUP";
  const [ph, pa] = (m.myPick ?? "0-0").split("-").map(Number);
  return (
    <>
    <Link
      to="/statistics/today"
      className="flex items-center gap-3 overflow-x-auto text-[13px] transition-colors hover:text-cream [justify-content:safe_center]"
    >
      <Avatar name={name} />
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        {live ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
            <span className="font-mono text-[10px] font-semibold text-[#d9534f]">{liveLabel(m)}</span>
          </span>
        ) : (
          <span className="text-[8.5px] uppercase tracking-[1.5px] text-muted">Next{m.kickoff ? ` · ${londonTime(m.kickoff)}` : ""}</span>
        )}
        <span className="flex items-center gap-1.5">
          <span>{flagFor(m.home)}</span>
          <span className="font-mono text-[11px] text-muted">{m.homeCode}</span>
        </span>
        {live ? (
          <span className="font-mono font-semibold text-cream">{m.homeScore}–{m.awayScore}</span>
        ) : (
          <span className="text-[11px] text-muted">v</span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted">{m.awayCode}</span>
          <span>{flagFor(m.away)}</span>
        </span>
        {m.myPick && (
          <span className="ml-1 flex items-center gap-2">
            <span className={"text-[8.5px] uppercase tracking-[1.5px] text-gold/80 " + (live ? "hidden sm:inline" : "inline")}>Your Prediction</span>
            {m.stage !== "GROUP" ? (
              // Knockouts: show the matchup they predicted (can differ from the
              // actual fixture), flags + FIFA codes either side of their score.
              <span className="flex items-center gap-1.5">
                <span>{flagFor(m.myPredHomeName ?? m.home)}</span>
                <span className={"font-mono text-[11px] " + (m.homeKnown && m.myPredHomeName === m.home ? "font-bold text-gold" : "text-muted")}>{m.myPredHomeCode ?? m.homeCode}</span>
                <span className="font-mono text-[11px] text-cream">{m.myPick.replace("-", "–")}</span>
                <span className={"font-mono text-[11px] " + (m.awayKnown && m.myPredAwayName === m.away ? "font-bold text-gold" : "text-muted")}>{m.myPredAwayCode ?? m.awayCode}</span>
                <span>{flagFor(m.myPredAwayName ?? m.away)}</span>
              </span>
            ) : (
              // Group games: predicted teams are the fixture teams, so just the score.
              <span className="font-mono text-cream">{m.myPick.replace("-", "–")}</span>
            )}
            {live && m.myPoints != null && (
              <span
                className="inline-flex cursor-pointer"
                onMouseEnter={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top }); }}
                onMouseLeave={() => setTip(null)}
              >
                <PointsPill points={m.myPoints} tier={m.myTier} />
              </span>
            )}
          </span>
        )}
      </span>
    </Link>
    {tip && live && m.myPick && createPortal(
      <div className="pointer-events-none fixed z-[60]" style={{ left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)" }}>
        <div className="flex flex-col items-center gap-1 rounded-lg border bg-[#0f120e] px-2.5 py-2 shadow-xl" style={{ borderColor: "rgba(217,83,79,0.6)" }}>
          <span className="whitespace-nowrap font-mono text-[11px] text-cream">{flagFor(m.home)} {m.homeCode} {m.homeScore}-{m.awayScore} {m.awayCode} {flagFor(m.away)}</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] text-[#d9534f]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
            LIVE{m.minute != null ? ` · ${m.minute}'` : ""}
          </span>
          {ko ? (
            <span className="flex items-center gap-1 whitespace-nowrap font-mono text-[10px] text-muted">
              Pred <span>{flagFor(m.myPredHomeName ?? m.home)}</span> <span className={m.homeKnown && m.myPredHomeName === m.home ? "font-bold text-gold" : undefined}>{m.myPredHomeCode ?? m.homeCode}</span>
              <span className="text-cream">{m.myPick.replace("-", "–")}</span>
              <span className={m.awayKnown && m.myPredAwayName === m.away ? "font-bold text-gold" : undefined}>{m.myPredAwayCode ?? m.awayCode}</span> <span>{flagFor(m.myPredAwayName ?? m.away)}</span>
            </span>
          ) : (
            <span className="whitespace-nowrap font-mono text-[10px] text-muted">Pred {m.myPick.replace("-", "–")}</span>
          )}
          <span className="flex items-center gap-1">
            {ko ? (
              <KoOutcomeChip points={m.myPoints ?? 0} homeCode={m.homeCode} awayCode={m.awayCode} predHome={ph} predAway={pa} actualHome={m.homeScore} actualAway={m.awayScore} homeCorrect={m.myPredHomeName === m.home} awayCorrect={m.myPredAwayName === m.away} />
            ) : (
              <ScoredChips pick={m.myPick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />
            )}
            <PointsPill points={m.myPoints ?? 0} tier={m.myTier} />
          </span>
        </div>
      </div>,
      document.body,
    )}
    </>
  );
}

// A compact header strip for the logged-in entrant: live games while any are on
// (one row each), otherwise the next game(s). Hidden when signed out or nothing's
// live/upcoming.
export default function LiveTicker() {
  const { data: me } = useMe();
  const today = useLiveMatches(0).data ?? [];
  const tomorrow = useLiveMatches(1).data ?? [];

  const liveGames = today.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
  let rows: LiveMatch[];
  let live: boolean;
  if (liveGames.length) {
    rows = liveGames;
    live = true;
  } else {
    // Keep the strip on a game this entrant actually has a pick for (in practice
    // they predict every fixture, so this is a safety guard against showing a
    // "next" game with no prediction attached).
    const upcoming = [...today, ...tomorrow]
      .filter((m) => m.status === "SCHEDULED" && m.myPick != null)
      .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));
    const firstKick = upcoming[0]?.kickoff;
    rows = firstKick ? upcoming.filter((m) => m.kickoff === firstKick) : [];
    live = false;
  }

  // Several games at once: rotate through them every 5s (synced via the wall
  // clock) instead of stacking, the same as the standings live column.
  const rotate = rows.length > 1;
  const [, force] = useState(0);
  useEffect(() => {
    if (!rotate) return;
    const id = setInterval(() => force((t) => t + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [rotate]);

  if (!me || !rows.length) return null;

  const idx = rotate ? Math.floor(Date.now() / ROTATE_MS) % rows.length : 0;
  const m = rows[idx];

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
      <div key={m.id} className="fl-enter min-w-0 flex-1"><Row m={m} live={live} name={me.name} /></div>
      {rotate && (
        <div className="flex shrink-0 items-center gap-1">
          {rows.map((_, i) => <span key={i} className={"h-1 w-1 rounded-full " + (i === idx ? "bg-gold" : "bg-muted/40")} />)}
        </div>
      )}
    </div>
  );
}
