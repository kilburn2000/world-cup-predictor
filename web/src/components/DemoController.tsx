import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useDemoMatches, setDemoMatches } from "../demo.js";
import type { LiveMatch, LiveEvent, LiveTier } from "../api.js";

// Type "demo" anywhere (outside a text field) to play a ~30s scripted England v
// Brazil match: kick-off, four goals, half-time and full-time - driving the real
// toasts, the live score card, the Your-prediction line and the predictions board.

const MYPICK = "2-1";
const BOARD_PICKS = [
  { entrantId: 990001, name: "[redacted]", pick: "1-1" },
  { entrantId: 990002, name: "[redacted]", pick: "2-0" },
  { entrantId: 990003, name: "[redacted]", pick: "3-1" },
  { entrantId: 990004, name: "[redacted]", pick: "0-1" },
  { entrantId: 990005, name: "Sarah Jones", pick: "1-0" },
  { entrantId: 990006, name: "Tom Reed", pick: "2-2" },
];

// Simplified scorer for the demo: exact = 5, correct result = 2, +1 per team's
// goals nailed - enough to colour the chips and points realistically.
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
const g2 = G(39, "away", "Vinícius Júnior");
const g3 = G(67, "home", "Jude Bellingham");
const g4 = G(78, "home", "Bukayo Saka");

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

function buildMatch(s: Step): LiveMatch {
  const hs = s.hs ?? 0;
  const as = s.as ?? 0;
  const live = s.status === "IN_PLAY" || s.status === "FINISHED";
  const board = BOARD_PICKS.map((b) => {
    const sc = live ? scorePick(b.pick, hs, as) : null;
    return { entrantId: b.entrantId, name: b.name, pick: b.pick, points: sc ? sc.points : null, tier: sc ? sc.tier : null };
  }).sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

  const counts: Record<string, number> = {};
  for (const b of BOARD_PICKS) counts[b.pick] = (counts[b.pick] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const my = live ? scorePick(MYPICK, hs, as) : null;

  return {
    id: 990000,
    home: "England", away: "Brazil", homeCode: "ENG", awayCode: "BRA",
    stage: "GROUP", group: "A", venue: "Demo Stadium",
    status: s.status ?? "IN_PLAY",
    minute: s.minute ?? null,
    half: s.half ?? null,
    homeScore: hs, awayScore: as,
    myPick: MYPICK, myPoints: my ? my.points : null, myTier: my ? my.tier : null,
    mostCommonScore: top[0], mostCommonScoreCount: top[1],
    mostCommonResult: null, mostCommonResultCount: 0, mostCommonTotal: BOARD_PICKS.length,
    events: s.events ?? [],
    board,
  };
}

export default function DemoController() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const active = useDemoMatches() != null;

  const navRef = useRef(navigate);
  navRef.current = navigate;
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const qcRef = useRef(qc);
  qcRef.current = qc;
  const running = useRef(false);

  useEffect(() => {
    const timers: number[] = [];

    const begin = () => {
      for (const step of TIMELINE) {
        timers.push(window.setTimeout(() => {
          if (step.end) {
            setDemoMatches(null);
            running.current = false;
            qcRef.current.invalidateQueries({ queryKey: ["live"] });
          } else {
            setDemoMatches([buildMatch(step)]);
          }
        }, step.at));
      }
    };

    const start = () => {
      if (running.current) return;
      running.current = true;
      if (pathRef.current !== "/stats/scores") {
        navRef.current("/stats/scores");
        timers.push(window.setTimeout(begin, 3200)); // let the page-transition loader clear first
      } else {
        begin();
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
        start();
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
