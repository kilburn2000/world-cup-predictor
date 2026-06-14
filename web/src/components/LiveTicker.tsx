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

const Avatar = ({ name }: { name: string | null }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold font-mono text-[10px] font-semibold text-gold">
    {name ? initials(name) : "?"}
  </span>
);

// One ticker row: a live game (score + the entrant's prediction/chip/points) or
// an upcoming game (kickoff + their predicted score).
function Row({ m, live, name }: { m: LiveMatch; live: boolean; name: string | null }) {
  return (
    <Link
      to={live ? "/statistics/live" : "/statistics/today"}
      className="flex items-center gap-3 overflow-x-auto text-[13px] transition-colors hover:text-cream [justify-content:safe_center]"
    >
      <Avatar name={name} />
      <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        {live ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />
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
            <span className={"text-[8.5px] uppercase tracking-[1.5px] text-gold/80 " + (live ? "hidden sm:inline" : "inline")}>{live ? "Your prediction" : "You Said"}</span>
            <span className="font-mono text-cream">{m.myPick.replace("-", "–")}</span>
            {live && (
              <>
                <ScoredChips pick={m.myPick} hs={m.homeScore} as={m.awayScore} homeCode={m.homeCode} awayCode={m.awayCode} />
                {m.myPoints != null && <PointsPill points={m.myPoints} tier={m.myTier} />}
              </>
            )}
          </span>
        )}
      </span>
    </Link>
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
    const upcoming = [...today, ...tomorrow]
      .filter((m) => m.status === "SCHEDULED")
      .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));
    const firstKick = upcoming[0]?.kickoff;
    rows = firstKick ? upcoming.filter((m) => m.kickoff === firstKick) : [];
    live = false;
  }

  if (!me || !rows.length) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-2">
      {rows.map((m) => <Row key={m.id} m={m} live={live} name={me.name} />)}
    </div>
  );
}
