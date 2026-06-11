import { useEffect, useRef, useState } from "react";
import { useLiveMatches, type LiveMatch, type LiveEvent } from "../api.js";
import { flagFor } from "../flags.js";

interface Toast {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  accent: string;
}

function eventToast(id: string, m: LiveMatch, e: LiveEvent): Toast {
  const teamName = e.team === "home" ? m.home : m.away;
  const flag = flagFor(teamName);
  const at = `${e.player ? e.player + " · " : ""}${e.minute}'`;
  if (e.type === "goal") {
    return {
      id,
      icon: "⚽",
      title: `${flag} GOAL — ${teamName}`,
      subtitle: `${at}  ·  ${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`,
      accent: "#c9a86a",
    };
  }
  if (e.type === "red") {
    return { id, icon: "🟥", title: `${flag} Red card — ${teamName}`, subtitle: at, accent: "#d9534f" };
  }
  return { id, icon: "🟨", title: `${flag} Yellow card — ${teamName}`, subtitle: at, accent: "#e3c558" };
}

type Kind = "kickoff" | "half" | "full";
function stateToast(id: string, m: LiveMatch, kind: Kind): Toast {
  const score = `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}`;
  if (kind === "kickoff")
    return {
      id, icon: "🟢", title: `Kick-off — ${m.home} v ${m.away}`,
      subtitle: m.stage === "GROUP" && m.group ? `Group ${m.group}` : m.stage, accent: "#6bbf86",
    };
  if (kind === "half") return { id, icon: "⏸️", title: "Half-time", subtitle: score, accent: "#e3c558" };
  return { id, icon: "🏁", title: "Full-time", subtitle: score, accent: "#c9a86a" };
}

type Phase = "PRE" | "LIVE" | "HT" | "FT";
function phaseOf(m: LiveMatch): Phase {
  if (m.status === "FINISHED") return "FT";
  if (m.status === "IN_PLAY") return m.half && /half-?time/i.test(m.half) ? "HT" : "LIVE";
  return "PRE";
}

// Global live-event ticker — polls the live feed regardless of page and drops a
// toast in from the top for kick-off, goals, cards, half-time and full-time.
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
            // fresh kick-off — purge this match's seen events so a re-run re-fires them
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
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast-drop pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border px-4 py-2.5 backdrop-blur-md"
          style={{ borderColor: t.accent + "66", background: "rgba(13,27,19,0.92)", boxShadow: "0 8px 30px rgba(0,0,0,0.45)" }}
        >
          <span className="text-xl">{t.icon}</span>
          <div className="min-w-0">
            <div className="truncate font-display text-sm text-cream">{t.title}</div>
            <div className="truncate text-[11px] text-muted">{t.subtitle}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
