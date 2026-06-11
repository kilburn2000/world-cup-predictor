import "dotenv/config";
import { writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sql } from "./db/index.js";
import { recomputeAll } from "./score.js";

const MOCK_PATH = join(homedir(), ".cache/wc-mock.json");
const STEP_MS = 5_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const [m] = await sql`
  select m.id, m.home_team_id mh, m.away_team_id ma, ht.name home, ht.tla htla, at.name away, at.tla atla
  from matches m join teams ht on ht.id = m.home_team_id join teams at on at.id = m.away_team_id
  where m.stage = 'GROUP' and m.kickoff_utc > now() + interval '1 day' order by m.kickoff_utc asc limit 1
`;
console.log(`Mock live: ${m.home} v ${m.away} (match ${m.id})`);

type Ev = { minute: number; type: "goal" | "yellow" | "red"; team: "home" | "away"; player: string };
const events: Ev[] = [];
const steps: { min: number; half: string; period: number; hg: number; ag: number; finished: boolean; events: Ev[]; label: string }[] = [];
const push = (s: Omit<(typeof steps)[number], "events">) => steps.push({ ...s, events: [...events] });

push({ min: 2, half: "First Half", period: 1, hg: 0, ag: 0, finished: false, label: "Kick-off (0-0)" });
events.push({ minute: 11, type: "yellow", team: "away", player: "Demirović" });
push({ min: 14, half: "First Half", period: 1, hg: 0, ag: 0, finished: false, label: "14' yellow (BIH)" });
events.push({ minute: 23, type: "goal", team: "home", player: "Davies" });
push({ min: 24, half: "First Half", period: 1, hg: 1, ag: 0, finished: false, label: "23' GOAL — Canada 1-0" });
push({ min: 45, half: "Halftime", period: 1, hg: 1, ag: 0, finished: false, label: "Half-time" });
events.push({ minute: 57, type: "goal", team: "away", player: "Džeko" });
push({ min: 58, half: "Second Half", period: 2, hg: 1, ag: 1, finished: false, label: "57' GOAL — Bosnia 1-1" });
events.push({ minute: 70, type: "goal", team: "home", player: "David" });
push({ min: 71, half: "Second Half", period: 2, hg: 2, ag: 1, finished: false, label: "70' GOAL — Canada 2-1" });
events.push({ minute: 79, type: "yellow", team: "home", player: "Eustáquio" });
events.push({ minute: 82, type: "red", team: "away", player: "Barišić" });
push({ min: 84, half: "Second Half", period: 2, hg: 2, ag: 1, finished: false, label: "82' RED card (BIH)" });
push({ min: 90, half: "Full Time", period: 2, hg: 2, ag: 1, finished: true, label: "FULL TIME 2-1" });

for (const s of steps) {
  const winner = s.finished ? (s.hg > s.ag ? m.mh : m.ma) : null;
  await sql`
    update matches set status = ${s.finished ? "FINISHED" : "IN_PLAY"}, home_goals = ${s.hg}, away_goals = ${s.ag},
      winner_team_id = ${winner}, result_overridden = true
    where id = ${m.id}
  `;
  await recomputeAll();
  const mockMatch = {
    id: `mock-${m.id}`,
    date: new Date().toISOString(),
    home: m.home, away: m.away, homeAbbr: m.htla, awayAbbr: m.atla,
    homeScore: s.hg, awayScore: s.ag,
    state: s.finished ? "post" : "in",
    completed: s.finished,
    minute: s.finished ? null : s.min,
    period: s.period,
    half: s.half,
    winner: s.finished ? "home" : null,
    events: s.events,
  };
  writeFileSync(MOCK_PATH, JSON.stringify([mockMatch]));
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${s.label}`);
  await wait(STEP_MS);
}

// hold full-time briefly, then clean up
await wait(STEP_MS);
rmSync(MOCK_PATH, { force: true });
await sql`
  update matches set status = 'SCHEDULED', home_goals = null, away_goals = null,
    winner_team_id = null, result_overridden = false
  where id = ${m.id}
`;
await recomputeAll();
console.log("Cleaned up — match reset, mock feed removed.");
await sql.end();
