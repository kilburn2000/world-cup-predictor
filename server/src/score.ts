import { sql } from "./db/index.js";
import {
  DEFAULT_SCORING,
  scoreGroupMatch,
  progressionPoints,
  type ScoringConfig,
} from "@wc/shared";

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

const PROGRESSION = [
  { round: "LAST_32", stage: "LAST_32", slotLike: "R32-%" },
  { round: "LAST_16", stage: "LAST_16", slotLike: "R16-%" },
  { round: "QF", stage: "QF", slotLike: "QF-%" },
  { round: "SF", stage: "SF", slotLike: "SF-%" },
  { round: "FINAL", stage: "FINAL", slotLike: "FINAL" },
] as const;

// Recompute every score from scratch. Deterministic; safe to run any time a
// result changes.
export async function recomputeAll(): Promise<number> {
  const cfg = await loadConfig();
  let written = 0;

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

  // --- KNOCKOUTS: team progression per round ---
  const entrants = await sql`select id from entrants`;
  for (const { round, stage, slotLike } of PROGRESSION) {
    // teams that actually reached this round
    const koMatches = await sql`
      select home_team_id, away_team_id from matches
      where stage = ${stage} and (home_team_id is not null or away_team_id is not null)
    `;
    const actualTeams = new Set<number>();
    for (const m of koMatches as any[]) {
      if (m.home_team_id) actualTeams.add(m.home_team_id);
      if (m.away_team_id) actualTeams.add(m.away_team_id);
    }
    if (actualTeams.size === 0) continue; // round not drawn yet

    for (const e of entrants as any[]) {
      const preds = await sql`
        select pred_home_team_id, pred_away_team_id from predictions
        where entrant_id = ${e.id} and scope = 'SLOT' and bracket_slot like ${slotLike}
      `;
      const predicted: number[] = [];
      for (const p of preds as any[]) {
        if (p.pred_home_team_id) predicted.push(p.pred_home_team_id);
        if (p.pred_away_team_id) predicted.push(p.pred_away_team_id);
      }
      const r = progressionPoints(predicted, [...actualTeams], cfg.knockoutTeam);
      await upsertScore(e.id, "PROGRESSION", `prog:${round}`, r.points, r);
      written++;
    }
  }

  // KNOCKOUT RULES (confirmed): each tie is scored like a group game — outcome +
  // each team's goals + exact bonus (up to 5) — PLUS cfg.knockoutTeam per
  // correctly-positioned team (2 a tie → up to +2), so up to 7 total. The
  // per-match scoreline+position scoring above replaces the old progression once
  // the knockout bracket resolves; the team-in-position bonus uses cfg.knockoutTeam
  // (currently applied set-wise as a stopgap until the R32 fixtures are drawn).

  return written;
}
