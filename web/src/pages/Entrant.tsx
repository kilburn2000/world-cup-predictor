import { useState } from "react";
import { useParams } from "react-router-dom";
import EntrantSummary from "../components/EntrantSummary.js";
import WallchartPredictions from "../components/WallchartPredictions.js";

const TABS = [
  { key: "groups", label: "Predicted Groups" },
  { key: "bracket", label: "Predicted Bracket" },
] as const;

const pill = (active: boolean) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (active ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

export default function Entrant() {
  const { id } = useParams();
  const [tab, setTab] = useState<"groups" | "bracket">("groups");
  return (
    <div className="fl-enter">
      <EntrantSummary id={id!} />
      <div className="mt-7">
        <div className="mb-5 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={pill(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <WallchartPredictions id={id!} view={tab} />
      </div>
    </div>
  );
}
