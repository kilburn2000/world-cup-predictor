import { useLiveMatches, type LiveMatch } from "../api.js";
import CompactMatchCard from "./CompactMatchCard.js";

// Yesterday / Today / Tomorrow games, in the same card format as /statistics/today,
// driven by the live feed so they update in real time during live games (and the
// demo).
export default function DashboardFixtures() {
  const today = useLiveMatches(0).data ?? [];
  const yesterday = useLiveMatches(-1).data ?? [];

  // Chronological by kickoff - so the day reads in order: earlier finished games,
  // then whatever is live now, then later kick-offs.
  const sortDay = (arr: LiveMatch[]) =>
    [...arr].sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));

  const days = [
    { offset: -1, label: "Yesterday", items: sortDay(yesterday) },
    { offset: 0, label: "Today", items: sortDay(today) },
  ];

  return (
    <div className="space-y-7">
      {days.map((d) => (
        <div key={d.offset}>
          <h3 className="mb-3 font-display text-lg text-cream">{d.label}’s Games</h3>
          {d.items.length === 0 ? (
            <div className="fl-card px-4 py-5 text-center text-[13px] text-muted">No games {d.label.toLowerCase()}.</div>
          ) : (
            <div className="grid items-start gap-2 lg:grid-cols-2">{d.items.map((m) => <CompactMatchCard key={m.id} m={m} />)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
