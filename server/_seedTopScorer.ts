import "dotenv/config";
import { sql } from "./src/db/index.js";

// Canonical seed for the Top Scorer competition. Idempotent — safe on fresh or
// existing DBs (local + production).
const PLAYERS: { name: string; first: string | null; country: string }[] = [
  { name: "Ronaldo", first: "Cristiano", country: "POR" },
  { name: "Kane", first: "Harry", country: "ENG" },
  { name: "Depay", first: "Memphis", country: "NED" },
  { name: "Vinicius Jr", first: null, country: "BRA" },
  { name: "Alvarez", first: "Julian", country: "ARG" },
  { name: "Yamal", first: "Lamine", country: "SPA" },
  { name: "Olise", first: "Michael", country: "FRA" },
  { name: "Oyarzabal", first: "Mikel", country: "SPA" },
  { name: "Mbappe", first: "Kylian", country: "FRA" },
  { name: "Raphinha", first: null, country: "BRA" },
  { name: "Dembele", first: "Ousmane", country: "FRA" },
  { name: "Messi", first: "Lionel", country: "ARG" },
  { name: "Martinez", first: "Lautaro", country: "ARG" },
  { name: "Gakpo", first: "Cody", country: "NED" },
  { name: "Diaz", first: "Luis", country: "COL" },
  { name: "Wirtz", first: "Florian", country: "GER" },
  { name: "Haaland", first: "Erling", country: "NOR" },
  { name: "Havertz", first: "Kai", country: "GER" },
  { name: "Musiala", first: "Jamal", country: "GER" },
];

const PICKS: Record<string, [string, string]> = {
  "[redacted]": ["Ronaldo", "Kane"], "[redacted]": ["Depay", "Ronaldo"],
  "[redacted]": ["Vinicius Jr", "Depay"], "[redacted]": ["Alvarez", "Yamal"],
  "[redacted]": ["Olise", "Oyarzabal"], "[redacted]": ["Mbappe", "Olise"],
  "[redacted]": ["Raphinha", "Dembele"], "[redacted]": ["Kane", "Vinicius Jr"],
  "[redacted]": ["Dembele", "Messi"], "[redacted]": ["Mbappe", "Oyarzabal"],
  "[redacted]": ["Raphinha", "Vinicius Jr"], "[redacted]": ["Martinez", "Depay"],
  "[redacted]": ["Gakpo", "Diaz"], "[redacted]": ["Diaz", "Wirtz"],
  "[redacted]": ["Haaland", "Havertz"], "[redacted]": ["Olise", "Gakpo"],
  "[redacted]": ["Martinez", "Messi"], "[redacted]": ["Messi", "Musiala"],
  "[redacted]": ["Musiala", "Raphinha"], "[redacted]": ["Alvarez", "Yamal"],
  "[redacted]": ["Vinicius Jr", "Alvarez"], "[redacted]": ["Kane", "Gakpo"],
  "[redacted]": ["Wirtz", "Ronaldo"], "[redacted]": ["Yamal", "Dembele"],
  "[redacted]": ["Wirtz", "Haaland"], "[redacted]": ["Ronaldo", "Musiala"],
  "[redacted]": ["Musiala", "Alvarez"], "[redacted]": ["Haaland", "Martinez"],
  "[redacted]": ["Oyarzabal", "Wirtz"], "[redacted]": ["Yamal", "Martinez"],
  "[redacted]": ["Havertz", "Mbappe"], "[redacted]": ["Oyarzabal", "Diaz"],
  "[redacted]": ["Depay", "Havertz"], "[redacted]": ["Dembele", "Olise"],
  "[redacted]": ["Havertz", "Mbappe"], "[redacted]": ["Gakpo", "Kane"],
  "[redacted]": ["Diaz", "Haaland"],
};

await sql`create table if not exists scorer_players (
  id serial primary key, name text not null, country text not null, first_name text,
  feed_goals integer not null default 0, manual_goals integer, unique (name, country)
)`;
await sql`alter table scorer_players add column if not exists first_name text`;
await sql`alter table scorer_players add column if not exists feed_goals integer not null default 0`;
await sql`alter table scorer_players add column if not exists manual_goals integer`;
await sql`create table if not exists scorer_picks (
  entrant_id integer not null references entrants(id) on delete cascade,
  player_id integer not null references scorer_players(id) on delete cascade,
  primary key (entrant_id, player_id)
)`;
await sql`create table if not exists match_scorers (
  espn_match_id text not null, player_name text not null, country text,
  goals integer not null default 0, primary key (espn_match_id, player_name)
)`;

for (const p of PLAYERS) {
  await sql`insert into scorer_players (name, country, first_name) values (${p.name}, ${p.country}, ${p.first})
            on conflict (name, country) do update set first_name = excluded.first_name`;
}
const players = await sql`select id, name from scorer_players`;
const pid = new Map((players as any[]).map((p) => [p.name, p.id]));

let picks = 0; const missing: string[] = [];
for (const [entrant, two] of Object.entries(PICKS)) {
  const [e] = await sql`select id from entrants where name = ${entrant}`;
  if (!e) { missing.push(entrant); continue; }
  await sql`delete from scorer_picks where entrant_id = ${e.id}`;
  for (const pname of two) {
    const id = pid.get(pname);
    if (!id) { missing.push(`player:${pname}`); continue; }
    await sql`insert into scorer_picks (entrant_id, player_id) values (${e.id}, ${id}) on conflict do nothing`;
    picks++;
  }
}
console.log(`players=${players.length} picks=${picks} missing=${JSON.stringify(missing)}`);
await sql.end();
