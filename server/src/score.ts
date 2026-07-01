import { sql } from "./db/index.js";
import {
  DEFAULT_SCORING,
  scoreGroupMatch,
  type ScoringConfig,
} from "@wc/shared";
import { resolveBracket, entrantSlotMap, teamsByGroup } from "./wc.js";

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

  // Derive the after-90-minutes score for finished knockout ties: the final score
  // minus any goals scored in extra time (minute > 90). Knockouts are scored on the
  // 90-minute result; the stored home_goals/away_goals remain the final score.
  await sql`
    update matches m set
      home_goals_90 = m.home_goals - coalesce((select count(*) from match_events e
        where e.match_id = m.id and e.type = 'goal' and e.team = 'home' and e.minute > 90), 0),
      away_goals_90 = m.away_goals - coalesce((select count(*) from match_events e
        where e.match_id = m.id and e.type = 'goal' and e.team = 'away' and e.minute > 90), 0)
    where m.stage <> 'GROUP' and m.status = 'FINISHED' and m.home_goals is not null
  `;

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

  // --- KNOCKOUTS: per-entrant positional scoring ---
  // Per tie (on the 90-minute result):
  //   +knockoutTeam for each team in the correct position (home/away pick == actual).
  //   + the scoreline points from scoreGroupMatch (RES / RES(D) for a called draw /
  //     each team's goal tally / exact bonus), applied whatever the teams were.
  // Max 7 a tie (2 positions + 5 scoreline). Each prediction is tied to its fixture
  // PER ENTRANT (entrantSlotMap), since slot labels don't line up with the fixtures.
  // Score on the 90-minute result (coalesce to the final score for ties that never
  // went to extra time, where the two are the same).
  const koFixtures = await sql`
    select id, home_team_id, away_team_id,
           coalesce(home_goals_90, home_goals) home_goals,
           coalesce(away_goals_90, away_goals) away_goals, status
    from matches where stage <> 'GROUP'
  `;
  const fixByMatch = new Map<number, any>((koFixtures as any[]).map((f) => [f.id, f]));
  const teams = await teamsByGroup();
  const koEntrants = await sql`select distinct entrant_id eid from predictions where scope = 'SLOT'`;
  for (const { eid } of koEntrants as any[]) {
    const slotMap = await entrantSlotMap(eid, teams);
    const preds = await sql`
      select bracket_slot slot, pred_home_team_id ph, pred_away_team_id pa, pred_home_goals phg, pred_away_goals pag
      from predictions where scope = 'SLOT' and entrant_id = ${eid}
    `;
    // Best score per fixture: an inconsistent bracket can point two ties at one
    // fixture (a collision); keep the higher-scoring one rather than double-count.
    const best = new Map<number, { points: number; breakdown: any }>();
    for (const p of preds as any[]) {
      const matchNo = slotMap.get(p.slot);
      if (matchNo == null) continue;
      const m = fixByMatch.get(matchNo);
      if (!m || m.home_team_id == null || m.away_team_id == null) continue; // tie not drawn yet
      const resolved = m.status === "FINISHED" && m.home_goals != null && m.away_goals != null;
      const homeTeam = p.ph === m.home_team_id;
      const awayTeam = p.pa === m.away_team_id;
      const sl = resolved ? scoreGroupMatch(p.phg, p.pag, m.home_goals, m.away_goals, cfg) : null;
      const points = (homeTeam ? cfg.knockoutTeam : 0) + (awayTeam ? cfg.knockoutTeam : 0) + (sl ? sl.points : 0);
      const prev = best.get(matchNo);
      if (!prev || points > prev.points) best.set(matchNo, { points, breakdown: { homeTeam, awayTeam, scoreline: sl } });
    }
    for (const [matchNo, b] of best) {
      await upsertScore(eid, "KNOCKOUT", `match:${matchNo}`, b.points, b.breakdown);
      written++;
    }
  }

  return written;
}
