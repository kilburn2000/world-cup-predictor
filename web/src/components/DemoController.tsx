import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "../auth.js";
import { useDemoMatches, setDemo, type DemoSnapshot } from "../demo.js";
import type { LiveMatch, LiveEvent, LiveTier, LeaderboardRow, EntrantGroup, TopScorerRow } from "../api.js";

// Type "demo" anywhere (outside a text field) to play a ~30s scripted England v
// Croatia match (Group L, matchday 1). It runs in place - stay on any page and
// watch it react: the toasts fire, the live score card animates, and because it
// also rewrites the standings on each goal, every stat card and table (overall,
// week 1, knockout Group L, top scorer) updates live too. Kane scores twice, so
// the four entrants who picked him climb the top-scorer table.

const MYPICK = "2-1";
const PICKS = ["1-1", "2-0", "0-1", "1-0", "3-1", "2-2", "0-0", "1-2", "3-2", "2-1"];

function scorePick(pick: string, hs: number, as: number): { points: number; tier: LiveTier } {
  const [ph, pa] = pick.split("-").map(Number);
  if (ph === hs && pa === as) return { points: 5, tier: "exact" };
  const resultMatch = Math.sign(ph - pa) === Math.sign(hs - as);
  let pts = 0;
  if (resultMatch) pts += 2;
  if (ph === hs) pts += 1;
  if (pa === as) pts += 1;
  const tier: LiveTier = resultMatch ? "result" : ph === hs || pa === as ? "diff" : "miss";
  return { points: pts, tier };
}

const G = (minute: number, team: "home" | "away", player: string): LiveEvent => ({ minute, type: "goal", team, player });
const g1 = G(23, "home", "Harry Kane");
const g2 = G(39, "away", "Andrej Kramarić");
const g3 = G(67, "home", "Harry Kane");
const g4 = G(78, "home", "Jude Bellingham");

interface Step {
  at: number;
  end?: true;
  hs?: number;
  as?: number;
  status?: LiveMatch["status"];
  minute?: number;
  half?: string;
  events?: LiveEvent[];
}

const TIMELINE: Step[] = [
  { at: 0,     hs: 0, as: 0, status: "IN_PLAY", minute: 1,  half: "First Half",  events: [] },
  { at: 2500,  hs: 0, as: 0, status: "IN_PLAY", minute: 15, half: "First Half",  events: [] },
  { at: 4500,  hs: 1, as: 0, status: "IN_PLAY", minute: 23, half: "First Half",  events: [g1] },
  { at: 8000,  hs: 1, as: 1, status: "IN_PLAY", minute: 39, half: "First Half",  events: [g1, g2] },
  { at: 11000, hs: 1, as: 1, status: "IN_PLAY", minute: 45, half: "First Half",  events: [g1, g2] },
  { at: 13000, hs: 1, as: 1, status: "IN_PLAY", minute: 45, half: "Halftime",    events: [g1, g2] },
  { at: 16000, hs: 1, as: 1, status: "IN_PLAY", minute: 46, half: "Second Half", events: [g1, g2] },
  { at: 19000, hs: 2, as: 1, status: "IN_PLAY", minute: 67, half: "Second Half", events: [g1, g2, g3] },
  { at: 23000, hs: 3, as: 1, status: "IN_PLAY", minute: 78, half: "Second Half", events: [g1, g2, g3, g4] },
  { at: 27000, hs: 3, as: 1, status: "IN_PLAY", minute: 90, half: "Second Half", events: [g1, g2, g3, g4] },
  { at: 29000, hs: 3, as: 1, status: "FINISHED", minute: 90, half: "Full Time",  events: [g1, g2, g3, g4] },
  { at: 31000, end: true },
];

const demoGoals = (player: string, events: LiveEvent[]) =>
  events.filter((e) => e.type === "goal" && e.player && e.player.toLowerCase().includes(player.toLowerCase())).length;

interface Ctx {
  baseLb: LeaderboardRow[];
  baseGroups: EntrantGroup[];
  baseTop: TopScorerRow[];
  pickMap: Map<number, string>;
  myId: number;
}

function buildSnapshot(step: Step, ctx: Ctx): DemoSnapshot {
  const { baseLb, baseGroups, baseTop, pickMap } = ctx;
  const hs = step.hs ?? 0;
  const as = step.as ?? 0;
  const live = step.status === "IN_PLAY" || step.status === "FINISHED";
  const events = step.events ?? [];
  const pickOf = (id: number) => pickMap.get(id) ?? "0-0";

  const board = baseLb.map((e) => {
    const pick = pickOf(e.entrantId);
    const sc = live ? scorePick(pick, hs, as) : null;
    return { entrantId: e.entrantId, name: e.name, pick, points: sc ? sc.points : null, tier: sc ? sc.tier : null };
  }).sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

  const counts: Record<string, number> = {};
  for (const e of baseLb) counts[pickOf(e.entrantId)] = (counts[pickOf(e.entrantId)] ?? 0) + 1;
  const topPick = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ["2-1", 0];
  const my = live ? scorePick(MYPICK, hs, as) : null;

  const match: LiveMatch = {
    id: 990000,
    home: "England", away: "Croatia", homeCode: "ENG", awayCode: "CRO",
    stage: "GROUP", group: "L",
    status: step.status ?? "IN_PLAY",
    minute: step.minute ?? null,
    half: step.half ?? null,
    homeScore: hs, awayScore: as,
    myPick: MYPICK, myPoints: my ? my.points : null, myTier: my ? my.tier : null,
    mostCommonScore: String(topPick[0]), mostCommonScoreCount: Number(topPick[1]),
    mostCommonResult: null, mostCommonResultCount: 0, mostCommonTotal: baseLb.length || undefined,
    events, board,
  };

  const leaderboard = baseLb.length
    ? baseLb.map((e) => {
        const pts = live ? scorePick(pickOf(e.entrantId), hs, as).points : 0;
        return { ...e, total: e.total + pts, week1: e.week1 + pts };
      }).sort((a, b) => b.total - a.total)
    : undefined;

  // The demo game is WC Group L, so only entrant-group L is scored on it.
  const groups = baseGroups.length
    ? baseGroups.map((g) => {
        if (g.group !== "L") return g;
        const ents = g.entrants
          .map((en) => {
            const pts = live ? scorePick(pickOf(en.entrantId), hs, as).points : 0;
            return { ...en, total: en.total + pts, week1: en.week1 + pts };
          })
          .sort((a, b) => b.total - a.total)
          .map((en, i) => ({ ...en, qualifying: i < 2, rank: i + 1 }));
        return { ...g, entrants: ents };
      })
    : undefined;

  const topScorer = baseTop.length
    ? baseTop.map((row) => {
        let added = 0;
        const players = row.players.map((p) => {
          const extra = live ? demoGoals(p.name, events) : 0;
          added += extra;
          return { ...p, goals: p.goals + extra };
        });
        return { ...row, players, total: row.total + added };
      }).sort((a, b) => b.total - a.total)
    : undefined;

  return { matches: [match], leaderboard, groups, topScorer };
}

export default function DemoController() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const active = useDemoMatches() != null;

  const qcRef = useRef(qc);
  qcRef.current = qc;
  const meRef = useRef(me);
  meRef.current = me;
  const running = useRef(false);

  useEffect(() => {
    const timers: number[] = [];

    const start = async () => {
      if (running.current) return;
      running.current = true;
      const J = (p: string) => fetch(p).then((r) => r.json());
      let base: [LeaderboardRow[], EntrantGroup[], TopScorerRow[]];
      try {
        base = (await Promise.all([
          qcRef.current.ensureQueryData({ queryKey: ["leaderboard"], queryFn: () => J("/api/leaderboard") }),
          qcRef.current.ensureQueryData({ queryKey: ["groups"], queryFn: () => J("/api/groups") }),
          qcRef.current.ensureQueryData({ queryKey: ["top-scorer"], queryFn: () => J("/api/top-scorer") }),
        ])) as [LeaderboardRow[], EntrantGroup[], TopScorerRow[]];
      } catch {
        base = [[], [], []];
      }
      const [baseLb, baseGroups, baseTop] = base;
      const myId = meRef.current?.entrantId ?? -1;
      const pickMap = new Map<number, string>();
      baseLb.forEach((e, i) => pickMap.set(e.entrantId, e.entrantId === myId ? MYPICK : PICKS[i % PICKS.length]));
      const ctx: Ctx = { baseLb, baseGroups, baseTop, pickMap, myId };

      for (const step of TIMELINE) {
        timers.push(window.setTimeout(() => {
          if (step.end) {
            setDemo(null);
            running.current = false;
            for (const k of [["leaderboard"], ["groups"], ["top-scorer"], ["live"]]) {
              qcRef.current.invalidateQueries({ queryKey: k });
            }
          } else {
            setDemo(buildSnapshot(step, ctx));
          }
        }, step.at));
      }
    };

    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key.length !== 1) return;
      buf = (buf + e.key.toLowerCase()).slice(-4);
      if (buf === "demo") {
        buf = "";
        void start();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      timers.forEach(clearTimeout);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="fixed left-3 top-3 z-[70] flex items-center gap-1.5 rounded-full border border-gold bg-pitch-950/90 px-3 py-1 font-mono text-[10px] uppercase tracking-[2px] text-gold">
      <span className="h-1.5 w-1.5 rounded-full bg-gold" style={{ animation: "loadDots 1.2s infinite" }} />
      Demo mode
    </div>
  );
}
