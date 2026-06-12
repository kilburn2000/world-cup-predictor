import { Link } from "react-router-dom";
import { type Fixture } from "../api.js";
import { flagFor } from "../flags.js";
import ScoredChips from "./ScoredChips.js";
import PointsPill from "./PointsPill.js";

const londonTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

const STAGE: Record<string, string> = { LAST_32: "R32", LAST_16: "R16", QF: "QF", SF: "SF", THIRD_PLACE: "3rd", FINAL: "Final" };
const stageLabel = (f: Fixture) => (f.stage === "GROUP" ? (f.group ? `Group ${f.group}` : "Group") : STAGE[f.stage] ?? f.stage);
const pct = (n?: number, total?: number) => (total ? Math.round(((n ?? 0) / total) * 100) : 0);
const numPct = (n?: number, total?: number) => `${n ?? 0} (${pct(n, total)}%)`;

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

const COLS = "grid grid-cols-[52px_1fr_auto_1fr_44px] sm:grid-cols-[52px_1fr_auto_1fr_58px_74px_44px]";

// A table of fixtures that are all the same status-class (all finished, or all
// pending) so the right-hand columns mean one thing throughout.
export default function FixtureTable({ items }: { items: Fixture[] }) {
  const allDone = items.every((f) => f.status === "FINISHED");
  return (
    <div className="fl-card overflow-hidden">
      <div className="hidden border-b border-line px-4 py-1.5 text-[9px] uppercase tracking-wide text-muted sm:grid sm:grid-cols-[52px_1fr_auto_1fr_58px_74px_44px] sm:gap-2">
        <div /><div /><div /><div />
        <div className="col-span-2 text-center">{allDone ? "Got it right" : "Most predicted"}</div>
        <div />
      </div>
      {items.map((f) => {
        const live = f.status === "IN_PLAY";
        const done = f.status === "FINISHED";
        const resultChip =
          f.mostCommonResult === "DRAW" ? (
            <span>Draw</span>
          ) : f.mostCommonResult ? (
            <span className="inline-flex items-center gap-1">
              <span>{flagFor(f.mostCommonResult === "HOME" ? f.home : f.away)}</span>
              <span className="text-cream">{f.mostCommonResult === "HOME" ? f.homeCode : f.awayCode}</span>
            </span>
          ) : null;
        return (
          <Link
            key={f.id}
            to={`/stats/fixtures/${f.id}`}
            state={{ from: "/stats/fixtures", label: "Fixtures" }}
            className="block border-t border-line px-4 py-2.5 transition-colors first:border-t-0 hover:bg-gold-soft"
          >
            <div className={COLS + " items-center gap-2 text-[13px]"}>
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
              <div className="hidden text-center sm:block">
                {done ? (
                  <>
                    <div className="font-mono text-[12px] text-cream">{f.exactCorrect ?? 0}</div>
                    <div className="text-[8px] leading-tight text-muted">Exact ({pct(f.exactCorrect, f.mostCommonTotal)}%)</div>
                  </>
                ) : (
                  <>
                    <div className="font-mono text-[12px] text-cream">{f.mostCommonScore ? f.mostCommonScore.replace("-", "–") : "–"}</div>
                    {f.mostCommonScore && <div className="text-[8px] leading-tight text-muted">{numPct(f.mostCommonScoreCount, f.mostCommonTotal)}</div>}
                  </>
                )}
              </div>
              <div className="hidden text-center sm:block">
                {done ? (
                  <>
                    <div className="font-mono text-[12px] text-cream">{f.resultCorrect ?? 0}</div>
                    <div className="text-[8px] leading-tight text-muted">Result ({pct(f.resultCorrect, f.mostCommonTotal)}%)</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-1 font-mono text-[12px] text-muted">{resultChip ?? "–"}</div>
                    {f.mostCommonResult && <div className="text-[8px] leading-tight text-muted">{numPct(f.mostCommonResultCount, f.mostCommonTotal)}</div>}
                  </>
                )}
              </div>
              <div className="text-right">
                {live ? (
                  <span className="font-mono text-[10px] font-semibold text-[#d9534f]">LIVE</span>
                ) : done ? (
                  <span className="font-mono text-[10px] text-muted">FT</span>
                ) : (
                  <span className="font-mono text-[9px] uppercase text-muted">{stageLabel(f)}</span>
                )}
              </div>
            </div>

            {/* Logged-in entrant's own pick - with the outcome chips once the game
                is under way, mirroring the live match cards. */}
            {f.myPick && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-2 text-[11px]">
                <span className="text-[8.5px] uppercase leading-none tracking-[1.5px] text-gold/80">Your prediction</span>
                <span className="font-mono leading-none text-cream">{f.myPick.replace("-", "–")}</span>
                {(done || live) && f.homeScore != null && f.awayScore != null && (
                  <>
                    <ScoredChips pick={f.myPick} hs={f.homeScore} as={f.awayScore} homeCode={f.homeCode ?? ""} awayCode={f.awayCode ?? ""} />
                    {f.myPoints != null && <PointsPill points={f.myPoints} />}
                  </>
                )}
              </div>
            )}

            {/* Mobile: the prediction columns can't fit inline, so stack them below. */}
            {(done || f.mostCommonScore) && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 border-t border-line pt-2 text-[11px] text-muted sm:hidden">
                <span className="text-[8.5px] uppercase tracking-[1.5px] text-muted/70">{done ? "Got it right" : "Most predicted"}</span>
                {done ? (
                  <>
                    <span><span className="font-mono text-cream">{f.exactCorrect ?? 0}</span> Exact ({pct(f.exactCorrect, f.mostCommonTotal)}%)</span>
                    <span><span className="font-mono text-cream">{f.resultCorrect ?? 0}</span> Result ({pct(f.resultCorrect, f.mostCommonTotal)}%)</span>
                  </>
                ) : (
                  <>
                    <span><span className="font-mono text-cream">{f.mostCommonScore!.replace("-", "–")}</span> {numPct(f.mostCommonScoreCount, f.mostCommonTotal)}</span>
                    {resultChip && (
                      <span className="inline-flex items-center gap-1">
                        {resultChip}
                        <span className="ml-0.5">{numPct(f.mostCommonResultCount, f.mostCommonTotal)}</span>
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
