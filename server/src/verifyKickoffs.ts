import "dotenv/config";
import { sql } from "./db/index.js";
import { fd, mapStage } from "./footballData.js";

// READ-ONLY. Compares every stored kickoff_utc against football-data.org's
// utcDate, matching by TEAM PAIR + STAGE (order-independent) rather than
// api_match_id - knockout rows' api_match_id linkage is unreliable, so the id
// join reports the wrong "truth" for them. This mirrors the kickoff_restore_v1
// migration exactly, so it doubles as its dry-run. Flags result_overridden rows.
// Writes nothing.
//
//   cd server && npx tsx src/verifyKickoffs.ts
//   # against prod: DATABASE_URL="<render external url>" npx tsx src/verifyKickoffs.ts

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

async function main() {
  const { matches: feed } = await fd.matches();
  const teamMap = new Map(
    ((await sql`select id, api_team_id from teams where api_team_id is not null`) as any[])
      .map((r) => [r.api_team_id as number, r.id as number]),
  );

  let checked = 0;
  let mismatched = 0;
  let lockedMismatch = 0;
  const lines: string[] = [];

  for (const fm of feed as any[]) {
    const hid = fm.homeTeam?.id ? teamMap.get(fm.homeTeam.id) : null;
    const aid = fm.awayTeam?.id ? teamMap.get(fm.awayTeam.id) : null;
    if (!hid || !aid || !fm.utcDate) continue; // teams not yet known / no time
    const stage = mapStage(fm.stage);
    const rows = (await sql`
      select m.id, m.kickoff_utc ko, m.result_overridden ovr, m.status, ht.tla hc, at.tla ac
      from matches m
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      where m.stage = ${stage}
        and ((m.home_team_id = ${hid} and m.away_team_id = ${aid})
          or (m.home_team_id = ${aid} and m.away_team_id = ${hid}))
    `) as any[];
    for (const r of rows) {
      checked++;
      if (iso(r.ko) === iso(fm.utcDate)) continue;
      mismatched++;
      if (r.ovr) lockedMismatch++;
      lines.push(
        `${String(r.hc).padEnd(3)} v ${String(r.ac).padEnd(3)}  ${String(stage).padEnd(8)} ${String(r.status).padEnd(9)}  ` +
        `stored ${iso(r.ko) ?? "NULL"}  ->  real ${iso(fm.utcDate)}` + (r.ovr ? "  [result_overridden]" : ""),
      );
    }
  }

  console.log(`checked=${checked}  mismatched=${mismatched}  (result_overridden among them=${lockedMismatch})`);
  if (lines.length) console.log("\nMismatches:\n" + lines.sort().join("\n"));
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
