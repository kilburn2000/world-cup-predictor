import { useFixtures } from "../api.js";
import LiveTabs from "../components/LiveTabs.js";
import CompactMatchCard from "../components/CompactMatchCard.js";

const ROUND_LABEL: Record<string, string> = {
  LAST_32: "Round of 32",
  LAST_16: "Round of 16",
  QF: "Quarter-finals",
  SF: "Semi-finals",
  THIRD_PLACE: "Third-place play-off",
  FINAL: "Final",
};
const ROUND_ORDER = ["LAST_32", "LAST_16", "QF", "SF", "THIRD_PLACE", "FINAL"];

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
        Every knockout fixture with its stadium and kickoff. Teams show as “TBD” until their group is decided; once a
        game is under way the card carries the live score and predictions just like everywhere else.
      </p>
      <LiveTabs />

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load the knockout fixtures.</p>}

      {rounds.map((r) => (
        <div key={r.stage} className="mb-7">
          <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-gold">{r.label}</h2>
          <div className="grid items-start gap-2 lg:grid-cols-2">
            {r.items.map((m) => <CompactMatchCard key={m.id} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
