import { Link, useParams } from "react-router-dom";
import { useMe } from "../auth.js";
import { usePhasesStarted } from "../api.js";
import WallchartPredictions from "../components/WallchartPredictions.js";

const tabCls = (active: boolean) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (active ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

export default function MyPredictions() {
  const { data: me } = useMe();
  const { tab } = useParams();
  const { data: phases } = usePhasesStarted();

  // Once the group stage is over, the bracket is the more useful default view.
  const groupStageDone = !!(phases?.week1Done && phases?.week2Done && phases?.week3Done);
  const view: "groups" | "bracket" =
    tab === "bracket" ? "bracket" : tab === "groups" ? "groups" : groupStageDone ? "bracket" : "groups";

  return (
    <div className="fl-enter">
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Your entry</div>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">My Predictions</h1>
      </div>

      <div className="mb-6 flex gap-2">
        <Link to="/my-predictions/groups" className={tabCls(view === "groups")}>Group Stage</Link>
        <Link to="/my-predictions/bracket" className={tabCls(view === "bracket")}>Predicted Bracket</Link>
      </div>

      {me?.entrantId ? (
        <WallchartPredictions id={me.entrantId} view={view} />
      ) : (
        <p className="text-sm text-muted">Your account isn’t linked to an entry yet.</p>
      )}
    </div>
  );
}
