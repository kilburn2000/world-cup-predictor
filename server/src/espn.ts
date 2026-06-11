// ESPN's free (undocumented) World Cup scoreboard feed. No key. Gives live
// score, status, minute and goal/card events. Polled every 30s.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
// A demo/mock feed: if this file exists, its matches are merged into the live
// feed (used by mockSim.ts to preview the live experience without a real game).
const MOCK_PATH = join(homedir(), ".cache/wc-mock.json");

function readMock(): EspnMatch[] {
  try {
    return JSON.parse(readFileSync(MOCK_PATH, "utf8")) as EspnMatch[];
  } catch {
    return [];
  }
}

let cache: { at: number; data: any } | null = null;
const CACHE_MS = 8000;

async function getScoreboard(): Promise<any> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const res = await fetch(SCOREBOARD, { headers: { "user-agent": "Mozilla/5.0 worldcup-predictor" } });
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  const data = await res.json();
  cache = { at: Date.now(), data };
  return data;
}

export interface LiveEvent {
  minute: number;
  type: "goal" | "yellow" | "red" | "var";
  team: "home" | "away";
  player?: string;
  detail?: string;
}

export interface EspnMatch {
  id: string;
  date: string;
  home: string;
  away: string;
  homeAbbr: string;
  awayAbbr: string;
  homeScore: number;
  awayScore: number;
  state: "pre" | "in" | "post";
  completed: boolean;
  minute: number | null;
  period: number | null; // 1 = first half, 2 = second half, 3+ = extra time
  half: string | null; // ESPN's human label: "First Half", "Halftime", "Second Half", …
  winner: "home" | "away" | null; // ESPN winner flag (covers penalties)
  events: LiveEvent[];
}

function parseClock(s?: string): number | null {
  if (!s) return null;
  const m = String(s).match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function eventType(text: string): LiveEvent["type"] | null {
  const t = text.toLowerCase();
  if (t.includes("goal") || t.includes("penalty - scored")) return "goal";
  if (t.includes("yellow")) return "yellow";
  if (t.includes("red")) return "red";
  return null; // ignore subs, VAR-only, etc.
}

export async function getMatches(): Promise<EspnMatch[]> {
  const mock = readMock();
  let real: EspnMatch[] = [];
  try {
    real = await getRealMatches();
  } catch (e) {
    if (!mock.length) throw e; // only swallow errors while a mock is active
  }
  return [...real, ...mock];
}

async function getRealMatches(): Promise<EspnMatch[]> {
  const data = await getScoreboard();
  const out: EspnMatch[] = [];
  for (const e of data.events ?? []) {
    const comp = e.competitions?.[0];
    if (!comp) continue;
    const cs = comp.competitors ?? [];
    const home = cs.find((c: any) => c.homeAway === "home");
    const away = cs.find((c: any) => c.homeAway === "away");
    if (!home || !away) continue;

    const st = e.status ?? {};
    const state = (st.type?.state ?? "pre") as EspnMatch["state"];
    const events: LiveEvent[] = [];
    for (const d of comp.details ?? []) {
      const type = eventType(d.type?.text ?? "");
      if (!type) continue;
      events.push({
        minute: parseClock(d.clock?.displayValue) ?? 0,
        type,
        team: d.team?.id === home.team?.id ? "home" : "away",
        player: d.athletesInvolved?.[0]?.displayName,
        detail: d.type?.text,
      });
    }

    out.push({
      id: String(e.id),
      date: e.date,
      home: home.team?.displayName ?? "",
      away: away.team?.displayName ?? "",
      homeAbbr: home.team?.abbreviation ?? "",
      awayAbbr: away.team?.abbreviation ?? "",
      homeScore: Number(home.score ?? 0),
      awayScore: Number(away.score ?? 0),
      state,
      completed: !!st.type?.completed,
      minute: state === "in" ? parseClock(st.displayClock) : null,
      period: typeof st.period === "number" ? st.period : null,
      half: st.type?.description ?? null,
      winner: home.winner ? "home" : away.winner ? "away" : null,
      events,
    });
  }
  return out;
}
