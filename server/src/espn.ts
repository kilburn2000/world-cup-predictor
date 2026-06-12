// ESPN's free (undocumented) World Cup scoreboard feed. No key. Gives live
// score, status, minute and goal/card events. Polled every 30s.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const SUMMARY = (event: string) => `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${event}`;
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

async function getScoreboard(dates?: string): Promise<any> {
  if (!dates && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const url = dates ? `${SCOREBOARD}?dates=${dates}` : SCOREBOARD;
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 worldcup-predictor" } });
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status}`);
  const data = await res.json();
  if (!dates) cache = { at: Date.now(), data };
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

export interface SummaryEvent {
  type: "goal" | "yellow" | "red";
  minute: number;
  player?: string;
  country: string; // scoring/booked player's team display name (e.g. "Portugal")
  own: boolean; // own goal (counts on the scoreboard, not for the scorer)
}

// All key events for one match from ESPN's per-match summary (richer + timelier
// than the scoreboard's `details`): goals (incl. penalties + own goals) and cards,
// each with the player, minute and team.
export async function getMatchEvents(eventId: string): Promise<SummaryEvent[]> {
  const res = await fetch(SUMMARY(eventId), { headers: { "user-agent": "Mozilla/5.0 worldcup-predictor" } });
  if (!res.ok) throw new Error(`ESPN summary HTTP ${res.status}`);
  const data: any = await res.json();
  const comp = data.header?.competitions?.[0];
  const teamName = new Map<string, string>();
  for (const c of comp?.competitors ?? []) {
    if (c.team?.id) teamName.set(String(c.team.id), c.team.displayName ?? c.team.shortDisplayName ?? "");
  }
  const out: SummaryEvent[] = [];
  for (const ev of data.keyEvents ?? []) {
    const text = String(ev.type?.text ?? "").toLowerCase();
    const own = text.includes("own");
    // Key events are goals + red cards only (yellows are noise).
    let type: SummaryEvent["type"] | null = null;
    if (text.includes("goal") || /penalt.*scor|scor.*penalt/.test(text)) type = "goal";
    else if (text.includes("red")) type = "red";
    if (!type) continue;
    out.push({
      type,
      minute: parseClock(ev.clock?.displayValue) ?? 0,
      player: ev.athletesInvolved?.[0]?.displayName ?? ev.participants?.[0]?.athlete?.displayName,
      country: teamName.get(String(ev.team?.id)) ?? "",
      own,
    });
  }
  return out;
}

// Fetch + parse the matches for a specific date (YYYYMMDD) — used to backfill
// finished games that have dropped off the live scoreboard.
export async function getMatchesForDate(dates: string): Promise<EspnMatch[]> {
  return parseScoreboard(await getScoreboard(dates));
}

async function getRealMatches(): Promise<EspnMatch[]> {
  return parseScoreboard(await getScoreboard());
}

function parseScoreboard(data: any): EspnMatch[] {
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
