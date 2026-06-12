import { useLiveMatches } from "../api.js";
import LiveTabs from "../components/LiveTabs.js";
import MatchCard from "../components/MatchCard.js";
import { longDate } from "../dates.js";

export default function LiveScores({ day = 0 }: { day?: number }) {
  const { data, isLoading, error } = useLiveMatches(day);
  const matches = data ?? [];
  const live = matches.filter((m) => m.status === "IN_PLAY" || m.status === "PAUSED");
  const upcoming = matches.filter((m) => m.status === "SCHEDULED");
  const finished = matches.filter((m) => m.status === "FINISHED");

  const dayLabel = day === -1 ? "Yesterday" : day === 1 ? "Tomorrow" : "Today";
  // host-country (Pacific) date for the selected day
  const [hy, hmo, hd] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).split("-").map(Number);
  const dateLabel = longDate(new Date(hy, hmo - 1, hd + day));

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

      <div className="flex flex-col gap-5">
        {live.map((m) => <MatchCard key={m.id} m={m} />)}
        {finished.map((m) => <MatchCard key={m.id} m={m} />)}
        {upcoming.map((m) => <MatchCard key={m.id} m={m} />)}
      </div>
    </div>
  );
}
