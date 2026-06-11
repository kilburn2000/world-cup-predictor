import { NavLink } from "react-router-dom";

const sub = ({ isActive }: { isActive: boolean }) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (isActive ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

export default function LiveTabs() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <NavLink to="/live/scores" end className={sub}>Live Scores</NavLink>
      <NavLink to="/live/fixtures" className={sub}>Fixtures</NavLink>
      <NavLink to="/live/groups" className={sub}>Groups</NavLink>
      <NavLink to="/live/knockout" className={sub}>Knockout</NavLink>
    </div>
  );
}
