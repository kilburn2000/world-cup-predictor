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
// The sweepstake scoring. Per match (Team A = home, Team B = away):
//   correct outcome (+outcome), Team A goals exactly right (+teamGoals),
//   Team B goals exactly right (+teamGoals), whole score exact (+exactBonus).
// e.g. predicting 2-0 and it finishes 2-0 = 1 + 1 + 1 + 2 = 5.
// Knockout: an extra +knockoutTeam for correctly placing a team in its position.
// All point values are tunable from the Scoring page.
export interface ScoringConfig {
  outcome: number; // correct result: Team A win / Team B win / draw
  teamGoals: number; // per team whose exact goal count you predicted (home & away each)
  exactBonus: number; // bonus when the entire score is exact
  knockoutTeam: number; // knockout: correct team in the right position
}

export const DEFAULT_SCORING: ScoringConfig = {
  outcome: 1,
  teamGoals: 1,
  exactBonus: 2,
  knockoutTeam: 2,
};

export interface GroupScoreBreakdown {
  points: number;
  outcome: boolean; // correct result
  homeGoals: boolean; // Team A goal count correct
  awayGoals: boolean; // Team B goal count correct
  exact: boolean; // whole score correct
}
