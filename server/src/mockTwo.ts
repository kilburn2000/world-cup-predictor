import "dotenv/config";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sql } from "./db/index.js";
import { recomputeAll } from "./score.js";

const MOCK_PATH = join(homedir(), ".cache/wc-mock.json");
const STATE_PATH = join(homedir(), ".cache/wc-mock-two.json"); // picked ids + original kickoffs
const mode = process.argv[2]; // "up" | "down"

if (mode === "down") {
  let state: { id: number; kickoff: string }[] = [];
  try { state = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch { /* nothing to undo */ }
  rmSync(MOCK_PATH, { force: true });
  for (const s of state) {
    await sql`update matches set status='SCHEDULED', home_goals=null, away_goals=null,
      winner_team_id=null, result_overridden=false, kickoff_utc=${s.kickoff} where id=${s.id}`;
  }
  // the scorer backfill captures the mock feed's events into match_events - drop them
  await sql`delete from match_events where player ilike '%simul%'`;
  rmSync(STATE_PATH, { force: true });
  await recomputeAll();
  console.log(`Reset ${state.length} game(s) and removed the mock feed.`);
  await sql.end();
} else {
  // Two upcoming scheduled group games in different WC groups.
  const rows = (await sql`
    select m.id, m.group_name grp, m.kickoff_utc, m.home_team_id mh, m.away_team_id ma,
           ht.name home, ht.tla htla, at.name away, at.tla atla
    from matches m join teams ht on ht.id=m.home_team_id join teams at on at.id=m.away_team_id
    where m.stage='GROUP' and m.status='SCHEDULED'
    order by m.kickoff_utc asc`) as any[];
  const two: any[] = [];
  const seen = new Set<string>();
  for (const r of rows) { if (seen.has(r.grp)) continue; seen.add(r.grp); two.push(r); if (two.length === 2) break; }

  // Two distinct live states: one first-half 1-0, one second-half 2-2.
  const states = [
    { hg: 1, ag: 0, min: 34, half: "First Half", period: 1, events: [{ minute: 21, type: "goal", team: "home", player: "Simulated" }] },
    { hg: 2, ag: 2, min: 67, half: "Second Half", period: 2, events: [
      { minute: 12, type: "goal", team: "home", player: "Simulated" },
      { minute: 39, type: "goal", team: "away", player: "Simulated" },
      { minute: 51, type: "goal", team: "home", player: "Simulated" },
      { minute: 63, type: "goal", team: "away", player: "Simulated" },
    ] },
  ];
  const mock: any[] = [];
  const state: { id: number; kickoff: string }[] = [];
  for (let i = 0; i < two.length; i++) {
    const m = two[i];
    const s = states[i];
    state.push({ id: m.id, kickoff: new Date(m.kickoff_utc).toISOString() });
    // kickoff = now so the game counts as "today" in the day-scoped live feed too.
    await sql`update matches set status='IN_PLAY', home_goals=${s.hg}, away_goals=${s.ag},
      winner_team_id=null, result_overridden=true, kickoff_utc=now() where id=${m.id}`;
    mock.push({
      id: `mock-${m.id}`, date: new Date().toISOString(),
      home: m.home, away: m.away, homeAbbr: m.htla, awayAbbr: m.atla,
      homeScore: s.hg, awayScore: s.ag, state: "in", completed: false,
      minute: s.min, period: s.period, half: s.half, winner: null, events: s.events,
    });
  }
  writeFileSync(STATE_PATH, JSON.stringify(state));
  writeFileSync(MOCK_PATH, JSON.stringify(mock));
  await recomputeAll();
  console.log("Live now:", two.map((m, i) => `${m.home} ${states[i].hg}-${states[i].ag} ${m.away} (Group ${m.grp})`).join("  |  "));
  await sql.end();
}
