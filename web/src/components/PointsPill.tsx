import { type LiveTier } from "../api.js";

// Points scored, as a pill. With a tier it takes the matching chip colour (gold
// exact / green points / red none); without one it falls back to a neutral blue.
const TONE: Record<LiveTier, { bg: string; fg: string }> = {
  exact: { bg: "rgba(201,168,106,0.18)", fg: "#c9a86a" },
  result: { bg: "rgba(107,191,134,0.16)", fg: "#6bbf86" },
  diff: { bg: "rgba(107,191,134,0.16)", fg: "#6bbf86" },
  miss: { bg: "rgba(217,83,79,0.16)", fg: "#e08a84" },
};

export default function PointsPill({ points, tier }: { points: number; tier?: LiveTier | null }) {
  const t = tier ? TONE[tier] : { bg: "rgba(122,162,214,0.18)", fg: "#9db8e6" };
  return (
    <span
      className="whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
      style={{ background: t.bg, color: t.fg }}
    >
      {points}{points === 1 ? "pt" : "pts"}
    </span>
  );
}
