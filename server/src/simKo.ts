import "dotenv/config";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sql } from "./db/index.js";
import { recomputeAll } from "./score.js";

// Local-only knockout simulator: drive the next scheduled knockout tie live so we
// can eyeball the standings live column (scores + chips + points) against real
// predictions, then put it back. NEVER run against prod.
//   npx tsx src/simKo.ts up <homeGoals> <awayGoals> [minute]
//   npx tsx src/simKo.ts down
const MOCK_PATH = join(homedir(), ".cache/wc-mock.json");
const STATE_PATH = join(homedir(), ".cache/wc-sim-ko.json");
const mode = process.argv[2]; // "up" | "down"

// Undo a prior sim: restore the match to SCHEDULED with its original kickoff and
// drop the mock feed. Returns the id it reset (or null).
async function undo(): Promise<number | null> {
  let state: { id: number; kickoff: string } | null = null;
  try { state = JSON.parse(readFileSync(STATE_PATH, "utf8")); } catch { /* nothing to undo */ }
  rmSync(MOCK_PATH, { force: true });
  if (state) {
    await sql`update matches set status='SCHEDULED', home_goals=null, away_goals=null,
      home_goals_90=null, away_goals_90=null, winner_team_id=null, result_overridden=false,
      kickoff_utc=${state.kickoff} where id=${state.id}`;
  }
  await sql`delete from match_events where player ilike '%simul%'`;
  rmSync(STATE_PATH, { force: true });
  return state?.id ?? null;
}

if (mode === "down") {
  const id = await undo();
  await recomputeAll();
  console.log(id ? `Reset match ${id} back to scheduled and removed the mock feed.` : "Nothing to reset.");
  await sql.end();
} else {
  // Re-running `up` re-sims the SAME next match rather than stacking a second one.
  await undo();
  const hg = Number(process.argv[3] ?? 1);
  const ag = Number(process.argv[4] ?? 0);
  const minute = Number(process.argv[5] ?? 35);

  // The next scheduled knockout tie whose teams are already drawn.
  const [m] = (await sql`
    select m.id, m.kickoff_utc, m.home_team_id mh, m.away_team_id ma, m.bracket_slot slot,
           ht.name home, ht.tla htla, at.name away, at.tla atla
    from matches m
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.stage <> 'GROUP' and m.status = 'SCHEDULED'
    order by m.kickoff_utc asc nulls last, m.id
    limit 1`) as any[];
  if (!m) { console.log("No scheduled knockout tie with drawn teams found."); await sql.end(); process.exit(0); }

  writeFileSync(STATE_PATH, JSON.stringify({ id: m.id, kickoff: new Date(m.kickoff_utc).toISOString() }));

  // kickoff = now so it lands on today's football day in the day-scoped live feed.
  await sql`update matches set status='IN_PLAY', home_goals=${hg}, away_goals=${ag},
    winner_team_id=null, result_overridden=true, kickoff_utc=now() where id=${m.id}`;

  const events: any[] = [];
  for (let i = 0; i < hg; i++) events.push({ minute: 10 + i * 7, type: "goal", team: "home", player: "Simulated" });
  for (let i = 0; i < ag; i++) events.push({ minute: 14 + i * 7, type: "goal", team: "away", player: "Simulated" });
  const mock = [{
    id: `mock-${m.id}`, date: new Date().toISOString(),
    home: m.home, away: m.away, homeAbbr: m.htla, awayAbbr: m.atla,
    homeScore: hg, awayScore: ag, state: "in", completed: false,
    minute, period: minute > 45 ? 2 : 1, half: minute > 45 ? "Second Half" : "First Half",
    winner: null, events,
  }];
  writeFileSync(MOCK_PATH, JSON.stringify(mock));

  await recomputeAll();

  // Show the resulting live board so we can sanity-check points vs the score.
  const board = (await sql`
    select e.name, s.points, s.breakdown
    from scores s join entrants e on e.id = s.entrant_id
    where s.kind = 'KNOCKOUT' and s.ref = ${'match:' + m.id}
    order by s.points desc, e.name`) as any[];
  console.log(`LIVE (local): ${m.home} ${hg}-${ag} ${m.away}  [${m.slot}, match ${m.id}, ${minute}']`);
  console.log(`${board.length} entrants scored on this tie. Top rows:`);
  for (const b of board.slice(0, 8)) {
    const bd = b.breakdown ?? {};
    console.log(`  ${b.points}  ${b.name}  (home ${bd.homeTeam ? "✓" : "·"} away ${bd.awayTeam ? "✓" : "·"} scoreline ${bd.scoreline?.points ?? 0})`);
  }
  console.log("\nView it at http://localhost:5180/ (standings live column). Reset with:  npx tsx src/simKo.ts down");
  await sql.end();
}
