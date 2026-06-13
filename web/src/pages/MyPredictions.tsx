import { useMe } from "../auth.js";
import WallchartPredictions from "../components/WallchartPredictions.js";

export default function MyPredictions() {
  const { data: me } = useMe();
  return (
    <div className="fl-enter">
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Your entry</div>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">My Predictions</h1>
      </div>
      {me?.entrantId ? (
        <WallchartPredictions id={me.entrantId} />
      ) : (
        <p className="text-sm text-muted">Your account isn’t linked to an entry yet.</p>
      )}
    </div>
  );
}
