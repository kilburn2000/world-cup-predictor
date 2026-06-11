import { useState } from "react";
import { Link } from "react-router-dom";
import { useFixtures, type Fixture } from "../api.js";
import { flagFor } from "../flags.js";
import LiveTabs from "../components/LiveTabs.js";

const londonDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const londonTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

const STAGE: Record<string, string> = { LAST_32: "R32", LAST_16: "R16", QF: "QF", SF: "SF", THIRD_PLACE: "3rd", FINAL: "Final" };
const stageLabel = (f: Fixture) => (f.stage === "GROUP" ? (f.group ? `Group ${f.group}` : "Group") : STAGE[f.stage] ?? f.stage);

function Team({ name, align }: { name: string | null; align: "left" | "right" }) {
  const cls = "flex items-center gap-1.5 min-w-0 " + (align === "right" ? "justify-end" : "");
  if (!name) return <div className={cls + " italic text-muted"}>TBD</div>;
  return (
    <div className={cls}>
      {align === "left" && <span>{flagFor(name)}</span>}
      <span className="truncate text-cream">{name}</span>
      {align === "right" && <span>{flagFor(name)}</span>}
    </div>
  );
}

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
        <h1 className="font-display text-3xl font-medium text-cream">Fixtures &amp; results</h1>
        <button
          onClick={() => setShowFinished((v) => !v)}
          className={"rounded-lg border px-3.5 py-1.5 text-sm transition-colors " + (showFinished ? "border-gold bg-gold-soft text-cream" : "border-line text-muted hover:text-cream")}
        >
          {showFinished ? "✓ Showing finished" : "Finished hidden"}
        </button>
      </div>

      {isLoading && <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>}
      {error && <p className="text-down">Couldn’t load fixtures.</p>}

      {byDate.map((g) => (
        <div key={g.date} className="mb-6">
          <h2 className="mb-2 text-[11px] uppercase tracking-[1.8px] text-gold">{g.date}</h2>
          <div className="fl-card overflow-hidden">
            {g.items.map((f) => {
              const live = f.status === "IN_PLAY";
              const done = f.status === "FINISHED";
              return (
                <Link
                  key={f.id}
                  to={`/live/fixtures/${f.id}`}
                  state={{ from: "/live/fixtures", label: "Fixtures" }}
                  className="grid grid-cols-[58px_1fr_auto_1fr_46px] items-center gap-2 border-t border-line px-4 py-2.5 text-[13px] transition-colors first:border-t-0 hover:bg-gold-soft"
                >
                  <div className="font-mono text-[11px] text-muted">{f.kickoff ? londonTime(f.kickoff) : "–"}</div>
                  <Team name={f.home} align="right" />
                  <div className="px-1 text-center font-mono">
                    {done || live ? (
                      <span className="text-cream">{f.homeScore}–{f.awayScore}</span>
                    ) : (
                      <span className="text-xs text-muted">v</span>
                    )}
                  </div>
                  <Team name={f.away} align="left" />
                  <div className="text-right">
                    {live ? (
                      <span className="font-mono text-[10px] font-semibold text-[#d9534f]">LIVE</span>
                    ) : done ? (
                      <span className="font-mono text-[10px] text-muted">FT</span>
                    ) : (
                      <span className="font-mono text-[9px] uppercase text-muted">{stageLabel(f)}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
