import { useWallchart, type WallchartMatch } from "../api.js";
import { flagFor } from "../flags.js";
import ScoredChips from "./ScoredChips.js";
import PointsPill from "./PointsPill.js";

const MATCH_COLS = "grid grid-cols-[1fr_46px_1fr] items-center gap-1.5";

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
        {data.groups.map((g) => (
          <div key={g.group} className="fl-card overflow-hidden">
            <h4 className="border-b border-line px-4 py-2.5 font-display text-sm text-cream">
              Group {g.group}
            </h4>
            <div className="px-4 py-1">
              {g.matches.map((m, i) => (
                <MatchRow key={i} m={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
        </>
      )}

      {showBracket && (
        <>
      {headings && <h3 className="mb-3 font-display text-base text-cream">Predicted bracket</h3>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...byRound.entries()].map(([label, matches]) => (
          <div key={label} className="fl-card overflow-hidden">
            <h4 className="border-b border-line px-4 py-2.5 font-display text-sm text-cream">{label}</h4>
            <div className="px-4 py-1">
              {matches.map((k) => (
                <div
                  key={k.slot}
                  className="flex items-center gap-2 border-t border-line py-1.5 text-[13px] first:border-t-0"
                >
                  <span className="flex-1 truncate text-right text-cream">{k.home}</span>
                  <span className="w-11 text-center font-mono text-gold">
                    {k.predHome}–{k.predAway}
                  </span>
                  <span className="flex-1 truncate text-cream">{k.away}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
        </>
      )}
    </>
  );
}
