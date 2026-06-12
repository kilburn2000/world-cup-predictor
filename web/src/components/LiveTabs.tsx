import { NavLink } from "react-router-dom";

const sub = ({ isActive }: { isActive: boolean }) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (isActive ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

export default function LiveTabs() {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      <NavLink to="/stats/scores" end className={sub}>Today</NavLink>
      <NavLink to="/stats/yesterday" className={sub}>Yesterday</NavLink>
      <NavLink to="/stats/tomorrow" className={sub}>Tomorrow</NavLink>
      <NavLink to="/stats/fixtures" className={sub}>All Fixtures &amp; Results</NavLink>
      <NavLink to="/stats/groups" className={sub}>Groups</NavLink>
      <NavLink to="/stats/knockout" className={sub}>Knockout</NavLink>
    </div>
  );
}
