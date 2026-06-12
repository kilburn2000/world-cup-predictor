// The scoring engine - a faithful port of the entry spreadsheet's formulas
// (template "hb v3.6"). Pure + deterministic so it can be re-run over the whole
// tournament whenever a result changes.

import type { Scoreline, Outcome, ScoringConfig, GroupScoreBreakdown } from "./types.js";

export function outcomeOf(s: Scoreline): Outcome {
  if (s.homeGoals > s.awayGoals) return "HOME";
  if (s.homeGoals < s.awayGoals) return "AWAY";
  return "DRAW";
}

// Order-independent check that two scorelines involve the same two teams.
export function sameMatchup(a: Scoreline, b: Scoreline): boolean {
  const x = [a.homeTeamId, a.awayTeamId].sort((m, n) => m - n);
  const y = [b.homeTeamId, b.awayTeamId].sort((m, n) => m - n);
  return x[0] === y[0] && x[1] === y[1];
}

// Score a match. Predicted + actual goals are already aligned to the fixture's
// home/away (Team A = home, Team B = away). Components stack additively:
//   +outcome    correct result (A win / B win / draw)
//   +teamGoals  Team A's goal count exactly right
//   +teamGoals  Team B's goal count exactly right
//   +exactBonus the whole score is exact
export function scoreGroupMatch(
  predH: number,
  predA: number,
  actH: number,
  actA: number,
  cfg: ScoringConfig,
): GroupScoreBreakdown {
  const outcome =
    outcomeOf({ homeTeamId: 0, awayTeamId: 1, homeGoals: predH, awayGoals: predA }) ===
    outcomeOf({ homeTeamId: 0, awayTeamId: 1, homeGoals: actH, awayGoals: actA });
  const homeGoals = predH === actH;
  const awayGoals = predA === actA;
  const exact = homeGoals && awayGoals;

  const points =
    (outcome ? cfg.outcome : 0) +
    (homeGoals ? cfg.teamGoals : 0) +
    (awayGoals ? cfg.teamGoals : 0) +
    (exact ? cfg.exactBonus : 0);

  return { points, outcome, homeGoals, awayGoals, exact };
}

// Knockout "team progression": every team an entrant predicted to reach a round
// that actually did earns `pointsPerTeam`.
export function progressionPoints(
  predictedTeamIds: number[],
  actualTeamIds: number[],
  pointsPerTeam: number,
): { points: number; correctTeamIds: number[] } {
  const actual = new Set(actualTeamIds);
  const correctTeamIds = [...new Set(predictedTeamIds)].filter((id) => actual.has(id));
  return { points: correctTeamIds.length * pointsPerTeam, correctTeamIds };
}
