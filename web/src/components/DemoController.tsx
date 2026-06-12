import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "../auth.js";
import { useDemoMatches, setDemo, type DemoSnapshot } from "../demo.js";
import type { LiveMatch, LiveEvent, LiveTier, LeaderboardRow, EntrantGroup, TopScorerRow } from "../api.js";

// Type "demo" anywhere (outside a text field) to play a ~30s scripted version of
// the NEXT scheduled fixture, using everyone's real predictions for it. It runs
// in place - stay on any page and watch it react: the toasts fire, the live score
// card animates, and because it rewrites the standings on each goal, every stat
// card and table (overall, the game's week, that group's knockout, top scorer)
// updates live too.

// Pick country code -> team name, to find scorers in the top-scorer pool.
const SCORER_COUNTRY: Record<string, string> = {
  POR: "Portugal", ENG: "England", NED: "Netherlands", BRA: "Brazil", ARG: "Argentina",
  SPA: "Spain", FRA: "France", COL: "Colombia", GER: "Germany", NOR: "Norway",
};

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

const demoGoals = (player: string, events: LiveEvent[]) =>
  events.filter((e) => e.type === "goal" && e.player && e.player.toLowerCase().includes(player.toLowerCase())).length;

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

interface Ctx {
  matchId: number;
  home: string; away: string; homeCode: string; awayCode: string;
  group: string | null; stage: string;
  weekField: "week1" | "week2" | "week3" | "r32" | null;
  entries: { entrantId: number; name: string; pick: string }[]; // real predictions
  pickMap: Map<number, string>;
  baseLb: LeaderboardRow[];
  baseGroups: EntrantGroup[];
  baseTop: TopScorerRow[];
  mc: [string, number];
  myId: number;
  myPick: string;
}

function bump<T extends { total: number }>(e: T, pts: number, field: Ctx["weekField"]): T {
  const o: any = { ...e, total: e.total + pts };
  if (field && field in e) o[field] = ((e as any)[field] ?? 0) + pts;
  return o;
}

function buildSnapshot(step: Step, ctx: Ctx): DemoSnapshot {
  const hs = step.hs ?? 0;
  const as = step.as ?? 0;
  const live = step.status === "IN_PLAY" || step.status === "FINISHED";
  const events = step.events ?? [];

  const board = ctx.entries.map((e) => {
    const sc = live ? scorePick(e.pick, hs, as) : null;
    return { entrantId: e.entrantId, name: e.name, pick: e.pick, points: sc ? sc.points : null, tier: sc ? sc.tier : null };
  }).sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

  const my = live ? scorePick(ctx.myPick, hs, as) : null;

  const match: LiveMatch = {
    id: ctx.matchId,
    home: ctx.home, away: ctx.away, homeCode: ctx.homeCode, awayCode: ctx.awayCode,
    stage: ctx.stage, group: ctx.group,
    status: step.status ?? "IN_PLAY",
    minute: step.minute ?? null,
    half: step.half ?? null,
    homeScore: hs, awayScore: as,
    myPick: ctx.myPick, myPoints: my ? my.points : null, myTier: my ? my.tier : null,
    mostCommonScore: ctx.mc[0], mostCommonScoreCount: ctx.mc[1],
    mostCommonResult: null, mostCommonResultCount: 0, mostCommonTotal: ctx.entries.length || undefined,
    events, board,
  };

  const leaderboard = ctx.baseLb.length
    ? ctx.baseLb.map((e) => bump(e, live ? scorePick(ctx.pickMap.get(e.entrantId) ?? "0-0", hs, as).points : 0, ctx.weekField))
        .sort((a, b) => b.total - a.total)
    : undefined;

  // Only a group-stage game feeds the entrant knockout groups, and only its group.
  const groups = ctx.stage === "GROUP" && ctx.group && ctx.baseGroups.length
    ? ctx.baseGroups.map((g) => {
        if (g.group !== ctx.group) return g;
        const entrants = g.entrants
          .map((en) => bump(en, live ? scorePick(ctx.pickMap.get(en.entrantId) ?? "0-0", hs, as).points : 0, ctx.weekField))
          .sort((a, b) => b.total - a.total)
          .map((en, i) => ({ ...en, qualifying: i < 2, rank: i + 1 }));
        return { ...g, entrants };
      })
    : undefined;

  const topScorer = ctx.baseTop.length
    ? ctx.baseTop.map((row) => {
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
    const J = (p: string) => fetch(p).then((r) => r.json());

    const start = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const [baseLb, baseGroups, baseTop, fixtures] = (await Promise.all([
          qcRef.current.ensureQueryData({ queryKey: ["leaderboard"], queryFn: () => J("/api/leaderboard") }),
          qcRef.current.ensureQueryData({ queryKey: ["groups"], queryFn: () => J("/api/groups") }),
          qcRef.current.ensureQueryData({ queryKey: ["top-scorer"], queryFn: () => J("/api/top-scorer") }),
          qcRef.current.ensureQueryData({ queryKey: ["fixtures"], queryFn: () => J("/api/fixtures") }),
        ])) as [LeaderboardRow[], EntrantGroup[], TopScorerRow[], any[]];

        // next scheduled fixture with both teams known (fall back to any with teams)
        const next =
          [...fixtures]
            .filter((f) => f.status === "SCHEDULED" && f.home && f.away)
            .sort((a, b) => (a.kickoff ?? "").localeCompare(b.kickoff ?? ""))[0] ?? fixtures.find((f) => f.home && f.away);
        if (!next) { running.current = false; return; }

        const detail = await J(`/api/fixtures/${next.id}`);
        const entries = (detail.board ?? []).map((b: any) => ({ entrantId: b.entrantId, name: b.name, pick: b.pick }));
        const pickMap = new Map<number, string>();
        for (const e of entries) pickMap.set(e.entrantId, e.pick);

        const counts: Record<string, number> = {};
        for (const e of entries) counts[e.pick] = (counts[e.pick] ?? 0) + 1;
        const mc = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ["1-1", 0]) as [string, number];

        const myId = meRef.current?.entrantId ?? -1;
        const myPick = pickMap.get(myId) ?? mc[0];

        const weekField: Ctx["weekField"] =
          next.stage === "GROUP"
            ? next.matchday === 1 ? "week1" : next.matchday === 2 ? "week2" : next.matchday === 3 ? "week3" : null
            : next.stage === "LAST_32" ? "r32" : null;

        // scorers drawn from the top-scorer pool for each team (so top scorer moves)
        const poolFor = (teamName: string) => [
          ...new Set(baseTop.flatMap((r) => r.players).filter((p) => SCORER_COUNTRY[p.country] === teamName).map((p) => p.name)),
        ];
        const homeP = poolFor(next.home);
        const awayP = poolFor(next.away);
        const G = (minute: number, team: "home" | "away", player?: string): LiveEvent => ({ minute, type: "goal", team, player });
        const g1 = G(27, "home", homeP[0]);
        const g2 = G(58, "away", awayP[0]);
        const g3 = G(74, "home", homeP[1] ?? homeP[0]);

        const ctx: Ctx = {
          matchId: next.id,
          home: next.home, away: next.away, homeCode: next.homeCode ?? "", awayCode: next.awayCode ?? "",
          group: next.group ?? null, stage: next.stage,
          weekField, entries, pickMap, baseLb, baseGroups, baseTop, mc, myId, myPick,
        };

        const TIMELINE: Step[] = [
          { at: 0,     hs: 0, as: 0, status: "IN_PLAY", minute: 1,  half: "First Half",  events: [] },
          { at: 3000,  hs: 0, as: 0, status: "IN_PLAY", minute: 18, half: "First Half",  events: [] },
          { at: 5000,  hs: 1, as: 0, status: "IN_PLAY", minute: 27, half: "First Half",  events: [g1] },
          { at: 9000,  hs: 1, as: 0, status: "IN_PLAY", minute: 45, half: "First Half",  events: [g1] },
          { at: 11000, hs: 1, as: 0, status: "IN_PLAY", minute: 45, half: "Halftime",    events: [g1] },
          { at: 14000, hs: 1, as: 0, status: "IN_PLAY", minute: 46, half: "Second Half", events: [g1] },
          { at: 17000, hs: 1, as: 1, status: "IN_PLAY", minute: 58, half: "Second Half", events: [g1, g2] },
          { at: 21000, hs: 2, as: 1, status: "IN_PLAY", minute: 74, half: "Second Half", events: [g1, g2, g3] },
          { at: 25000, hs: 2, as: 1, status: "IN_PLAY", minute: 89, half: "Second Half", events: [g1, g2, g3] },
          { at: 27000, hs: 2, as: 1, status: "FINISHED", minute: 90, half: "Full Time",  events: [g1, g2, g3] },
          { at: 29000, end: true },
        ];

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
      } catch {
        running.current = false;
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
