import "dotenv/config";
import { sql } from "./db/index.js";
import { recomputeAll } from "./score.js";

// Pick a group fixture a couple of days out (won't clash with today's real game).
const [m] = await sql`
  select m.id, m.home_team_id mh, m.away_team_id ma, ht.name home, at.name away
  from matches m join teams ht on ht.id = m.home_team_id join teams at on at.id = m.away_team_id
  where m.stage = 'GROUP' and m.kickoff_utc > now() + interval '1 day'
  order by m.kickoff_utc asc limit 1
`;
console.log(`Simulating: ${m.home} v ${m.away} (match ${m.id})`);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STEP = 35_000;

const steps: { hg: number; ag: number; status: string; label: string }[] = [
  { hg: 0, ag: 0, status: "IN_PLAY", label: "Kick-off (0-0)" },
  { hg: 1, ag: 0, status: "IN_PLAY", label: `GOAL - ${m.home} 1-0` },
  { hg: 1, ag: 1, status: "IN_PLAY", label: "1-1" },
  { hg: 2, ag: 1, status: "IN_PLAY", label: `${m.home} 2-1` },
  { hg: 2, ag: 1, status: "FINISHED", label: "FULL TIME (2-1)" },
];

for (const s of steps) {
  const winner = s.status === "FINISHED" ? (s.hg > s.ag ? m.mh : s.hg < s.ag ? m.ma : null) : null;
  await sql`
    update matches set status = ${s.status}, home_goals = ${s.hg}, away_goals = ${s.ag},
      winner_team_id = ${winner}, result_overridden = true
    where id = ${m.id}
  `;
  await recomputeAll();
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${s.label}`);
  await wait(STEP);
}

// reset to a clean scheduled fixture so real data flows normally later
await sql`
  update matches set status = 'SCHEDULED', home_goals = null, away_goals = null,
    winner_team_id = null, result_overridden = false
  where id = ${m.id}
`;
await recomputeAll();
console.log(`Reset ${m.home} v ${m.away} back to scheduled. Done.`);
await sql.end();
