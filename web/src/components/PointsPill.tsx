import { type LiveTier } from "../api.js";

// Points scored, as a pill. With a tier it takes the matching chip colour (gold
// exact / green points / red none); without one it falls back to a neutral blue.
// Exact = green, anything else that scored = yellow, a miss = red.
const TONE: Record<LiveTier, { bg: string; fg: string }> = {
  exact: { bg: "rgba(107,191,134,0.16)", fg: "#6bbf86" },
  result: { bg: "rgba(227,197,88,0.16)", fg: "#e3c558" },
  diff: { bg: "rgba(227,197,88,0.16)", fg: "#e3c558" },
  miss: { bg: "rgba(217,83,79,0.16)", fg: "#e08a84" },
};

// The chip's text colour for a tier (neutral blue when untiered). Shared so the
// form column can outline a live chip in its own text colour.
export const pillFg = (tier?: LiveTier | null) => (tier ? TONE[tier].fg : "#9db8e6");

export default function PointsPill({ points, tier, compact }: { points: number; tier?: LiveTier | null; compact?: boolean }) {
  const t = tier ? TONE[tier] : { bg: "rgba(122,162,214,0.18)", fg: "#9db8e6" };
  return (
    <span
      className={
        "whitespace-nowrap rounded font-mono font-semibold " +
        (compact ? "px-1 py-0.5 text-[10px]" : "px-1.5 py-0.5 text-[10px]")
      }
      style={{ background: t.bg, color: t.fg }}
    >
      {compact ? points : `${points}${points === 1 ? "pt" : "pts"}`}
    </span>
  );
}
