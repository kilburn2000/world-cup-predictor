import { useState } from "react";
import { useFixtures, type Fixture } from "../api.js";
import LiveTabs from "../components/LiveTabs.js";
import FixtureTable from "../components/FixtureTable.js";

const londonDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

export default function Fixtures() {
  const { data, isLoading, error } = useFixtures();
  const [showFinished, setShowFinished] = useState(true);

  const fixtures = (data ?? []).filter((f) => showFinished || f.status !== "FINISHED");

  // group by London date
  const byDate: { date: string; items: Fixture[] }[] = [];
  for (const f of fixtures) {
    const d = f.kickoff ? londonDate(f.kickoff) : "Date TBC";
    let g = byDate.find((x) => x.date === d);
    if (!g) byDate.push((g = { date: d, items: [] }));
    g.items.push(f);
  }

  return (
    <div className="fl-enter">
      <LiveTabs />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-medium text-cream">All Fixtures &amp; Results</h1>
        <button
          onClick={() => setShowFinished((v) => !v)}
          className={"rounded-lg border px-3.5 py-1.5 text-sm transition-colors " + (showFinished ? "border-gold bg-gold-soft text-cream" : "border-line text-muted hover:text-cream")}
        >
          {showFinished ? "✓ Showing finished" : "Finished hidden"}
        </button>
      </div>

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load fixtures.</p>}

      {byDate.map((g) => {
        const pending = g.items.filter((f) => f.status !== "FINISHED");
        const results = g.items.filter((f) => f.status === "FINISHED");
        const split = pending.length > 0 && results.length > 0;
        return (
          <div key={g.date} className="mb-6">
            <h2 className="mb-2 text-[11px] uppercase tracking-[1.8px] text-gold">{g.date}</h2>
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
          </div>
        );
      })}
    </div>
  );
}
