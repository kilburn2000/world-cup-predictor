import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useMe, logout } from "./auth.js";
import Login from "./pages/Login.js";
import Home from "./pages/Home.js";
import Leaderboard from "./pages/Leaderboard.js";
import LiveScores from "./pages/LiveScores.js";
import Fixtures from "./pages/Fixtures.js";
import FixtureDetail from "./pages/FixtureDetail.js";
import WCGroups from "./pages/WCGroups.js";
import WCKnockout from "./pages/WCKnockout.js";
import LiveTable from "./pages/LiveTable.js";
import Scoring from "./pages/Scoring.js";
import ScorerAdmin from "./pages/ScorerAdmin.js";
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

// Mobile dropdown row: full-width tappable item.
const mobileItem = ({ isActive }: { isActive: boolean }) =>
  "rounded-lg px-3 py-2.5 text-sm transition-colors " +
  (isActive ? "bg-gold-soft font-semibold text-cream" : "text-muted hover:bg-gold-soft hover:text-cream");

function labelFor(pathname: string): string {
  if (pathname === "/") return "Whitey’s World Cup Sweepstake";
  if (pathname.startsWith("/standings")) return "Live Standings";
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("Whitey’s World Cup Sweepstake");
  const [menuOpen, setMenuOpen] = useState(false);
  const firstLoad = useRef(true);

  const handleLogout = async () => {
    await logout();
    await qc.invalidateQueries({ queryKey: ["me"] });
    navigate("/");
  };

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1100);
    return () => clearTimeout(t);
  }, []);

  // Flip to the loading state *before* the browser paints the new route, so the
  // overlay covers the incoming page instead of the page flashing in first.
  useLayoutEffect(() => {
    setMenuOpen(false);
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
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="relative flex items-center justify-between sm:gap-4">
            <NavLink to="/" className="flex items-center gap-3">
              <img src="/whiteys-crest.png" alt="" className="h-[92px] w-[92px] shrink-0 object-contain sm:h-28 sm:w-28" />
              <div>
                <div className="font-display text-lg font-medium leading-none text-cream sm:text-xl whitespace-nowrap">Whitey’s World Cup</div>
                <div className="mt-[3px] text-[10px] uppercase tracking-[1.8px] text-muted whitespace-nowrap">2026 Sweepstake</div>
              </div>
            </NavLink>

            {/* Mobile: burger toggle. */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="absolute right-0 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-lg border border-gold bg-gold-soft text-gold transition-colors hover:bg-gold hover:text-pitch-950 sm:hidden"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>

            {/* Desktop: inline nav. */}
            <nav className="hidden items-center gap-5 sm:flex">
              <NavLink to="/" className={tab({ isActive: location.pathname === "/" })}>Home</NavLink>
              <NavLink to="/standings/overall" className={tab({ isActive: location.pathname.startsWith("/standings") })}>Standings</NavLink>
              <NavLink to="/prizes" className={tab}>Prizes</NavLink>
              <NavLink to="/stats/scores" className={tab({ isActive: location.pathname.startsWith("/stats") })}>Stats</NavLink>
              {me?.entrantId && <NavLink to={`/entrant/${me.entrantId}`} className={tab}>My predictions</NavLink>}
              {me?.isAdmin && <NavLink to="/admin" className={adminBtn}>Admin</NavLink>}
              {me ? (
                <button onClick={handleLogout} className={tab({ isActive: false })}>Log out</button>
              ) : (
                <NavLink to="/login" className={adminBtn}>Log in</NavLink>
              )}
            </nav>
          </div>

          {/* Mobile: dropdown nav panel. */}
          {menuOpen && (
            <nav className="mt-3 flex flex-col gap-1 border-t border-line pt-3 sm:hidden">
              <NavLink to="/" className={() => mobileItem({ isActive: location.pathname === "/" })}>Home</NavLink>
              <NavLink to="/standings/overall" className={() => mobileItem({ isActive: location.pathname.startsWith("/standings") })}>Standings</NavLink>
              <NavLink to="/prizes" className={mobileItem}>Prizes</NavLink>
              <NavLink to="/stats/scores" className={() => mobileItem({ isActive: location.pathname.startsWith("/stats") })}>Stats</NavLink>
              {me?.entrantId && <NavLink to={`/entrant/${me.entrantId}`} className={mobileItem}>My predictions</NavLink>}
              {me?.isAdmin && <NavLink to="/admin" className={mobileItem}>Admin</NavLink>}
              {me ? (
                <button onClick={handleLogout} className="rounded-lg px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-gold-soft hover:text-cream">Log out</button>
              ) : (
                <NavLink to="/login" className={mobileItem}>Log in</NavLink>
              )}
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/standings" element={<Navigate to="/standings/overall" replace />} />
          <Route path="/standings/:tab" element={<Leaderboard />} />
          <Route path="/stats" element={<Navigate to="/stats/scores" replace />} />
          <Route path="/stats/scores" element={<LiveScores day={0} />} />
          <Route path="/stats/yesterday" element={<LiveScores day={-1} />} />
          <Route path="/stats/tomorrow" element={<LiveScores day={1} />} />
          <Route path="/stats/fixtures" element={<Fixtures />} />
          <Route path="/stats/fixtures/:id" element={<FixtureDetail />} />
          <Route path="/stats/groups" element={<WCGroups />} />
          <Route path="/stats/knockout" element={<WCKnockout />} />
          <Route path="/live/*" element={<Navigate to="/stats/scores" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/players" element={<Players />} />
          <Route path="/prizes" element={<Prizes />} />
          <Route path="/entrant/:id" element={<Entrant />} />
          <Route path="/entrant/:id/edit" element={<AuthGate admin><EditPredictions /></AuthGate>} />
          <Route path="/table" element={<LiveTable />} />
          <Route path="/admin" element={<AuthGate admin><Admin /></AuthGate>} />
          <Route path="/upload" element={<AuthGate admin><Upload /></AuthGate>} />
          <Route path="/scoring" element={<AuthGate admin><Scoring /></AuthGate>} />
          <Route path="/scorers" element={<AuthGate admin><ScorerAdmin /></AuthGate>} />
          <Route path="/manage" element={<AuthGate admin><ManageEntrants /></AuthGate>} />
        </Routes>
      </main>

      {loading && <Loader label={label} />}
    </div>
  );
}
