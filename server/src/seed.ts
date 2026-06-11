import "dotenv/config";
import { sql } from "./db/index.js";
import { syncTeams, syncMatches } from "./sync.js";
import { DEFAULT_SCORING } from "@wc/shared";

// One-off seed: teams + fixtures from football-data.org, a default league, and
// the default scoring config. Safe to re-run (everything upserts).
async function main() {
  console.log("Seeding teams…");
  const teamMap = await syncTeams();
  console.log(`  ${teamMap.size} teams`);

  console.log("Seeding matches…");
  const changed = await syncMatches();
  const [{ count }] = await sql`select count(*)::int as count from matches`;
  console.log(`  ${count} matches (${changed} new/changed)`);

  await sql`
    insert into leagues (name, join_code) values ('Main League', 'MAIN')
    on conflict (join_code) do nothing
  `;
  await sql`
    insert into scoring_config (id, config) values (1, ${JSON.stringify(DEFAULT_SCORING)}::jsonb)
    on conflict (id) do update set config = excluded.config
  `;

  const [{ teamCount }] = await sql`select count(*)::int as "teamCount" from teams`;
  const groups = await sql`select distinct group_name from teams where group_name is not null order by group_name`;
  console.log(`Done. ${teamCount} teams across groups: ${groups.map((g: any) => g.group_name).join(", ")}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
