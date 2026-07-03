import "dotenv/config";
import { sql } from "./db/index.js";
import { fd } from "./footballData.js";

// READ-ONLY. Compares every stored kickoff_utc against football-data.org's
// utcDate (the authoritative schedule), joined by api_match_id, and prints the
// mismatches. Also flags `result_overridden` rows - those are the ones the sim
// scripts (mockTwo/simKo set kickoff_utc=now(), result_overridden=true) locked,
// which syncMatches() then refuses to restore. Writes nothing to the DB.
//
//   cd server && npx tsx src/verifyKickoffs.ts
//   # against prod: DATABASE_URL="<render external url>" npx tsx src/verifyKickoffs.ts

function iso(v: unknown): string | null {
  return v ? new Date(v as string).toISOString() : null;
}

async function main() {
  const { matches } = await fd.matches();
  const truthById = new Map<number, string>();
  for (const m of matches as { id: number; utcDate: string }[]) truthById.set(m.id, m.utcDate);

  const rows = (await sql`
    select m.id, m.api_match_id api_id, m.kickoff_utc ko, m.result_overridden ovr,
           m.stage, m.matchday, m.status, coalesce(ht.tla, '?') hc, coalesce(at.tla, '?') ac
    from matches m
    left join teams ht on ht.id = m.home_team_id
    left join teams at on at.id = m.away_team_id
    order by m.kickoff_utc asc nulls last, m.id
  `) as any[];

  let mismatched = 0;
  let lockedMismatch = 0;
  let noFeed = 0;
  const lines: string[] = [];

  for (const r of rows) {
    const truth = r.api_id != null ? truthById.get(r.api_id) : undefined;
    if (!truth) { noFeed++; continue; }
    const stored = iso(r.ko);
    if (stored === iso(truth)) continue;
    mismatched++;
    if (r.ovr) lockedMismatch++;
    lines.push(
      `${String(r.hc).padEnd(3)} v ${String(r.ac).padEnd(3)}  ${String(r.stage).padEnd(8)} md${r.matchday ?? "-"}  ` +
      `${String(r.status).padEnd(9)}  stored ${stored ?? "NULL"}  ->  truth ${iso(truth)}` +
      (r.ovr ? "  [OVERRIDDEN - sync will NOT fix]" : ""),
    );
  }

  console.log(
    `matches=${rows.length}  mismatched=${mismatched}  ` +
    `(overridden-locked=${lockedMismatch})  no-feed-match=${noFeed}`,
  );
  if (lines.length) {
    console.log("\nMismatches (earliest stored kickoff first):\n" + lines.join("\n"));
    console.log(
      "\nTo restore the real times, clear the override + re-sync for the affected rows,\n" +
      "e.g.  update matches set result_overridden = false where <ids>;  then run `npm run seed`\n" +
      "(seed's syncMatches upserts kickoff_utc from utcDate for non-overridden rows).",
    );
  }
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
