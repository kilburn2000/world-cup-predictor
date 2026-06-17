// Chip colours by what the prediction scored: an exact score is green, anything
// else that still scored (right result / a team's goals) is yellow, a miss is red.
function Chip({ label, tone }: { label: string; tone: "exact" | "partial" | "team" | "miss" }) {
  const s = {
    exact: { background: "rgba(107,191,134,0.16)", color: "#6bbf86" },
    partial: { background: "rgba(227,197,88,0.16)", color: "#e3c558" },
    team: { background: "rgba(232,228,216,0.10)", color: "#cfc8b6" },
    miss: { background: "rgba(217,83,79,0.16)", color: "#e08a84" },
  }[tone];
  return <span className="whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px]" style={s}>{label}</span>;
}

// Shows exactly what a prediction scored on: the result, each team's goal count
// they nailed (e.g. "MEX 2"), or "Exact" for the whole score. A pick like 3-1 on
// a 2-0 result gets the outcome but neither team's goals → just the "Result" chip.
export default function ScoredChips({
  pick, hs, as, homeCode, awayCode,
}: { pick: string; hs: number; as: number; homeCode: string; awayCode: string }) {
  const [ph, pa] = pick.split("-").map(Number);
  const homeOk = ph === hs;
  const awayOk = pa === as;
  if (homeOk && awayOk) return <Chip label="EXACT" tone="exact" />;
  const resultOk = Math.sign(ph - pa) === Math.sign(hs - as);
  // Calling a draw (right result, wrong score) is its own thing - worth more and
  // labelled distinctly. A non-exact draw can never match a single team's goals.
  const calledDraw = resultOk && ph === pa && hs === as;
  const parts: string[] = [];
  if (resultOk) parts.push(calledDraw ? "RES (D)" : "RES");
  if (homeOk) parts.push(`${homeCode} ${hs}`);
  if (awayOk) parts.push(`${awayCode} ${as}`);
  // Scored nothing → an explicit red "N/A" chip (rather than a blank), so a miss
  // reads the same way everywhere this component is used.
  if (!parts.length) return <Chip label="N/A" tone="miss" />;
  // combine everything scored into a single chip (e.g. "Result + CZE 1")
  return <Chip label={parts.join(" + ")} tone="partial" />;
}
