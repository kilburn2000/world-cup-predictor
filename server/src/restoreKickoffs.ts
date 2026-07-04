import "dotenv/config";
import { sql } from "./db/index.js";
import { fd, mapStage } from "./footballData.js";

// Corrects kickoff_utc against football-data, matched by TEAM PAIR + STAGE (the
// knockout api_match_id linkage is unreliable). Kickoff ONLY - scores and
// result_overridden are left untouched. Standalone twin of the kickoff_restore_v1
// boot-migration, for applying the fix directly (no deploy/restart). Prints every
// row it changes. Targets whatever DATABASE_URL points to.
async function main() {
  const { matches: feed } = await fd.matches();
  const teamMap = new Map(
    ((await sql`select id, api_team_id from teams where api_team_id is not null`) as any[])
      .map((r) => [r.api_team_id as number, r.id as number]),
  );
  const changed: string[] = [];
  for (const fm of feed as any[]) {
    const hid = fm.homeTeam?.id ? teamMap.get(fm.homeTeam.id) : null;
    const aid = fm.awayTeam?.id ? teamMap.get(fm.awayTeam.id) : null;
    if (!hid || !aid || !fm.utcDate) continue;
    const stage = mapStage(fm.stage);
    const rows = (await sql`
      update matches
      set kickoff_utc = ${fm.utcDate}
      where stage = ${stage}
        and ((home_team_id = ${hid} and away_team_id = ${aid})
          or (home_team_id = ${aid} and away_team_id = ${hid}))
        and kickoff_utc is distinct from ${fm.utcDate}::timestamptz
      returning id
    `) as any[];
    for (const r of rows) changed.push(`m${r.id} ${stage} -> ${fm.utcDate}`);
  }
  console.log(`updated ${changed.length} kickoff(s):\n${changed.join("\n") || "none"}`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
