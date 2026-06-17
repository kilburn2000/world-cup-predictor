import { useFixtures, type LiveMatch } from "../api.js";
import LiveTabs from "../components/LiveTabs.js";
import CompactMatchCard from "../components/CompactMatchCard.js";
import { longDate } from "../dates.js";

const ROUND_LABEL: Record<string, string> = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  THIRD_PLACE: "Third-place play-off",
  FINAL: "Final",
};
const ROUND_ORDER = ["LAST_32", "LAST_16", "QF", "SF", "THIRD_PLACE", "FINAL"];

const londonDate = (iso: string) => longDate(new Date(iso), "Europe/London");

// Group a round's fixtures by London date, preserving fixture order.
function byDate(items: LiveMatch[]): { date: string; items: LiveMatch[] }[] {
  const groups: { date: string; items: LiveMatch[] }[] = [];
  for (const m of items) {
    const d = m.kickoff ? londonDate(m.kickoff) : "Date TBC";
    let g = groups.find((x) => x.date === d);
    if (!g) groups.push((g = { date: d, items: [] }));
    g.items.push(m);
  }
  return groups;
}

export default function WCKnockout() {
  const { data, isLoading, error } = useFixtures();
  const knockout = (data ?? []).filter((m) => m.stage !== "GROUP");
  const rounds = ROUND_ORDER
    .map((stage) => ({ stage, label: ROUND_LABEL[stage] ?? stage, items: knockout.filter((m) => m.stage === stage) }))
    .filter((r) => r.items.length > 0);

  return (
    <div className="fl-enter">
      <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Statistics</div>
      <h1 className="mb-1 mt-2 font-display text-3xl font-medium text-cream">Knockout</h1>
      <p className="mb-5 text-[13px] text-muted">
        The whole bracket, round by round and split by match day. Each fixture lists its venue and kickoff; teams read
        “TBD” until the groups they come from are decided. Once a tie kicks off, its card carries the live score and
        everyone’s predictions, just like the rest of the site.
      </p>
      <LiveTabs />

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load the knockout fixtures.</p>}

      {rounds.map((r) => (
        <div key={r.stage} className="mb-8">
          <h2 className="mb-3 font-display text-xl text-cream">{r.label}</h2>
          {byDate(r.items).map((g) => (
            <div key={g.date} className="mb-4">
              <h3 className="mb-2 text-[11px] uppercase tracking-[1.8px] text-gold">{g.date}</h3>
              <div className="grid items-start gap-2 lg:grid-cols-2">
                {g.items.map((m) => <CompactMatchCard key={m.id} m={m} />)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
