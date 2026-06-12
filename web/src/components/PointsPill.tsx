// The points a prediction scored, shown as a pill like ScoredChips but in a
// distinct blue so it reads as the reward rather than an outcome chip. Not used
// inside standings tables (those keep a plain points column).
export default function PointsPill({ points }: { points: number }) {
  return (
    <span
      className="whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
      style={{ background: "rgba(122,162,214,0.18)", color: "#9db8e6" }}
    >
      {points} {points === 1 ? "pt" : "pts"}
    </span>
  );
}
