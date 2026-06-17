// Standings ordering + tiebreaks, shared by the API and the web app so every
// table and position label across the whole site ranks entrants identically.
//
// ROLLBACK: flip either flag to false to drop that tiebreak level. `byExact`
// breaks a points tie by exact-score count; `byResults` then breaks any
// remaining tie by correct-result count. Both false => a pure points ranking
// (entrants level on points share a rank, ordered alphabetically).
export const STANDINGS_TIEBREAK = { byExact: true, byResults: true };

// A single ordering value: higher ranks higher. Points dominate; exact scores are
// a fractional add-on (never enough to overtake a whole point) and correct results
// a smaller add-on still (never enough to overtake an exact). So the order is
// points, then exacts, then results - each level gated by its flag.
export function standingKey(points: number, exact = 0, result = 0): number {
  return (
    points +
    (STANDINGS_TIEBREAK.byExact ? Math.min(exact, 999) / 1e3 : 0) +
    (STANDINGS_TIEBREAK.byResults ? Math.min(result, 999) / 1e6 : 0)
  );
}
