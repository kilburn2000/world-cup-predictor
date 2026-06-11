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
      setStatus(`Saved — re-scored ${res.rescored} entries.`);
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
        Points awarded for each outcome (defaults mirror the entry spreadsheet). Saving re-scores
        everyone instantly.
      </p>

      <div className="fl-card mb-4 p-5">
        <h3 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
          Group match (stack)
        </h3>
        <NumberRow label="Correct outcome (W/D/L)" value={cfg.outcome} onChange={(v) => set("outcome", v)} />
        <NumberRow label="Correct goal difference" value={cfg.goalDifference} onChange={(v) => set("goalDifference", v)} />
        <NumberRow label="Exact score" value={cfg.exact} onChange={(v) => set("exact", v)} />
        <NumberRow label="“Many goals” approximation" hint="close guess on a high-scoring game" value={cfg.manyGoals} onChange={(v) => set("manyGoals", v)} />
      </div>

      <div className="fl-card mb-4 p-5">
        <h3 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-gold">
          Knockouts
        </h3>
        <NumberRow label="Correct team in a round" hint="per team reaching each knockout round" value={cfg.knockoutTeam} onChange={(v) => set("knockoutTeam", v)} />
        <NumberRow label="Final / Third-place winner" value={cfg.finalThird} onChange={(v) => set("finalThird", v)} />
      </div>

      <details className="fl-card mb-4 p-5">
        <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-[1.5px] text-muted">
          “Many goals” thresholds
        </summary>
        <div className="mt-2">
          <NumberRow label="High-scoring draw min (each)" value={cfg.manyGoalsDrawMin} onChange={(v) => set("manyGoalsDrawMin", v)} />
          <NumberRow label="Large goal-difference min" value={cfg.largeGdMin} onChange={(v) => set("largeGdMin", v)} />
          <NumberRow label="Large total-goals min" value={cfg.largeSumMin} onChange={(v) => set("largeSumMin", v)} />
        </div>
      </details>

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
