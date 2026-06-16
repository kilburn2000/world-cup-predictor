import { useState } from "react";
import { useFixtures, type LiveMatch } from "../api.js";
import LiveTabs from "../components/LiveTabs.js";
import CompactMatchCard from "../components/CompactMatchCard.js";
import { longDate } from "../dates.js";

const londonDate = (iso: string) => longDate(new Date(iso), "Europe/London");

export default function Fixtures() {
  const { data, isLoading, error } = useFixtures();
  const [showFinished, setShowFinished] = useState(true);

  const fixtures = (data ?? []).filter((f) => showFinished || f.status !== "FINISHED");

  // group by London date
  const byDate: { date: string; items: LiveMatch[] }[] = [];
  for (const f of fixtures) {
    const d = f.kickoff ? londonDate(f.kickoff) : "Date TBC";
    let g = byDate.find((x) => x.date === d);
    if (!g) byDate.push((g = { date: d, items: [] }));
    g.items.push(f);
  }

  return (
    <div className="fl-enter">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Statistics</div>
          <h1 className="mt-2 font-display text-3xl font-medium text-cream">All Fixtures &amp; Results</h1>
        </div>
        <button
          onClick={() => setShowFinished((v) => !v)}
          className={"rounded-lg border px-3.5 py-1.5 text-sm transition-colors " + (showFinished ? "border-gold bg-gold-soft text-cream" : "border-line text-muted hover:text-cream")}
        >
          {showFinished ? "✓ Showing finished" : "Finished hidden"}
        </button>
      </div>
      <LiveTabs />

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load fixtures.</p>}

      {byDate.map((g) => (
        <div key={g.date} className="mb-6">
          <h2 className="mb-2 text-[11px] uppercase tracking-[1.8px] text-gold">{g.date}</h2>
          <div className="grid items-start gap-2 lg:grid-cols-2">
            {g.items.map((m) => <CompactMatchCard key={m.id} m={m} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
