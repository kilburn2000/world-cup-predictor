import { sql } from "./db/index.js";
import { getMatches, getMatchEvents, getMatchesForDate } from "./espn.js";
import { dbNameMap, resolveEspn } from "./sync.js";

// Finished matches whose events we've already captured — don't re-fetch their
// summary every poll. In-memory; on restart we re-capture once (cheap, bounded
// to the current scoreboard window), and persisted match_scorers keep totals.
const captured = new Set<string>();

// Key events per match (goals + cards with player/minute), aligned to the match's
// home/away. Persisted to match_events so they survive on each fixture's detail
// page (not just live), and read by the live feed + toasts.
export interface LiveEventRow {
  minute: number;
  type: "goal" | "yellow" | "red";
  team: "home" | "away";
  player?: string;
  own?: boolean;
}

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

type FeedEvent = { type: "goal" | "yellow" | "red"; minute: number; player?: string; country: string; own: boolean };

// Scoreboard goal/card events -> our stored shape (fallback when no summary).
function eventsFromScoreboard(m: { home: string; away: string; events?: { type: string; minute: number; player?: string; team: "home" | "away" }[] }): FeedEvent[] {
  return (m.events ?? [])
    .filter((e) => e.type === "goal" || e.type === "red")
    .map((e) => ({ type: e.type as FeedEvent["type"], minute: e.minute, player: e.player, country: e.team === "home" ? m.home : m.away, own: false }));
}

async function resolveDbMatch(home: string, away: string, byNorm: Map<string, number>) {
  const h = resolveEspn(home, byNorm);
  const a = resolveEspn(away, byNorm);
  if (!h || !a) return null;
  const [row] = await sql`
    select id, home_team_id from matches
    where (home_team_id = ${h} and away_team_id = ${a}) or (home_team_id = ${a} and away_team_id = ${h})
    limit 1
  `;
  return row ?? null;
}

// Store one match's key events (aligned to DB home/away) + its goal-scorer tally.
async function captureMatch(espnId: string, dbMatch: any, events: FeedEvent[], byNorm: Map<string, number>) {
  if (dbMatch) {
    await sql`delete from match_events where match_id = ${dbMatch.id}`;
    for (const e of events) {
      const tid = resolveEspn(e.country, byNorm);
      // the scorer's side; an own goal counts for the opposing team
      const scorerSide = tid === dbMatch.home_team_id ? "home" : "away";
      const side = e.own ? (scorerSide === "home" ? "away" : "home") : scorerSide;
      await sql`
        insert into match_events (match_id, minute, type, team, player, own)
        values (${dbMatch.id}, ${e.minute}, ${e.type}, ${side}, ${e.player ?? null}, ${e.own})
      `;
    }
  }
  const perPlayer = new Map<string, { country: string; goals: number }>();
  for (const e of events) {
    if (e.type !== "goal" || e.own || !e.player) continue;
    const cur = perPlayer.get(e.player) ?? { country: e.country, goals: 0 };
    cur.goals++;
    if (!cur.country && e.country) cur.country = e.country;
    perPlayer.set(e.player, cur);
  }
  await sql`delete from match_scorers where espn_match_id = ${espnId}`;
  for (const [player, info] of perPlayer) {
    await sql`insert into match_scorers (espn_match_id, player_name, country, goals) values (${espnId}, ${player}, ${info.country}, ${info.goals})`;
  }
}

// Recompute each tracked player's feed_goals from all captured match scorers.
async function recomputeFeedGoals() {
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

// Live feed: capture in-play + just-finished matches from the current scoreboard.
// Per-match counts are persisted so totals survive once a match drops off the
// window. Safe to run every poll.
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
    if (m.state === "post" && captured.has(m.id)) continue;
    let events: FeedEvent[] = [];
    try {
      events = await getMatchEvents(m.id);
    } catch {
      /* fall back */
    }
    if (!events.length) events = eventsFromScoreboard(m);
    const dbMatch = await resolveDbMatch(m.home, m.away, byNorm);
    await captureMatch(m.id, dbMatch, events, byNorm);
    if (m.state === "post") captured.add(m.id);
  }
  await recomputeFeedGoals();
}

const ymd = (s: string) => s.replace(/-/g, "");
function plusDays(yyyymmdd: string, delta: number): string {
  const y = +yyyymmdd.slice(0, 4), mo = +yyyymmdd.slice(4, 6), da = +yyyymmdd.slice(6, 8);
  return new Date(Date.UTC(y, mo - 1, da) + delta * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
}

// Backfill finished matches that have dropped off the live scoreboard: fetch each
// by date from ESPN, fill its key events + scorer tally. Idempotent (skips matches
// that already have events). Returns how many matches were filled.
export async function backfillScorers(): Promise<number> {
  const dbMatches = (await sql`
    select m.id, (m.kickoff_utc at time zone 'America/Los_Angeles')::date::text d,
           ht.name home, at.name away
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.status = 'FINISHED' and m.kickoff_utc is not null
  `) as any[];
  if (!dbMatches.length) return 0;
  const byNorm = await dbNameMap();

  // Fetch each finished match's date (± a day for tz drift) once, pool all games.
  const dates = new Set<string>();
  for (const m of dbMatches) {
    const base = ymd(m.d);
    dates.add(plusDays(base, -1));
    dates.add(base);
    dates.add(plusDays(base, 1));
  }
  const poolById = new Map<string, any>();
  for (const date of dates) {
    try {
      for (const e of await getMatchesForDate(date)) poolById.set(e.id, e);
    } catch {
      /* skip date */
    }
  }
  const pool = [...poolById.values()];

  let filled = 0;
  for (const dbm of dbMatches) {
    const [has] = await sql`select 1 from match_events where match_id = ${dbm.id} limit 1`;
    if (has) continue;
    const hId = resolveEspn(dbm.home, byNorm);
    const aId = resolveEspn(dbm.away, byNorm);
    const ev = pool.find((e) => {
      const eh = resolveEspn(e.home, byNorm), ea = resolveEspn(e.away, byNorm);
      return (eh === hId && ea === aId) || (eh === aId && ea === hId);
    });
    if (!ev || ev.state !== "post") continue;
    let events: FeedEvent[] = [];
    try {
      events = await getMatchEvents(ev.id);
    } catch {
      /* fall back */
    }
    if (!events.length) events = eventsFromScoreboard(ev);
    await captureMatch(ev.id, { id: dbm.id, home_team_id: hId }, events, byNorm);
    captured.add(ev.id);
    filled++;
  }
  await recomputeFeedGoals();
  return filled;
}

// Key events for a set of matches (for the live feed), keyed by match id.
export async function eventsForMatches(ids: number[]): Promise<Map<number, LiveEventRow[]>> {
  const map = new Map<number, LiveEventRow[]>();
  if (!ids.length) return map;
  const rows = await sql`
    select match_id, minute, type, team, player, own from match_events
    where match_id in ${sql(ids)} order by match_id, minute
  `;
  for (const r of rows as any[]) {
    const arr = map.get(r.match_id) ?? [];
    arr.push({ minute: r.minute, type: r.type, team: r.team, player: r.player ?? undefined, own: r.own ?? false });
    map.set(r.match_id, arr);
  }
  return map;
}

// Key events for one fixture (for its detail page).
export async function matchEvents(matchId: number): Promise<LiveEventRow[]> {
  const rows = await sql`select minute, type, team, player, own from match_events where match_id = ${matchId} order by minute`;
  return (rows as any[]).map((r) => ({ minute: r.minute, type: r.type, team: r.team, player: r.player ?? undefined, own: r.own ?? false }));
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
