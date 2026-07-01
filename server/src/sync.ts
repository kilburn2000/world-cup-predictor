import { sql } from "./db/index.js";
import { fd, mapStage, mapStatus, mapGroup, type FdMatch } from "./footballData.js";
import { getMatches } from "./espn.js";

// ESPN team name -> our DB (football-data) name, for the few that differ.
export const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z]/g, "");
export const ESPN_ALIAS: Record<string, string> = {
  [norm("DR Congo")]: norm("Congo DR"),
  [norm("Côte d'Ivoire")]: norm("Ivory Coast"),
  [norm("USA")]: norm("United States"),
  [norm("Korea Republic")]: norm("South Korea"),
  [norm("Turkey")]: norm("Türkiye"),
  [norm("Bosnia and Herzegovina")]: norm("Bosnia"),
  [norm("Bosnia & Herzegovina")]: norm("Bosnia"),
  [norm("Bosnia-Herzegovina")]: norm("Bosnia"),
};

export async function dbNameMap(): Promise<Map<string, number>> {
  const rows = await sql`select id, name from teams`;
  return new Map(rows.map((r: any) => [norm(r.name), r.id]));
}

export const resolveEspn = (name: string, byNorm: Map<string, number>) =>
  byNorm.get(ESPN_ALIAS[norm(name)] ?? norm(name)) ?? null;

// Goal events synthesised from score changes - ESPN's free feed gives us the
// score but no event log, so we infer a goal whenever a side's tally rises.
// Keyed by DB match id, aligned to the DB match's home/away. In-memory (rebuilt
// from the score on restart). No scorer names or cards - that data isn't in the feed.
export type SynthEvent = { minute: number; type: "goal"; team: "home" | "away" };
export const liveEvents = new Map<number, SynthEvent[]>();

function reconcileGoals(matchId: number, side: "home" | "away", target: number, minute: number) {
  const list = liveEvents.get(matchId) ?? [];
  const current = list.filter((e) => e.team === side).length;
  if (current < target) {
    for (let i = current; i < target; i++) list.push({ minute, type: "goal", team: side });
  } else if (current > target) {
    let remove = current - target; // VAR/correction - drop the most recent of that side
    for (let i = list.length - 1; i >= 0 && remove > 0; i--) {
      if (list[i].team === side) { list.splice(i, 1); remove--; }
    }
  }
  liveEvents.set(matchId, list);
}

// Pull live scores from ESPN and update matched fixtures. Returns how many
// matches changed (so the poller only re-scores when something moved).
export async function syncFromEspn(): Promise<number> {
  const matches = await getMatches();
  const byNorm = await dbNameMap();
  let changed = 0;

  for (const m of matches) {
    const homeId = resolveEspn(m.home, byNorm);
    const awayId = resolveEspn(m.away, byNorm);
    if (!homeId || !awayId) {
      console.warn(`[espn] unmatched teams: "${m.home}" v "${m.away}"`);
      continue;
    }
    const [dbm] = await sql`
      select id, stage, home_team_id, away_team_id, home_goals, away_goals, status, winner_team_id, result_overridden
      from matches
      where (home_team_id = ${homeId} and away_team_id = ${awayId})
         or (home_team_id = ${awayId} and away_team_id = ${homeId})
      limit 1
    `;
    if (!dbm || dbm.result_overridden) continue;
    const locked = dbm.status === "FINISHED" && dbm.home_goals !== null;
    // A finished knockout tie that's level can still gain a shootout winner after
    // its score has locked - keep capturing that even when otherwise locked.
    const needsWinner = locked && dbm.stage !== "GROUP" && dbm.home_goals === dbm.away_goals && dbm.winner_team_id == null;
    if (needsWinner) {
      if (m.winner) {
        await sql`update matches set winner_team_id = ${m.winner === "home" ? homeId : awayId} where id = ${dbm.id}`;
        changed++;
      }
      continue;
    }
    // Otherwise lock a match once it's done WITH a recorded score - the result won't
    // change. A FINISHED row with null goals is bad data (e.g. clobbered), so we
    // still allow ESPN to correct it.
    if (locked) continue;

    const status = m.completed || m.state === "post" ? "FINISHED" : m.state === "in" ? "IN_PLAY" : "SCHEDULED";
    const playing = status === "IN_PLAY" || status === "FINISHED";
    // leave goals null until a match is actually in play (ESPN reports 0-0 for pre-match)
    const hg = playing ? (dbm.home_team_id === homeId ? m.homeScore : m.awayScore) : null;
    const ag = playing ? (dbm.home_team_id === homeId ? m.awayScore : m.homeScore) : null;
    let winnerId: number | null = null;
    if (status === "FINISHED") {
      if (m.winner) winnerId = m.winner === "home" ? homeId : awayId;
      else winnerId = hg > ag ? dbm.home_team_id : hg < ag ? dbm.away_team_id : null;
    }

    // keep the synthesised goal log in step with the score (handles both new
    // goals and the initial backfill when the server starts mid-match)
    if (playing) {
      reconcileGoals(dbm.id, "home", hg ?? 0, m.minute ?? 0);
      reconcileGoals(dbm.id, "away", ag ?? 0, m.minute ?? 0);
    }

    if (dbm.status !== status || dbm.home_goals !== hg || dbm.away_goals !== ag) {
      await sql`
        update matches set status = ${status}, home_goals = ${hg}, away_goals = ${ag}, winner_team_id = ${winnerId}
        where id = ${dbm.id}
      `;
      changed++;
    }
  }
  return changed;
}

// Upsert teams from the competition squad list. Returns apiTeamId -> local id.
export async function syncTeams(): Promise<Map<number, number>> {
  const { teams } = await fd.teams();
  for (const t of teams) {
    await sql`
      insert into teams (api_team_id, name, short_name, tla, crest_url)
      values (${t.id}, ${t.name}, ${t.shortName ?? null}, ${t.tla ?? null}, ${t.crest ?? null})
      on conflict (api_team_id) do update
        set name = excluded.name, short_name = excluded.short_name,
            tla = excluded.tla, crest_url = excluded.crest_url
    `;
  }
  return teamIdMap();
}

async function teamIdMap(): Promise<Map<number, number>> {
  const rows = await sql`select id, api_team_id from teams where api_team_id is not null`;
  return new Map(rows.map((r: any) => [r.api_team_id, r.id]));
}

// Upsert all matches (fixtures + live/finished results). For group games it also
// stamps each team's group. Returns the number of matches whose result changed.
export async function syncMatches(): Promise<number> {
  const { matches } = await fd.matches();
  const idMap = await teamIdMap();
  let changed = 0;

  for (const m of matches as FdMatch[]) {
    const stage = mapStage(m.stage);
    const group = mapGroup(m.group);
    const homeId = m.homeTeam.id ? idMap.get(m.homeTeam.id) ?? null : null;
    const awayId = m.awayTeam.id ? idMap.get(m.awayTeam.id) ?? null : null;
    const status = mapStatus(m.status);
    const hg = m.score.fullTime.home;
    const ag = m.score.fullTime.away;
    const ph = m.score.penalties?.home ?? null;
    const pa = m.score.penalties?.away ?? null;
    const winnerId =
      m.score.winner === "HOME_TEAM" ? homeId : m.score.winner === "AWAY_TEAM" ? awayId : null;

    const before = await sql`select home_goals, away_goals, status, result_overridden from matches where api_match_id = ${m.id}`;
    const overridden = before[0]?.result_overridden === true;

    // Don't let the API stomp a manual admin override.
    if (!overridden) {
      await sql`
        insert into matches (api_match_id, stage, group_name, matchday, home_team_id, away_team_id,
                             kickoff_utc, status, home_goals, away_goals, home_penalties, away_penalties, winner_team_id)
        values (${m.id}, ${stage}, ${group}, ${m.matchday ?? null}, ${homeId}, ${awayId},
                ${m.utcDate}, ${status}, ${hg}, ${ag}, ${ph}, ${pa}, ${winnerId})
        on conflict (api_match_id) do update
          set stage = excluded.stage, group_name = excluded.group_name, matchday = excluded.matchday,
              home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id,
              kickoff_utc = excluded.kickoff_utc, status = excluded.status,
              home_goals = excluded.home_goals, away_goals = excluded.away_goals,
              home_penalties = excluded.home_penalties, away_penalties = excluded.away_penalties,
              winner_team_id = excluded.winner_team_id
      `;
      const b = before[0];
      if (!b || b.status !== status || b.home_goals !== hg || b.away_goals !== ag) changed++;
    }

    // Stamp group on the two teams (group endpoint doesn't include it).
    if (group && homeId) await sql`update teams set group_name = ${group} where id = ${homeId}`;
    if (group && awayId) await sql`update teams set group_name = ${group} where id = ${awayId}`;
  }
  return changed;
}
