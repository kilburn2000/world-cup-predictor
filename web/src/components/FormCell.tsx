import { useState } from "react";
import { createPortal } from "react-dom";
import { type FormGame } from "../api.js";
import { flagFor } from "../flags.js";
import PointsPill from "./PointsPill.js";
import ScoredChips from "./ScoredChips.js";

// A row of colour-coded points chips for an entrant's recent games (one per game,
// oldest first). Hovering a chip pops a tooltip (portal'd to body so a card's
// overflow-hidden can't clip it) with the fixture, the prediction vs the final
// score, and the outcome chip. Shared by the standings tables and the dashboard.
export default function FormCell({ games, className = "hidden items-center justify-center gap-0.5 sm:flex" }: { games: FormGame[]; className?: string }) {
  const [tip, setTip] = useState<{ g: FormGame; x: number; y: number } | null>(null);
  return (
    <div className={className}>
      {games.length ? games.map((g, i) => (
        <span
          key={i}
          className="inline-flex"
          onMouseEnter={(ev) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setTip({ g, x: r.left + r.width / 2, y: r.top }); }}
          onMouseLeave={() => setTip(null)}
        >
          <PointsPill points={g.points} tier={g.tier} compact />
        </span>
      )) : <span className="font-mono text-[11px] text-muted">–</span>}
      {tip && createPortal(
        <div className="pointer-events-none fixed z-[60]" style={{ left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)" }}>
          <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-[#0f120e] px-2.5 py-2 shadow-xl">
            <span className="font-mono text-[11px] text-cream">{flagFor(tip.g.homeName)} {tip.g.home} v {tip.g.away} {flagFor(tip.g.awayName)}</span>
            <span className="font-mono text-[10px] text-muted">Pred {tip.g.predHome}-{tip.g.predAway} · Final {tip.g.hs}-{tip.g.as}</span>
            <ScoredChips pick={`${tip.g.predHome}-${tip.g.predAway}`} hs={tip.g.hs} as={tip.g.as} homeCode={tip.g.home} awayCode={tip.g.away} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
