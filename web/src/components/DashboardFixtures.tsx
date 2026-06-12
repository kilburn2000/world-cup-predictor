import { useFixtures } from "../api.js";
import FixtureTable from "./FixtureTable.js";
import { longDate } from "../dates.js";

// A fixture's calendar day in the host country (Pacific), matching how the
// Yesterday / Today / Tomorrow stats tabs bucket games.
const pacificKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export default function DashboardFixtures() {
  const { data } = useFixtures();
  const fixtures = data ?? [];

  const [hy, hmo, hd] = new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
    .split("-")
    .map(Number);

  const days = [-1, 0, 1].map((offset) => ({
    offset,
    label: offset === -1 ? "Yesterday" : offset === 1 ? "Tomorrow" : "Today",
    key: new Date(Date.UTC(hy, hmo - 1, hd + offset)).toISOString().slice(0, 10),
    dateLabel: longDate(new Date(hy, hmo - 1, hd + offset)),
    items: fixtures.filter((f) => f.kickoff && pacificKey(f.kickoff) === new Date(Date.UTC(hy, hmo - 1, hd + offset)).toISOString().slice(0, 10)),
  }));

  return (
    <div className="space-y-6">
      {days.map((d) => {
        const results = d.items.filter((f) => f.status === "FINISHED");
        const pending = d.items.filter((f) => f.status !== "FINISHED");
        const split = results.length > 0 && pending.length > 0;
        return (
          <div key={d.offset}>
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="font-display text-lg text-cream">{d.label}’s Games</h3>
              <span className="font-mono text-[11px] text-gold">{d.dateLabel}</span>
            </div>
            {d.items.length === 0 ? (
              <div className="fl-card px-4 py-5 text-center text-[13px] text-muted">No games {d.label.toLowerCase()}.</div>
            ) : (
              <>
                {results.length > 0 && (
                  <>
                    {split && <div className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-muted">Results</div>}
                    <FixtureTable items={results} />
                  </>
                )}
                {pending.length > 0 && (
                  <div className={results.length > 0 ? "mt-4" : ""}>
                    {split && <div className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-muted">Still to play</div>}
                    <FixtureTable items={pending} />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
