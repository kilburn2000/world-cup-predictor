import { useEffect, useRef, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import Leaderboard from "./pages/Leaderboard.js";
import LiveScores from "./pages/LiveScores.js";
import Fixtures from "./pages/Fixtures.js";
import FixtureDetail from "./pages/FixtureDetail.js";
import WCGroups from "./pages/WCGroups.js";
import WCKnockout from "./pages/WCKnockout.js";
import LiveTable from "./pages/LiveTable.js";
import Scoring from "./pages/Scoring.js";
import Upload from "./pages/Upload.js";
import Entrant from "./pages/Entrant.js";
import Players from "./pages/Players.js";
import Prizes from "./pages/Prizes.js";
import Admin from "./pages/Admin.js";
import ManageEntrants from "./pages/ManageEntrants.js";
import EditPredictions from "./pages/EditPredictions.js";
import Loader from "./components/Loader.js";
import LiveToasts from "./components/LiveToasts.js";
import AuthGate from "./components/AuthGate.js";

// Text nav item: gold text + short gold underline when active (matches design).
const tab = ({ isActive }: { isActive: boolean }) =>
  "shrink-0 whitespace-nowrap border-b-2 pb-0.5 text-sm transition-colors " +
  (isActive ? "border-gold font-semibold text-cream" : "border-transparent text-muted hover:text-cream");

// Admin: a gold pill that goes hollow (outline only) on hover.
const adminBtn = () =>
  "shrink-0 whitespace-nowrap rounded-lg border border-gold bg-gold px-3.5 py-1.5 text-sm font-semibold " +
  "text-pitch-950 transition-colors hover:bg-transparent hover:text-gold";

function labelFor(pathname: string): string {
  if (pathname === "/") return "Live Standings";
  if (pathname.startsWith("/stats")) return "Stats";
  if (pathname.startsWith("/players")) return "Players";
  if (pathname.startsWith("/prizes")) return "Prizes";
  if (pathname.startsWith("/table")) return "Group Tables";
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/manage")) return "Manage Entrants";
  if (pathname.startsWith("/upload")) return "Add Entrant";
  if (pathname.startsWith("/scoring")) return "Scoring";
  if (pathname.endsWith("/edit")) return "Edit predictions";
  if (pathname.startsWith("/entrant")) return "Entrant";
  return "Whitey’s World Cup Sweepstake";
}

export default function App() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("Whitey’s World Cup Sweepstake");
  const firstLoad = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    setLabel(labelFor(location.pathname));
    setLoading(true);
    const t = setTimeout(() => setLoading(false), 2000);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <div className="min-h-screen pb-20">
      <LiveToasts />
      <header className="sticky top-0 z-30 border-b border-line bg-pitch-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <NavLink to="/" className="flex items-center gap-3">
            <img src="/whiteys-crest.png" alt="" className="h-[92px] w-[92px] shrink-0 object-contain sm:h-28 sm:w-28" />
            <div>
              <div className="font-display text-lg font-medium leading-none text-cream sm:text-xl whitespace-nowrap">World Cup 2026</div>
              <div className="mt-[3px] text-[10px] uppercase tracking-[1.8px] text-muted whitespace-nowrap">Sweepstake</div>
            </div>
          </NavLink>
          <nav className="-mx-4 flex items-center gap-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <NavLink to="/" className={tab} end>Standings</NavLink>
            <NavLink to="/stats/scores" className={tab({ isActive: location.pathname.startsWith("/stats") })}>Stats</NavLink>
            <NavLink to="/prizes" className={tab}>Prizes</NavLink>
            <NavLink to="/admin" className={adminBtn}>Admin</NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Leaderboard />} />
          <Route path="/stats" element={<Navigate to="/stats/scores" replace />} />
          <Route path="/stats/scores" element={<LiveScores />} />
          <Route path="/stats/fixtures" element={<Fixtures />} />
          <Route path="/stats/fixtures/:id" element={<FixtureDetail />} />
          <Route path="/stats/groups" element={<WCGroups />} />
          <Route path="/stats/knockout" element={<WCKnockout />} />
          <Route path="/live/*" element={<Navigate to="/stats/scores" replace />} />
          <Route path="/players" element={<Players />} />
          <Route path="/prizes" element={<Prizes />} />
          <Route path="/entrant/:id" element={<Entrant />} />
          <Route path="/entrant/:id/edit" element={<AuthGate><EditPredictions /></AuthGate>} />
          <Route path="/table" element={<LiveTable />} />
          <Route path="/admin" element={<AuthGate><Admin /></AuthGate>} />
          <Route path="/upload" element={<AuthGate><Upload /></AuthGate>} />
          <Route path="/scoring" element={<AuthGate><Scoring /></AuthGate>} />
          <Route path="/manage" element={<AuthGate><ManageEntrants /></AuthGate>} />
        </Routes>
      </main>

      {loading && <Loader label={label} />}
    </div>
  );
}
