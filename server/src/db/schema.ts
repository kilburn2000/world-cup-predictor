import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  boolean,
  unique,
} from "drizzle-orm/pg-core";

// Teams in the tournament (seeded from football-data.org).
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  apiTeamId: integer("api_team_id").unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  tla: text("tla"), // 3-letter code
  crestUrl: text("crest_url"),
  groupName: text("group_name"), // "A".."L"
});

// Every match. Group fixtures have fixed teams; knockout matches start with TBD
// teams (null) and a bracket slot, and get resolved as the API fills them in.
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  apiMatchId: integer("api_match_id").unique(),
  stage: text("stage").notNull(), // Stage from shared/types
  groupName: text("group_name"),
  matchday: integer("matchday"),
  bracketSlot: text("bracket_slot"), // e.g. "R32-1" for knockout matches
  homeTeamId: integer("home_team_id").references(() => teams.id),
  awayTeamId: integer("away_team_id").references(() => teams.id),
  kickoffUtc: timestamp("kickoff_utc", { withTimezone: true }),
  status: text("status").notNull().default("SCHEDULED"), // MatchStatus
  homeGoals: integer("home_goals"),
  awayGoals: integer("away_goals"),
  homePenalties: integer("home_penalties"),
  awayPenalties: integer("away_penalties"),
  winnerTeamId: integer("winner_team_id").references(() => teams.id),
  resultOverridden: boolean("result_overridden").notNull().default(false),
});

export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
});

export const entrants = pgTable("entrants", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id),
  name: text("name").notNull(),
  email: text("email"),
  // true when we only have a partial name (e.g. just a first name).
  nameIncomplete: boolean("name_incomplete").notNull().default(false),
  // the entrant's competition group ("A".."H"); top 2 by group-stage points qualify.
  entrantGroup: text("entrant_group"),
});

// One row per prediction.
// - scope "MATCH": a fixed group fixture (matchId set).
// - scope "SLOT": a knockout bracket slot (bracketSlot set), carrying the
//   entrant's OWN predicted pairing (predHomeTeamId/predAwayTeamId).
export const predictions = pgTable(
  "predictions",
  {
    id: serial("id").primaryKey(),
    entrantId: integer("entrant_id")
      .notNull()
      .references(() => entrants.id),
    scope: text("scope").notNull(), // "MATCH" | "SLOT"
    matchId: integer("match_id").references(() => matches.id),
    bracketSlot: text("bracket_slot"),
    predHomeTeamId: integer("pred_home_team_id").references(() => teams.id),
    predAwayTeamId: integer("pred_away_team_id").references(() => teams.id),
    predHomeGoals: integer("pred_home_goals").notNull(),
    predAwayGoals: integer("pred_away_goals").notNull(),
  },
  (t) => ({
    uniqMatch: unique("uniq_pred_match").on(t.entrantId, t.matchId),
    uniqSlot: unique("uniq_pred_slot").on(t.entrantId, t.bracketSlot),
  }),
);

// Computed points, recomputed whenever a result changes. `kind` + `ref` key it:
//   kind "MATCH" ref "match:<id>", kind "SLOT" ref "slot:<bracketSlot>",
//   kind "PROGRESSION" ref "prog:<round>".
export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    entrantId: integer("entrant_id")
      .notNull()
      .references(() => entrants.id),
    kind: text("kind").notNull(),
    ref: text("ref").notNull(),
    points: integer("points").notNull().default(0),
    breakdown: jsonb("breakdown"),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    uniqScore: unique("uniq_score").on(t.entrantId, t.ref),
  }),
);

// Single-row tunable scoring config (falls back to DEFAULT_SCORING in code).
export const scoringConfig = pgTable("scoring_config", {
  id: integer("id").primaryKey().default(1),
  config: jsonb("config").notNull(),
});
