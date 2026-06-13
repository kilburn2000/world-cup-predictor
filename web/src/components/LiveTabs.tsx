import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useLiveMatches } from "../api.js";
import TabSelect from "./TabSelect.js";

const sub = ({ isActive }: { isActive: boolean }) =>
  "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
  (isActive ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

const BASE_LINKS = [
  { to: "/statistics/today", label: "Today", end: true },
  { to: "/statistics/yesterday", label: "Yesterday", end: false },
  { to: "/statistics/tomorrow", label: "Tomorrow", end: false },
  { to: "/statistics/fixtures", label: "All Fixtures & Results", end: false },
  { to: "/statistics/groups", label: "Groups", end: false },
  { to: "/statistics/knockout", label: "Knockout", end: false },
];

export default function LiveTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data } = useLiveMatches(0);
  const hasLive = (data ?? []).some((m) => m.status === "IN_PLAY" || m.status === "PAUSED");

  // The "Live Games" tab only appears while a game is in play.
  const links = hasLive ? [{ to: "/statistics/live", label: "Live Games", end: true }, ...BASE_LINKS] : BASE_LINKS;
  const active =
    links.find((l) => (l.end ? pathname === l.to : pathname.startsWith(l.to)))?.to ?? "/statistics/today";

  return (
    <div className="mb-6">
      <TabSelect
        className="sm:hidden"
        value={active}
        onChange={(v) => navigate(v)}
        options={links.map((l) => ({ value: l.to, label: l.label }))}
      />
      <div className="hidden flex-wrap gap-2 sm:flex">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={sub}>
            {l.to === "/statistics/live" && (
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#d9534f] align-middle" style={{ animation: "loadDots 1.2s infinite" }} />
            )}
            {l.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
