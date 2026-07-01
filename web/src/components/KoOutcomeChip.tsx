import { toneFor } from "./PointsPill.js";

// THE knockout outcome chip - one source of truth, used by the predicted-bracket
// tab, the form tooltip, the standings live column and match cards.
// Built from what the prediction scored on the 90-minute result:
//   team in the right position -> "RSA ✓"
//   correct result             -> "RES", or "RES (D)" for a correctly-called draw
//   a side's goal tally         -> "RSA 1" (team placed right) or "(H) 1" (not)
//   exact score                 -> "Exact" (collapses the result + goal bits)
//   nothing                     -> red "N/A"
// Coloured to match the points pill beside it (points determine the colour).
export default function KoOutcomeChip({
  points, homeCode, awayCode, predHome, predAway, actualHome, actualAway, homeCorrect, awayCorrect,
}: {
  points: number;
  homeCode: string | null; awayCode: string | null;
  predHome: number; predAway: number; actualHome: number | null; actualAway: number | null;
  homeCorrect: boolean; awayCorrect: boolean;
}) {
  const parts: string[] = [];
  if (homeCorrect) parts.push(`${homeCode} ✓`);
  if (awayCorrect) parts.push(`${awayCode} ✓`);
  if (actualHome != null && actualAway != null) {
    const hgOk = predHome === actualHome, agOk = predAway === actualAway;
    if (hgOk && agOk) {
      parts.push("Exact");
    } else {
      if (Math.sign(predHome - predAway) === Math.sign(actualHome - actualAway)) parts.push(actualHome === actualAway ? "RES (D)" : "RES");
      if (hgOk) parts.push(`${homeCorrect ? homeCode : "(H)"} ${actualHome}`);
      if (agOk) parts.push(`${awayCorrect ? awayCode : "(A)"} ${actualAway}`);
    }
  }
  const t = toneFor(points);
  return (
    <span className="whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: t.bg, color: t.fg }}>
      {parts.length === 0 ? "N/A" : parts.join(" + ")}
    </span>
  );
}
