import { Link } from "react-router-dom";
import { useFixtures, type Fixture } from "../api.js";
import { flagFor } from "../flags.js";
import ScoredChips from "./ScoredChips.js";
import PointsPill from "./PointsPill.js";
import { longDate } from "../dates.js";

// A fixture's calendar day in the host country (Pacific), matching how the
// Yesterday / Today / Tomorrow stats tabs bucket games.
const pacificKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const londonTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

// A single fixture rendered like the entrant detail page: teams + flags either
// side of the score, with the logged-in entrant's prediction (and chips/points
// once played) on the line below.
function MatchRow({ f }: { f: Fixture }) {
  const live = f.status === "IN_PLAY";
  const done = f.status === "FINISHED";
  const played = live || done;
  return (
    <Link
      to={`/stats/fixtures/${f.id}`}
      state={{ from: "/", label: "Dashboard" }}
      className="block border-t border-line px-4 py-2.5 transition-colors first:border-t-0 hover:bg-gold-soft"
    >
      <div className="grid grid-cols-[1fr_64px_1fr] items-center gap-1.5 text-[12.5px]">
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span className="truncate text-cream">{f.home}</span>
          <span>{flagFor(f.home)}</span>
        </div>
        <div className="text-center font-mono">
          {played ? (
            <span className={live ? "text-[#d9534f]" : "text-cream"}>{f.homeScore}–{f.awayScore}</span>
          ) : (
            <span className="text-[11px] text-muted">{f.kickoff ? londonTime(f.kickoff) : "v"}</span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span>{flagFor(f.away)}</span>
          <span className="truncate text-cream">{f.away}</span>
        </div>
      </div>
      {f.myPick && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-2 text-[11px]">
          <span className="text-[8.5px] uppercase leading-none tracking-[1.5px] text-gold/80">Your prediction</span>
          <span className="font-mono leading-none text-cream">{f.myPick.replace("-", "–")}</span>
          {played && f.homeScore != null && f.awayScore != null && (
            <>
              <ScoredChips pick={f.myPick} hs={f.homeScore} as={f.awayScore} homeCode={f.homeCode ?? ""} awayCode={f.awayCode ?? ""} />
              {f.myPoints != null && <PointsPill points={f.myPoints} />}
            </>
          )}
        </div>
      )}
    </Link>
  );
}

export default function DashboardFixtures() {
  const { data } = useFixtures();
  const fixtures = data ?? [];

  const [hy, hmo, hd] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
    .split("-")
    .map(Number);

  const days = [-1, 0, 1].map((offset) => {
    const key = new Date(Date.UTC(hy, hmo - 1, hd + offset)).toISOString().slice(0, 10);
    return {
      offset,
      label: offset === -1 ? "Yesterday" : offset === 1 ? "Tomorrow" : "Today",
      dateLabel: longDate(new Date(hy, hmo - 1, hd + offset)),
      items: fixtures
        .filter((f) => f.kickoff && pacificKey(f.kickoff) === key)
        .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? "")),
    };
  });

  return (
    <div className="space-y-4">
      {days.map((d) => (
        <div key={d.offset} className="fl-card overflow-hidden">
          <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
            <h4 className="font-display text-sm text-cream">{d.label}’s Games</h4>
            <span className="font-mono text-[11px] text-gold">{d.dateLabel}</span>
          </div>
          {d.items.length === 0 ? (
            <div className="px-4 py-5 text-center text-[13px] text-muted">No games {d.label.toLowerCase()}.</div>
          ) : (
            <div>{d.items.map((f) => <MatchRow key={f.id} f={f} />)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
