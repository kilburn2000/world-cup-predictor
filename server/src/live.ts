import { sql } from "./db/index.js";
import { scoreGroupMatch } from "@wc/shared/scoring.js";
import { DEFAULT_SCORING, type ScoringConfig } from "@wc/shared/types.js";
import { fd, mapStage, mapGroup } from "./footballData.js";

/**
 * GET /api/live
 *
 * Returns matches that are currently IN_PLAY / PAUSED, each with the entrants'
 * predictions ranked by the points they'd win **if the match ended at the
 * current score**, computed with the live scoring config.
 *
 * NOTE ON DATA SOURCE
 * football-data.org's free tier exposes match status + score but NOT an in-play
 * minute or goal/card events. So `minute` comes back `null` and `events` is `[]`
 * unless you're on a paid plan (or you maintain them via an admin override).
 * The web UI degrades gracefully: it shows "LIVE", the score, and the board.
 */
export async function getLive() {
  const cfgRow = (await sql`select config from scoring_config where id = 1`) as { config: ScoringConfig }[];
  const cfg = cfgRow[0]?.config ?? DEFAULT_SCORING;

  // 1. find in-play / half-time / just-finished fixtures from the API
  const { matches: apiMatches } = await fd.matches();
  const RECENT_MS = 3 * 3600_000; // keep finished matches ~3h so "Full time" shows
  const liveApi = apiMatches.filter((m) => {
    if (m.status === "IN_PLAY" || m.status === "PAUSED") return true;
    if (m.status === "FINISHED") return Date.now() - new Date(m.utcDate).getTime() < RECENT_MS;
    return false;
  });
  if (!liveApi.length) return [];

  const out = [];
  for (const am of liveApi) {
    // 2. resolve our local match row + team metadata by api id
    const rows = (await sql`
      select m.id,
             ht.name as home, ht.tla as home_code,
             at.name as away, at.tla as away_code,
             m.stage, m.group_name
      from matches m
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      where m.api_match_id = ${am.id}
      limit 1
    `) as any[];
    const row = rows[0];
    if (!row) continue;

    const h = am.score.fullTime.home ?? 0;
    const a = am.score.fullTime.away ?? 0;

    // 3. every entrant's prediction for THIS fixture
    const preds = (await sql`
      select e.id as entrant_id, e.name,
             p.pred_home_goals as ph, p.pred_away_goals as pa
      from predictions p
      join entrants e on e.id = p.entrant_id
      where p.scope = 'MATCH' and p.match_id = ${row.id}
    `) as { entrant_id: number; name: string; ph: number; pa: number }[];

    // 4. score each at the current scoreline + rank
    const board = preds
      .map((p) => {
        const b = scoreGroupMatch(p.ph, p.pa, h, a, cfg);
        const tier = b.exact ? "exact" : b.goalDifference ? "diff" : b.outcome ? "result" : "miss";
        return { entrantId: p.entrant_id, name: p.name, pick: `${p.ph}-${p.pa}`, points: b.points, tier };
      })
      .sort((x, y) => y.points - x.points || x.name.localeCompare(y.name));

    out.push({
      id: row.id,
      home: row.home,
      away: row.away,
      homeCode: row.home_code,
      awayCode: row.away_code,
      stage: mapStage(row.stage) + (row.group_name ? ` · Group ${mapGroup("GROUP_" + row.group_name)}` : ""),
      status: am.status === "PAUSED" ? "PAUSED" : am.status === "FINISHED" ? "FINISHED" : "IN_PLAY",
      minute: (am as any).minute ?? null, // free tier has no clock; a paid feed exposes `minute`
      homeScore: h,
      awayScore: a,
      events: [] as unknown[], // paid feed / admin override populates goals + cards
      board,
    });
  }
  return out;
}
