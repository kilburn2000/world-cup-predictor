import { Link } from "react-router-dom";
import { useLiveMatches, type LiveMatch } from "../api.js";
import { useMe } from "../auth.js";
import { flagFor } from "../flags.js";
import ScoredChips from "./ScoredChips.js";
import PointsPill from "./PointsPill.js";

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}
const londonTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// A compact header strip for the logged-in entrant: a live game (score + their
// prediction, chip and points) while one's on, plus the next upcoming game with
// their predicted score. Hidden when signed out or nothing's live/upcoming.
export default function LiveTicker() {
  const { data: me } = useMe();
  const today = useLiveMatches(0).data ?? [];
  const tomorrow = useLiveMatches(1).data ?? [];

  const live: LiveMatch | undefined = today.find((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
  const byKick = (a: LiveMatch, b: LiveMatch) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "");
  const next: LiveMatch | undefined =
    [...today.filter((m) => m.status === "SCHEDULED")].sort(byKick)[0] ??
    [...tomorrow.filter((m) => m.status === "SCHEDULED")].sort(byKick)[0];

  if (!me || (!live && !next)) return null;

  return (
    <Link
      to={live ? "/statistics/live" : "/statistics/today"}
      className="mt-2 flex items-center justify-center gap-3 overflow-x-auto border-t border-line pt-2 text-[13px] transition-colors hover:text-cream"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold font-mono text-[10px] font-semibold text-gold">
        {me.name ? initials(me.name) : "?"}
      </span>

      {live && (
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          <span className="h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
          <span className="flex items-center gap-1.5">
            <span>{flagFor(live.home)}</span>
            <span className="font-mono text-[11px] text-muted">{live.homeCode}</span>
          </span>
          <span className="font-mono font-semibold text-cream">{live.homeScore}–{live.awayScore}</span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted">{live.awayCode}</span>
            <span>{flagFor(live.away)}</span>
          </span>
          {live.myPick && (
            <span className="ml-1 flex items-center gap-2">
              <span className="text-[8.5px] uppercase tracking-[1.5px] text-gold/80">Your prediction</span>
              <span className="font-mono text-cream">{live.myPick.replace("-", "–")}</span>
              <ScoredChips pick={live.myPick} hs={live.homeScore} as={live.awayScore} homeCode={live.homeCode} awayCode={live.awayCode} />
              {live.myPoints != null && <PointsPill points={live.myPoints} tier={live.myTier} />}
            </span>
          )}
        </span>
      )}

      {next && (
        <span className={"flex shrink-0 items-center gap-2 whitespace-nowrap" + (live ? " border-l border-line pl-3" : "")}>
          <span className="text-[8.5px] uppercase tracking-[1.5px] text-muted">Next{next.kickoff ? ` · ${londonTime(next.kickoff)}` : ""}</span>
          <span className="flex items-center gap-1.5">
            <span>{flagFor(next.home)}</span>
            <span className="font-mono text-[11px] text-muted">{next.homeCode}</span>
            <span className="text-[11px] text-muted">v</span>
            <span className="font-mono text-[11px] text-muted">{next.awayCode}</span>
            <span>{flagFor(next.away)}</span>
          </span>
          {next.myPick && (
            <span className="flex items-center gap-1.5">
              <span className="text-[8.5px] uppercase tracking-[1.5px] text-gold/80">Your prediction</span>
              <span className="font-mono text-cream">{next.myPick.replace("-", "–")}</span>
            </span>
          )}
        </span>
      )}
    </Link>
  );
}
