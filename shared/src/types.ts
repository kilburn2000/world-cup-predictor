// Domain types shared between the server and web. Kept dependency-free so both
// the Fastify server (via tsx) and Vite can import the .ts source directly.

export type Stage =
  | "GROUP"
  | "LAST_32"
  | "LAST_16"
  | "QF"
  | "SF"
  | "THIRD_PLACE"
  | "FINAL";

// Knockout rounds that award "team progression" points.
export type ProgressionRound = "LAST_32" | "LAST_16" | "QF" | "SF" | "FINAL";

export type MatchStatus = "SCHEDULED" | "IN_PLAY" | "FINISHED";

export type Outcome = "HOME" | "DRAW" | "AWAY";

export interface Scoreline {
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
}

// Mirrors the entry spreadsheet's scoring (template "hb v3.6"). All point values
// are tunable from the Scoring page; the thresholds drive the "many goals"
// consolation bonus.
export interface ScoringConfig {
  outcome: number; // correct Win/Draw/Loss
  goalDifference: number; // correct goal difference
  exact: number; // exact score (stacks with outcome + goalDifference)
  manyGoals: number; // "good approximation" consolation on high-scoring games
  knockoutTeam: number; // per team correctly predicted to reach a knockout round
  finalThird: number; // correctly predicting the Final / Third-place winners
  // Thresholds for the "many goals" bonus (PrSettings M6/M7/M8).
  manyGoalsDrawMin: number; // high-scoring-draw threshold
  largeGdMin: number; // large goal-difference threshold
  largeSumMin: number; // large total-goals threshold
}

export const DEFAULT_SCORING: ScoringConfig = {
  outcome: 5,
  goalDifference: 5,
  exact: 10,
  manyGoals: 3,
  knockoutTeam: 10,
  finalThird: 10,
  manyGoalsDrawMin: 4,
  largeGdMin: 4,
  largeSumMin: 8,
};

export interface GroupScoreBreakdown {
  points: number;
  outcome: boolean;
  goalDifference: boolean;
  exact: boolean;
  manyGoals: boolean;
}
