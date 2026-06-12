import { sql } from "./db/index.js";
import { getMatches } from "./espn.js";

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

// Pull goal scorers from the feed and recompute each tracked player's feed_goals.
// Per-match scorer counts are persisted so tournament totals survive once a match
// drops off the live scoreboard window. Safe to run on every poll.
export async function syncScorers(): Promise<void> {
  let matches: Awaited<ReturnType<typeof getMatches>>;
  try {
    matches = await getMatches();
  } catch {
    return; // feed unavailable — leave existing tallies in place
  }

  for (const m of matches) {
    if (m.state === "pre") continue;
    const goals = (m.events ?? []).filter((e) => e.type === "goal" && e.player);
    const perPlayer = new Map<string, { country: string; goals: number }>();
    for (const g of goals) {
      const country = g.team === "home" ? m.home : m.away;
      const cur = perPlayer.get(g.player!) ?? { country, goals: 0 };
      cur.goals++;
      perPlayer.set(g.player!, cur);
    }
    // Replace this match's scorers so VAR/corrections are reflected.
    await sql`delete from match_scorers where espn_match_id = ${m.id}`;
    for (const [player, info] of perPlayer) {
      await sql`
        insert into match_scorers (espn_match_id, player_name, country, goals)
        values (${m.id}, ${player}, ${info.country}, ${info.goals})
      `;
    }
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
