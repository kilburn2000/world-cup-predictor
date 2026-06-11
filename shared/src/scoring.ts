// The scoring engine — a faithful port of the entry spreadsheet's formulas
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

// The "many goals — good approximation" consolation (PrSettings S-column formula):
// on a big-goal-difference game, a high-scoring draw, or a high total-goals game,
// award the bonus if the prediction was within 1.
function manyGoalsBonus(
  predH: number,
  predA: number,
  actH: number,
  actA: number,
  outcomeCorrect: boolean,
  cfg: ScoringConfig,
): boolean {
  const actGd = actH - actA;
  const predGd = predH - predA;
  if (Math.abs(actGd) >= cfg.largeGdMin) return Math.abs(actGd - predGd) <= 1;
  if (outcomeCorrect && actH === actA && actH >= cfg.manyGoalsDrawMin)
    return Math.abs(predH - actH) <= 1;
  if (outcomeCorrect && actH + actA >= cfg.largeSumMin)
    return Math.abs(predH - actH) + Math.abs(predA - actA) <= 1;
  return false;
}

// Score a GROUP-stage match. Predicted + actual goals are already aligned to the
// fixed home/away of the fixture. Components stack additively.
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
  const goalDifference = predH - predA === actH - actA;
  const exact = predH === actH && predA === actA;
  const manyGoals = manyGoalsBonus(predH, predA, actH, actA, outcome, cfg);

  const points =
    (outcome ? cfg.outcome : 0) +
    (goalDifference ? cfg.goalDifference : 0) +
    (exact ? cfg.exact : 0) +
    (manyGoals ? cfg.manyGoals : 0);

  return { points, outcome, goalDifference, exact, manyGoals };
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
