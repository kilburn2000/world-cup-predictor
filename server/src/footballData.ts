import "dotenv/config";

// Thin football-data.org v4 client. Free tier = 10 requests/minute and
// *delayed* (not in-play) scores, so we self-throttle to ~1 request / 7s and
// cache responses; the poller only needs a couple of endpoints anyway.

const BASE = "https://api.football-data.org/v4";
const TOKEN = process.env.FOOTBALL_DATA_TOKEN ?? "";
const COMP = "WC"; // FIFA World Cup

const MIN_GAP_MS = 7000;
let lastCallAt = 0;

const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_TTL_MS = 60_000;

async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

async function get<T>(path: string, { ttl = CACHE_TTL_MS } = {}): Promise<T> {
  const cached = cache.get(path);
  if (cached && Date.now() - cached.at < ttl) return cached.data as T;

  if (!TOKEN) {
    throw new Error(
      "FOOTBALL_DATA_TOKEN is not set. Register free at football-data.org and put the token in .env",
    );
  }

  await throttle();
  const res = await fetch(`${BASE}${path}`, { headers: { "X-Auth-Token": TOKEN } });
  if (res.status === 429) throw new Error("football-data.org rate limit hit (429) - backing off");
  if (!res.ok) throw new Error(`football-data.org ${path} -> HTTP ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(path, { at: Date.now(), data });
  return data;
}

// --- Raw shapes (only the fields we use) ---
export interface FdTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
  crest?: string;
}
export interface FdMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED|TIMED|IN_PLAY|PAUSED|FINISHED|...
  stage: string; // GROUP_STAGE|LAST_32|LAST_16|QUARTER_FINALS|SEMI_FINALS|THIRD_PLACE|FINAL
  group: string | null; // "GROUP_A".."GROUP_L"
  matchday: number | null;
  homeTeam: { id: number | null; name: string | null };
  awayTeam: { id: number | null; name: string | null };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
}

export const fd = {
  teams: () => get<{ teams: FdTeam[] }>(`/competitions/${COMP}/teams`, { ttl: 24 * 3600_000 }),
  matches: () => get<{ matches: FdMatch[] }>(`/competitions/${COMP}/matches`),
  standings: () => get<{ standings: any[] }>(`/competitions/${COMP}/standings`),
};

// Map football-data's stage/status/group strings to our domain values.
export function mapStage(stage: string): string {
  switch (stage) {
    case "GROUP_STAGE": return "GROUP";
    case "LAST_32": return "LAST_32";
    case "LAST_16": return "LAST_16";
    case "QUARTER_FINALS": return "QF";
    case "SEMI_FINALS": return "SF";
    case "THIRD_PLACE":
    case "3RD_PLACE":
    case "PLAY_OFF_FOR_THIRD_PLACE": return "THIRD_PLACE";
    case "FINAL": return "FINAL";
    default: return stage;
  }
}

export function mapStatus(status: string): "SCHEDULED" | "IN_PLAY" | "FINISHED" {
  if (status === "FINISHED" || status === "AWARDED") return "FINISHED";
  if (status === "IN_PLAY" || status === "PAUSED") return "IN_PLAY";
  return "SCHEDULED";
}

export function mapGroup(group: string | null): string | null {
  if (!group) return null;
  return group.replace(/^GROUP_/, ""); // "GROUP_A" -> "A"
}
