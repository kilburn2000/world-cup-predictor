import { NavLink, useLocation, useNavigate } from "react-router-dom";
import TabSelect from "./TabSelect.js";

const sub = ({ isActive }: { isActive: boolean }) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (isActive ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

const LINKS = [
  { to: "/statistics/scores", label: "Today", end: true },
  { to: "/statistics/yesterday", label: "Yesterday", end: false },
  { to: "/statistics/tomorrow", label: "Tomorrow", end: false },
  { to: "/statistics/fixtures", label: "All Fixtures & Results", end: false },
  { to: "/statistics/groups", label: "Groups", end: false },
  { to: "/statistics/knockout", label: "Knockout", end: false },
];

export default function LiveTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active =
    LINKS.find((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to)))?.to ?? "/statistics/scores";

  return (
    <div className="mb-6">
      <TabSelect
        className="sm:hidden"
        value={active}
        onChange={(v) => navigate(v)}
        options={LINKS.map((l) => ({ value: l.to, label: l.label }))}
      />
      <div className="hidden flex-wrap gap-2 sm:flex">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={sub}>
            {l.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
