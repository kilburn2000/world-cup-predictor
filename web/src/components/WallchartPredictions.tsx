import { useWallchart, useWcGroups, type WallchartMatch, type WcStanding } from "../api.js";
import { flagFor } from "../flags.js";
import ScoredChips from "./ScoredChips.js";
import PointsPill from "./PointsPill.js";

const MATCH_COLS = "grid grid-cols-[1fr_46px_1fr] items-center gap-1.5";
const STANDING_COLS = "grid grid-cols-[18px_1fr_20px_20px_20px_20px_28px_30px] items-center gap-1 px-4 text-[11.5px]";

// The entrant's predicted final table for one group: same columns as the real
// Groups page, top-2 (and best-thirds) highlighted as qualifying. Once the real
// group has finished, each team is marked: a green check when both its position
// AND whether it qualified were predicted right; an amber tilde when the group
// position was right but the qualify/out fate was wrong (only possible for a
// 3rd-placed team, who may or may not go through as a best-third).
function PredictedTable({ table, actualPos }: { table: WcStanding[]; actualPos: Map<number, { pos: number; qualified: boolean; decided: boolean }> }) {
  return (
    <div className="border-b border-line pb-1">
      <div className={STANDING_COLS + " py-1.5 text-[8.5px] uppercase tracking-wide text-muted"}>
        <div />
        <div>Team</div>
        <div className="text-center">P</div>
        <div className="text-center">W</div>
        <div className="text-center">D</div>
        <div className="text-center">L</div>
        <div className="text-center">GD</div>
        <div className="text-right">Pts</div>
      </div>
      {table.map((t, i) => {
        const a = actualPos.get(t.teamId);
        const posRight = a?.decided && a.pos === i + 1;
        const fullyRight = posRight && t.qualified === a!.qualified;
        return (
        <div key={t.teamId} className={STANDING_COLS + " border-t border-line py-1 " + (t.qualified ? "bg-gold/10" : "")}>
          <div className="font-mono text-[10px] text-muted">{i + 1}</div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span>{flagFor(t.name)}</span>
            <span className={"truncate " + (t.qualified ? "text-cream" : "text-muted")}>{t.name}</span>
            {fullyRight ? (
              <span className="shrink-0 text-[10px] text-[#6bbf86]" title="Correct position and qualification">✓</span>
            ) : posRight ? (
              <span className="shrink-0 text-[10px] text-[#e3c558]" title="Right group position, but wrong on qualifying">~</span>
            ) : null}
          </div>
          <div className="text-center font-mono text-[10px] text-muted">{t.played}</div>
          <div className="text-center font-mono text-[10px] text-muted">{t.won}</div>
          <div className="text-center font-mono text-[10px] text-muted">{t.drawn}</div>
          <div className="text-center font-mono text-[10px] text-muted">{t.lost}</div>
          <div className="text-center font-mono text-[10px] text-muted">{t.gd > 0 ? `+${t.gd}` : t.gd}</div>
          <div className="text-right font-mono text-[12px] font-semibold text-cream">{t.points}</div>
        </div>
        );
      })}
    </div>
  );
}

// What a prediction scored, so the points pill takes the matching colour
// (green exact / yellow partial / red miss) instead of the neutral fallback.
function tierOf(ph: number, pa: number, hs: number, as: number): "exact" | "result" | "diff" | "miss" {
  if (ph === hs && pa === as) return "exact";
  if (Math.sign(ph - pa) === Math.sign(hs - as)) return "result";
  if (ph === hs || pa === as) return "diff";
  return "miss";
}

function MatchRow({ m }: { m: WallchartMatch }) {
  const played = (m.status === "FINISHED" || m.status === "IN_PLAY") && m.actualHome != null;
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className={MATCH_COLS + " text-[12.5px]"}>
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <span className="truncate text-cream">{m.home}</span>
          <span>{flagFor(m.home)}</span>
        </div>
        <div className="text-center font-mono">
          {played ? (
            <span className="text-cream">{m.actualHome}–{m.actualAway}</span>
          ) : (
            <span className="text-gold">{m.predHome}–{m.predAway}</span>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span>{flagFor(m.away)}</span>
          <span className="truncate text-cream">{m.away}</span>
        </div>
      </div>
      {played && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px]">
          <span className="text-muted">Predicted</span>
          <span className="font-mono text-gold">{m.predHome}–{m.predAway}</span>
          <ScoredChips pick={`${m.predHome}-${m.predAway}`} hs={m.actualHome ?? 0} as={m.actualAway ?? 0} homeCode={m.homeCode ?? ""} awayCode={m.awayCode ?? ""} />
          <PointsPill points={m.points ?? 0} tier={tierOf(m.predHome, m.predAway, m.actualHome ?? 0, m.actualAway ?? 0)} />
        </div>
      )}
    </div>
  );
}

// An entrant's predictions: group-stage scorelines (with actual + points once
// played) and their predicted knockout bracket. Used by the entrant detail page
// (view "all") and the tabbed "My Predictions" page (a single section).
export default function WallchartPredictions({ id, view = "all" }: { id: string | number; view?: "groups" | "bracket" | "all" }) {
  const { data } = useWallchart(id);
  const { data: actualGroups } = useWcGroups();
  // Each team's actual finishing position, whether it actually qualified, and
  // whether its group has finished - to mark the placements the entrant got right.
  const actualPos = new Map<number, { pos: number; qualified: boolean; decided: boolean }>();
  for (const g of actualGroups ?? []) g.table.forEach((t, i) => actualPos.set(t.teamId, { pos: i + 1, qualified: t.qualified, decided: g.decided }));
  if (!data) return null;

  const byRound = new Map<string, typeof data.knockout>();
  for (const k of data.knockout) {
    if (!byRound.has(k.label)) byRound.set(k.label, []);
    byRound.get(k.label)!.push(k);
  }

  const showGroups = view === "all" || view === "groups";
  const showBracket = view === "all" || view === "bracket";
  const headings = view === "all"; // headings only when both sections show

  return (
    <>
      {showGroups && (
        <>
      {headings && <h3 className="mb-3 font-display text-base text-cream">Group stage</h3>}
      <div className={"grid gap-4 sm:grid-cols-2" + (showBracket ? " mb-8" : "")}>
        {data.groups.map((g) => {
          const standings = data.predictedStandings?.find((s) => s.group === g.group);
          return (
          <div key={g.group} className="fl-card overflow-hidden">
            <h4 className="border-b border-line px-4 py-2.5 font-display text-sm text-cream">
              Group {g.group}
            </h4>
            {standings && <PredictedTable table={standings.table} actualPos={actualPos} />}
            <div className="px-4 py-1">
              {g.matches.map((m, i) => (
                <MatchRow key={i} m={m} />
              ))}
            </div>
          </div>
          );
        })}
      </div>
        </>
      )}

      {showBracket && (
        <>
      {headings && <h3 className="mb-3 font-display text-base text-cream">Predicted bracket</h3>}
      <div className="grid gap-4 sm:grid-cols-2">
        {[...byRound.entries()].map(([label, matches]) => (
          <div key={label} className="fl-card overflow-hidden">
            <h4 className="border-b border-line px-4 py-2.5 font-display text-sm text-cream">{label}</h4>
            <div className="px-4 py-1">
              {matches.map((k) => {
                const played = k.status === "FINISHED" || k.status === "IN_PLAY";
                return (
                <div key={k.slot} className="border-t border-line py-1.5 first:border-t-0">
                  {/* the entrant's predicted matchup + score */}
                  <div className="flex items-center gap-2 text-[13px]">
                    <span className="flex flex-1 items-center justify-end gap-1.5 truncate text-right text-cream">
                      <span className="truncate">{k.home}</span>
                      <span className="shrink-0">{flagFor(k.home)}</span>
                    </span>
                    <span className="w-11 text-center font-mono text-gold">
                      {k.predHome}–{k.predAway}
                    </span>
                    <span className="flex flex-1 items-center gap-1.5 truncate text-cream">
                      <span className="shrink-0">{flagFor(k.away)}</span>
                      <span className="truncate">{k.away}</span>
                    </span>
                  </div>
                  {/* the actual result, then the scoring + points chips after it */}
                  {k.actualHome && (
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10.5px]">
                      <span className="uppercase tracking-wide text-muted">Actual</span>
                      <span className="flex items-center gap-1 whitespace-nowrap font-mono">
                        <span>{flagFor(k.actualHome)}</span>
                        <span className="text-cream">{k.actualHomeCode}</span>
                        <span className={played ? "text-cream" : "text-muted"}>{played ? `${k.actualHomeScore}–${k.actualAwayScore}` : "v"}</span>
                        <span className="text-cream">{k.actualAwayCode}</span>
                        <span>{flagFor(k.actualAway)}</span>
                      </span>
                      {played && k.points != null && <PointsPill points={k.points} />}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </>
  );
}
