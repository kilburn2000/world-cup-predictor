import { sql } from "./db/index.js";
import {
  DEFAULT_SCORING,
  scoreGroupMatch,
  type ScoringConfig,
} from "@wc/shared";
import { resolveBracket } from "./wc.js";

export async function loadConfig(): Promise<ScoringConfig> {
  try {
    const [row] = await sql`select config from scoring_config where id = 1`;
    return { ...DEFAULT_SCORING, ...(row?.config as ScoringConfig) };
  } catch {
    return DEFAULT_SCORING;
  }
}

async function upsertScore(entrantId: number, kind: string, ref: string, points: number, breakdown: unknown) {
  await sql`
    insert into scores (entrant_id, kind, ref, points, breakdown, computed_at)
    values (${entrantId}, ${kind}, ${ref}, ${points}, ${JSON.stringify(breakdown)}::jsonb, now())
    on conflict (entrant_id, ref)
    do update set points = excluded.points, breakdown = excluded.breakdown, computed_at = now()
  `;
}

// Recompute every score from scratch. Deterministic; safe to run any time a
// result changes.
export async function recomputeAll(): Promise<number> {
  const cfg = await loadConfig();
  let written = 0;

  // Resolve the knockout bracket first (assign slots, draw actual teams into
  // ties as group + knockout results land) so the scoring below sees fresh teams.
  await resolveBracket();

  // Full recompute: clear all scores first so stale rows (e.g. a result that was
  // reverted) don't linger.
  await sql`delete from scores`;

  // --- GROUP stage: per-match additive scoring ---
  const finishedGroup = await sql`
    select id, home_team_id, away_team_id, home_goals, away_goals
    from matches
    where stage = 'GROUP' and status = 'FINISHED'
      and home_goals is not null and away_goals is not null
  `;
  const byMatch = new Map<number, any>(finishedGroup.map((m: any) => [m.id, m]));

  const groupPreds = await sql`
    select entrant_id, match_id, pred_home_team_id, pred_home_goals, pred_away_goals
    from predictions where scope = 'MATCH' and match_id is not null
  `;
  for (const p of groupPreds as any[]) {
    const m = byMatch.get(p.match_id);
    if (!m) continue;
    // align the prediction to the fixture's home/away
    const predH = p.pred_home_team_id === m.home_team_id ? p.pred_home_goals : p.pred_away_goals;
    const predA = p.pred_home_team_id === m.home_team_id ? p.pred_away_goals : p.pred_home_goals;
    const b = scoreGroupMatch(predH, predA, m.home_goals, m.away_goals, cfg);
    await upsertScore(p.entrant_id, "MATCH", `match:${p.match_id}`, b.points, b);
    written++;
  }

  // --- KNOCKOUTS: slot-positional scoring ---
  // A knockout prediction only scores when the entrant put the right team in the
  // right bracket slot AND on the right side of it. Per tie:
  //   +knockoutTeam   for each correctly-positioned team (home pick == actual
  //                   home team, and/or away pick == actual away team)
  //   +scoreline      ONLY when BOTH teams are correctly positioned (an exact
  //                   matchup in the right slot) - then the goals/result/exact
  //                   bonus apply, aligned by side, up to +5.
  // So the max is 7 a tie. If group placings swap a team into a different slot,
  // it earns nothing here even if the same two teams meet via another route -
  // the slot (and side) is what's being predicted, not just the fixture.
  //
  // Team-in-position points land as soon as the tie is drawn (teams resolved);
  // the scoreline is added once the tie finishes. The actual fixture's home/away
  // ordering must follow the same bracket template the entrants predicted against
  // (winner-side vs runner-up-side), which is how the import + draw are built.
  const koFixtures = await sql`
    select id, bracket_slot, home_team_id, away_team_id, home_goals, away_goals, status
    from matches
    where stage <> 'GROUP' and bracket_slot is not null
      and home_team_id is not null and away_team_id is not null
  `;
  for (const m of koFixtures as any[]) {
    const resolved = m.status === "FINISHED" && m.home_goals != null && m.away_goals != null;
    const preds = await sql`
      select entrant_id, pred_home_team_id, pred_away_team_id, pred_home_goals, pred_away_goals
      from predictions where scope = 'SLOT' and bracket_slot = ${m.bracket_slot}
    `;
    for (const p of preds as any[]) {
      const homeTeam = p.pred_home_team_id === m.home_team_id;
      const awayTeam = p.pred_away_team_id === m.away_team_id;
      let points = (homeTeam ? cfg.knockoutTeam : 0) + (awayTeam ? cfg.knockoutTeam : 0);
      const breakdown: any = { homeTeam, awayTeam, scoreline: null };
      // Scoreline only when the exact matchup is correctly positioned.
      if (homeTeam && awayTeam && resolved) {
        const b = scoreGroupMatch(p.pred_home_goals, p.pred_away_goals, m.home_goals, m.away_goals, cfg);
        points += b.points;
        breakdown.scoreline = b;
      }
      await upsertScore(p.entrant_id, "KNOCKOUT", `match:${m.id}`, points, breakdown);
      written++;
    }
  }

  return written;
}
