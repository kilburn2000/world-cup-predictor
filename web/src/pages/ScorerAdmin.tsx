import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getScorerPlayers, setScorerGoals, type AdminScorerPlayer } from "../api.js";
import { getToken } from "../auth.js";
import { flagFor } from "../flags.js";

const COUNTRY: Record<string, string> = {
  POR: "Portugal", ENG: "England", NED: "Netherlands", BRA: "Brazil", ARG: "Argentina",
  SPA: "Spain", FRA: "France", COL: "Colombia", GER: "Germany", NOR: "Norway",
};

export default function ScorerAdmin() {
  const [players, setPlayers] = useState<AdminScorerPlayer[]>([]);
  const [status, setStatus] = useState("");
  const token = getToken();

  const load = () => getScorerPlayers(token).then(setPlayers).catch(() => setStatus("Couldn’t load."));
  useEffect(() => { load(); }, []);

  const save = async (id: number, raw: string) => {
    const manual = raw.trim() === "" ? null : Math.max(0, Math.trunc(Number(raw) || 0));
    try {
      await setScorerGoals(id, manual, token);
      setStatus("Saved.");
      load();
    } catch {
      setStatus("Save failed.");
    }
  };

  return (
    <div className="fl-enter mx-auto max-w-2xl">
      <Link to="/admin" className="text-sm text-muted hover:text-cream">← Admin</Link>
      <h1 className="mt-3 font-display text-3xl text-cream">Top Scorer goals</h1>
      <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
        Goals auto-fill from the live feed. Set an <span className="text-cream">override</span> to correct a player (e.g. the
        feed mis-attributes a same-surname scorer); clear it to fall back to the feed value.
      </p>
      <div className="fl-card mt-5 overflow-hidden">
        <div className="grid grid-cols-[1fr_56px_84px] gap-2 border-b border-line px-4 py-2 text-[9px] uppercase tracking-wide text-muted">
          <div>Player</div><div className="text-center">Feed</div><div className="text-center">Override</div>
        </div>
        {players.map((p) => (
          <div key={p.id} className="grid grid-cols-[1fr_56px_84px] items-center gap-2 border-t border-line px-4 py-2 text-[13px]">
            <div className="flex items-center gap-1.5 text-cream">
              <span>{flagFor(COUNTRY[p.country] ?? p.country)}</span>
              <span>{p.name}</span>
              <span className="text-[10px] text-muted">({p.country})</span>
            </div>
            <div className="text-center font-mono text-muted">{p.feedGoals}</div>
            <input
              type="number"
              min={0}
              defaultValue={p.manualGoals ?? ""}
              placeholder="–"
              onBlur={(e) => save(p.id, e.target.value)}
              className="w-full rounded-md border border-line bg-black/25 py-1 text-center font-mono text-gold outline-none focus:border-gold"
            />
          </div>
        ))}
      </div>
      {status && <p className="mt-3 text-[12px] text-muted">{status}</p>}
    </div>
  );
}
