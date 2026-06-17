import { useLiveMatches, type LiveMatch } from "../api.js";
import CompactMatchCard from "./CompactMatchCard.js";

// Yesterday / Today / Tomorrow games, in the same card format as /statistics/today,
// driven by the live feed so they update in real time during live games (and the
// demo).
export default function DashboardFixtures() {
  const today = useLiveMatches(0).data ?? [];
  const yesterday = useLiveMatches(-1).data ?? [];

  // Live first, then finished results, then still-to-play - so played games never
  // sit below upcoming ones on the same day.
  const rank = (m: LiveMatch) =>
    m.status === "IN_PLAY" || m.status === "PAUSED" ? 0 : m.status === "FINISHED" ? 1 : 2;
  const sortDay = (arr: LiveMatch[]) =>
    [...arr].sort((a, b) => rank(a) - rank(b) || (a.kickoff ?? "").localeCompare(b.kickoff ?? ""));

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
