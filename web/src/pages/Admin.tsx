import { Link, useNavigate } from "react-router-dom";
import { logout } from "../auth.js";

const CARDS = [
  {
    to: "/manage",
    icon: "✎",
    title: "Manage Entrants",
    blurb: "Rename entrants (fix any misreads), remove them, or jump to their wallchart. The full editable list.",
  },
  {
    to: "/upload",
    icon: "↑",
    title: "Add Entrant",
    blurb: "Upload a photo (or spreadsheet) of an entry sheet - read automatically with AI, then check and save.",
  },
  {
    to: "/scoring",
    icon: "★",
    title: "Scoring",
    blurb: "Set the points for each outcome - result, goal difference, exact score, knockout progression. Saving re-scores everyone.",
  },
  {
    to: "/scorers",
    icon: "⚽",
    title: "Top Scorer goals",
    blurb: "Goals for the Top Scorer competition auto-fill from the feed; override any player here if the feed gets one wrong.",
  },
  {
    to: "/table",
    icon: "▦",
    title: "Group Tables",
    blurb: "The live actual group standings as results come in.",
  },
];

export default function Admin() {
  const nav = useNavigate();
  return (
    <div className="fl-enter">
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[1.8px] text-gold">Admin</div>
          <h1 className="font-display text-4xl font-medium tracking-tight text-cream">Manage the sweepstake</h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">Add entrants, fix names, and tune the scoring.</p>
        </div>
        <button onClick={() => { logout(); nav("/"); }} className="btn-ghost shrink-0 px-3.5 py-1.5 text-sm">Sign out</button>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to} className="fl-card p-6 transition-colors hover:border-gold">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-gold text-lg text-gold">{c.icon}</div>
            <div className="font-display text-xl text-cream">{c.title}</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{c.blurb}</p>
            <div className="mt-4 text-[13px] font-medium text-gold">Open →</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
