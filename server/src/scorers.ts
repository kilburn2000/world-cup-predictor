import { sql } from "./db/index.js";
import { getMatches, getMatchEvents } from "./espn.js";
import { dbNameMap, resolveEspn } from "./sync.js";

// Finished matches whose events we've already captured — don't re-fetch their
// summary every poll. In-memory; on restart we re-capture once (cheap, bounded
// to the current scoreboard window), and persisted match_scorers keep totals.
const captured = new Set<string>();

// Live key events per DB match id (goals + cards with player/minute), aligned to
// the match's home/away. The live feed reads this; the toasts read it too.
export interface LiveEventRow {
  minute: number;
  type: "goal" | "yellow" | "red";
  team: "home" | "away";
  player?: string;
}
export const liveMatchEvents = new Map<number, LiveEventRow[]>();

// "Top Scorer" side competition: each entrant has a pair of players; their
// combined goal tally over the tournament decides a single prize. Goals come
// from the live feed (ESPN goal events carry the scorer's name) and can be
// overridden per player by an admin.

// Pick country code (POR/SPA/...) -> full country name as ESPN labels the team,
// used to disambiguate same-surname scorers.
const CODE_TO_COUNTRY: Record<string, string> = {
  POR: "Portugal", ENG: "England", NED: "Netherlands", BRA: "Brazil",
  ARG: "Argentina", SPA: "Spain", FRA: "France", COL: "Colombia",
  GER: "Germany", NOR: "Norway",
};

const normName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
// The significant token to match a tracked player on (their surname): the last
// token, ignoring Jr/Junior suffixes. Tracked surnames are all unique.
const keyToken = (tracked: string) =>
  normName(tracked).split(" ").filter((t) => !["jr", "junior", "jnr"].includes(t)).pop() ?? "";

// Pull each live match's key events from the feed: store them for the live feed
// (goals + cards with the scorer's name) AND tally goal scorers for the Top
// Scorer competition. Per-match scorer counts are persisted so tournament totals
// survive once a match drops off the scoreboard window. Safe to run every poll.
export async function syncScorers(): Promise<void> {
  let matches: Awaited<ReturnType<typeof getMatches>>;
  try {
    matches = await getMatches();
  } catch {
    return; // feed unavailable — leave existing tallies in place
  }
  const byNorm = await dbNameMap();

  for (const m of matches) {
    if (m.state === "pre") continue;
    if (m.state === "post" && captured.has(m.id)) continue; // already final

    // Full key events from the summary; fall back to the scoreboard goal events
    // (covers mock games and the brief window before the summary fills).
    let events: { type: "goal" | "yellow" | "red"; minute: number; player?: string; country: string; own: boolean }[] = [];
    try {
      events = await getMatchEvents(m.id);
    } catch {
      /* summary unavailable - fall back below */
    }
    if (!events.length) {
      events = (m.events ?? [])
        .filter((e) => e.type === "goal" || e.type === "yellow" || e.type === "red")
        .map((e) => ({ type: e.type as any, minute: e.minute, player: e.player, country: e.team === "home" ? m.home : m.away, own: false }));
    }

    // Resolve the DB match (by team pair) and store events aligned to its home/away.
    const h = resolveEspn(m.home, byNorm);
    const a = resolveEspn(m.away, byNorm);
    let dbMatch: any = null;
    if (h && a) {
      [dbMatch] = await sql`
        select id, home_team_id from matches
        where (home_team_id = ${h} and away_team_id = ${a}) or (home_team_id = ${a} and away_team_id = ${h})
        limit 1
      `;
    }
    if (dbMatch) {
      const rows: LiveEventRow[] = events.map((e) => {
        const tid = resolveEspn(e.country, byNorm);
        return { minute: e.minute, type: e.type, team: tid === dbMatch.home_team_id ? "home" : "away", player: e.player };
      });
      liveMatchEvents.set(dbMatch.id, rows);
    }

    // Tally goal scorers (own goals don't count for the player).
    const perPlayer = new Map<string, { country: string; goals: number }>();
    for (const e of events) {
      if (e.type !== "goal" || e.own || !e.player) continue;
      const cur = perPlayer.get(e.player) ?? { country: e.country, goals: 0 };
      cur.goals++;
      if (!cur.country && e.country) cur.country = e.country;
      perPlayer.set(e.player, cur);
    }
    await sql`delete from match_scorers where espn_match_id = ${m.id}`;
    for (const [player, info] of perPlayer) {
      await sql`
        insert into match_scorers (espn_match_id, player_name, country, goals)
        values (${m.id}, ${player}, ${info.country}, ${info.goals})
      `;
    }
    if (m.state === "post") captured.add(m.id);
  }

  const players = (await sql`select id, name, country from scorer_players`) as any[];
  const scorers = (await sql`select player_name, country, goals from match_scorers`) as any[];
  for (const p of players) {
    const key = keyToken(p.name);
    const wantCountry = CODE_TO_COUNTRY[p.country];
    let total = 0;
    for (const s of scorers) {
      if (!normName(s.player_name).split(" ").includes(key)) continue;
      if (wantCountry && s.country && s.country !== wantCountry) continue;
      total += s.goals;
    }
    await sql`update scorer_players set feed_goals = ${total} where id = ${p.id}`;
  }
}

// Each entrant's pair + combined goals (manual override wins over the feed),
// ranked. The whole field competes (no exclusions).
export async function topScorerStandings() {
  return await sql`
    select e.id as "entrantId", e.name, e.name_incomplete as "nameIncomplete",
           json_agg(json_build_object(
             'name', trim(coalesce(p.first_name || ' ', '') || p.name),
             'country', p.country,
             'goals', coalesce(p.manual_goals, p.feed_goals)
           ) order by p.name) as players,
           coalesce(sum(coalesce(p.manual_goals, p.feed_goals)), 0)::int as total
    from entrants e
    join scorer_picks sp on sp.entrant_id = e.id
    join scorer_players p on p.id = sp.player_id
    group by e.id, e.name, e.name_incomplete
    order by total desc, e.name
  `;
}
