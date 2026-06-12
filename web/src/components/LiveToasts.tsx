import { useEffect, useRef, useState } from "react";
import { useLiveMatches, type LiveMatch, type LiveEvent } from "../api.js";
import { flagFor } from "../flags.js";

interface Toast {
  id: string;
  accent: string;
  label: string;
  home: string;
  away: string;
  score: string | null; // null before kick-off ("v")
  highlight: "home" | "away" | null; // team to emphasise (goal / card)
}

function eventToast(id: string, m: LiveMatch, e: LiveEvent): Toast {
  const score = `${m.homeScore}–${m.awayScore}`;
  const who = `${e.minute}'${e.player ? " · " + e.player : ""}`;
  if (e.type === "goal") return { id, accent: "#c9a86a", label: `Goal · ${who}`, home: m.home, away: m.away, score, highlight: e.team };
  if (e.type === "red") return { id, accent: "#d9534f", label: `Red card · ${who}`, home: m.home, away: m.away, score, highlight: e.team };
  return { id, accent: "#e3c558", label: `Yellow card · ${who}`, home: m.home, away: m.away, score, highlight: e.team };
}

type Kind = "kickoff" | "half" | "full";
function stateToast(id: string, m: LiveMatch, kind: Kind): Toast {
  const score = `${m.homeScore}–${m.awayScore}`;
  if (kind === "kickoff") return { id, accent: "#6bbf86", label: "Kick-off", home: m.home, away: m.away, score: null, highlight: null };
  if (kind === "half") return { id, accent: "#e3c558", label: "Half-time", home: m.home, away: m.away, score, highlight: null };
  return { id, accent: "#c9a86a", label: "Full-time", home: m.home, away: m.away, score, highlight: null };
}

type Phase = "PRE" | "LIVE" | "HT" | "FT";
// ESPN labels the break "Halftime" / "Half Time" / "HT" in type.description; match
// all spellings (hyphen, space or none).
const HALFTIME = /half[\s-]?time|^ht$/i;
function phaseOf(m: LiveMatch): Phase {
  if (m.status === "FINISHED") return "FT";
  if (m.status === "IN_PLAY") return m.half && HALFTIME.test(m.half) ? "HT" : "LIVE";
  return "PRE";
}

// Global live-event ticker - polls the live feed regardless of page and drops a
// toast in for kick-off, goals, cards, half-time and full-time.
export default function LiveToasts() {
  const { data } = useLiveMatches();
  const seen = useRef<Set<string>>(new Set());
  const phase = useRef<Map<number, Phase>>(new Map());
  const initialised = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!data) return;
    const fresh: Toast[] = [];
    for (const m of data) {
      // match-state transitions (kick-off / half-time / full-time)
      const now = phaseOf(m);
      const prev = phase.current.get(m.id);
      if (now !== prev) {
        phase.current.set(m.id, now);
        if (initialised.current) {
          if (now === "LIVE" && prev !== "HT") {
            for (const k of seen.current) if (k.startsWith(`${m.id}-`)) seen.current.delete(k);
            fresh.push(stateToast(`${m.id}-ko`, m, "kickoff"));
          } else if (now === "HT") {
            fresh.push(stateToast(`${m.id}-ht`, m, "half"));
          } else if (now === "FT") {
            fresh.push(stateToast(`${m.id}-ft`, m, "full"));
          }
        }
      }
      // goal / card events
      for (const e of m.events ?? []) {
        if (e.type === "var") continue;
        const key = `${m.id}-${e.minute}-${e.type}-${e.team}-${e.player ?? ""}`;
        if (seen.current.has(key)) continue;
        seen.current.add(key);
        if (initialised.current) fresh.push(eventToast(key, m, e));
      }
    }
    initialised.current = true;
    if (fresh.length) {
      setToasts((t) => [...fresh, ...t]);
      for (const f of fresh) {
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), 6500);
      }
    }
  }, [data]);

  if (!toasts.length) return null;
  const teamCls = (t: Toast, side: "home" | "away") =>
    t.highlight === null ? "text-cream" : t.highlight === side ? "font-semibold text-cream" : "text-muted";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex flex-col-reverse items-stretch gap-2 px-2 sm:bottom-auto sm:top-3 sm:flex-col sm:items-center sm:px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-drop pointer-events-auto flex w-full overflow-hidden rounded-xl sm:max-w-sm"
          style={{ background: "rgba(11,21,14,0.97)", border: "1px solid rgba(232,228,216,0.45)", boxShadow: "0 10px 34px rgba(0,0,0,0.5)" }}
        >
          <span className="w-1 shrink-0" style={{ background: t.accent }} aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[1.5px]" style={{ color: t.accent }}>{t.label}</div>
            <div className="flex items-center gap-1.5 text-[13.5px]">
              <span>{flagFor(t.home)}</span>
              <span className={"truncate " + teamCls(t, "home")}>{t.home}</span>
              <span className="px-1 font-mono text-cream">{t.score ?? "v"}</span>
              <span className={"truncate " + teamCls(t, "away")}>{t.away}</span>
              <span>{flagFor(t.away)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
