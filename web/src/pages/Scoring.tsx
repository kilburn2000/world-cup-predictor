import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useScoringConfig, saveScoringConfig, type ScoringConfig } from "../api.js";
import { getToken } from "../auth.js";

function NumberRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const set = (n: number) => onChange(Math.max(0, Math.floor(n || 0)));
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line py-2.5 first:border-t-0">
      <div>
        <div className="text-sm text-cream">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <button onClick={() => set(value - 1)} className="btn-ghost h-[30px] w-[30px] text-base leading-none">−</button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          className="w-12 rounded-md border border-line bg-black/25 py-1.5 text-center font-mono text-base text-gold outline-none focus:border-gold"
        />
        <button onClick={() => set(value + 1)} className="btn-ghost h-[30px] w-[30px] text-base leading-none">+</button>
      </div>
    </div>
  );
}

export default function Scoring() {
  const { data, isLoading } = useScoringConfig();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<ScoringConfig | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  if (isLoading || !cfg)
    return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  const set = (k: keyof ScoringConfig, v: number) => setCfg({ ...cfg, [k]: v });

  async function save() {
    if (!cfg) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await saveScoringConfig(cfg, getToken());
      setStatusOk(true);
      setStatus(`Saved - re-scored ${res.rescored} entries.`);
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (e: any) {
      setStatusOk(false);
      setStatus(`Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fl-enter mx-auto max-w-2xl">
      <div className="mb-2 text-[11px] uppercase tracking-[1.8px]">
        <Link to="/admin" className="text-muted hover:text-cream">← Admin</Link>
      </div>
      <h1 className="font-display text-3xl font-medium text-cream">Scoring settings</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Points stack per game (Team A = home, Team B = away). A perfect 2–0 prediction on a 2–0 result
        = {cfg.outcome} + {cfg.teamGoals} + {cfg.teamGoals} + {cfg.exactBonus} = {cfg.outcome + cfg.teamGoals * 2 + cfg.exactBonus}.
        Saving re-scores everyone instantly.
      </p>

      <div className="fl-card mb-4 p-5">
        <h3 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
          Per match (stacks)
        </h3>
        <NumberRow label="Correct outcome" hint="Team A win / Team B win / draw" value={cfg.outcome} onChange={(v) => set("outcome", v)} />
        <NumberRow label="Called-draw result" hint="you predicted a draw and it drew, but not the exact score" value={cfg.drawOutcome} onChange={(v) => set("drawOutcome", v)} />
        <NumberRow label="Each team's goals correct" hint="awarded separately for Team A and Team B" value={cfg.teamGoals} onChange={(v) => set("teamGoals", v)} />
        <NumberRow label="Exact score bonus" hint="when the whole score is right" value={cfg.exactBonus} onChange={(v) => set("exactBonus", v)} />
      </div>

      <div className="fl-card mb-4 p-5">
        <h3 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
          Knockouts
        </h3>
        <p className="mb-2 text-[12px] text-muted">
          A knockout tie is scored the same as a group game (up to {cfg.outcome + cfg.teamGoals * 2 + cfg.exactBonus}),
          plus the bonus below per correctly-placed team - up to {cfg.outcome + cfg.teamGoals * 2 + cfg.exactBonus + cfg.knockoutTeam * 2} in total.
        </p>
        <NumberRow label="Correct team in position" hint="per team you place in the right slot (2 a tie)" value={cfg.knockoutTeam} onChange={(v) => set("knockoutTeam", v)} />
      </div>

      <button onClick={save} disabled={saving} className="btn-gold w-full py-3.5 text-sm">
        {saving ? "Saving…" : "Save & re-score"}
      </button>
      {status && (
        <p className="mt-3 text-center text-[13px]" style={{ color: statusOk ? "#6bbf86" : "#d9926a" }}>
          {status}
        </p>
      )}
    </div>
  );
}
