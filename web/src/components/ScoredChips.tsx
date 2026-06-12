function Chip({ label, tone }: { label: string; tone: "gold" | "green" | "team" | "red" }) {
  const s = {
    gold: { background: "rgba(201,168,106,0.18)", color: "#c9a86a" },
    green: { background: "rgba(107,191,134,0.16)", color: "#6bbf86" },
    team: { background: "rgba(232,228,216,0.10)", color: "#cfc8b6" },
    red: { background: "rgba(217,83,79,0.16)", color: "#e08a84" },
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
  if (homeOk && awayOk) return <Chip label="Exact" tone="gold" />;
  const resultOk = Math.sign(ph - pa) === Math.sign(hs - as);
  const chips = [];
  if (resultOk) chips.push(<Chip key="r" label="Result" tone="green" />);
  if (homeOk) chips.push(<Chip key="h" label={`${homeCode} ${hs}`} tone="green" />);
  if (awayOk) chips.push(<Chip key="a" label={`${awayCode} ${as}`} tone="green" />);
  if (!chips.length) return <Chip label="No Score" tone="red" />;
  return <div className="flex flex-wrap justify-center gap-1">{chips}</div>;
}
