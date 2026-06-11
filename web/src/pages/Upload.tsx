import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { uploadEntrant, extractPhoto, savePredictions, type ParsedPrediction } from "../api.js";
import { getToken } from "../auth.js";

const SLOT_LABEL = (p: ParsedPrediction) => {
  if (p.kind === "group") return "Group stage";
  const prefix = (p.slot ?? "").split("-")[0];
  return ({ R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", THIRD: "Third place", FINAL: "Final" } as Record<string, string>)[prefix] ?? "Knockout";
};

const cell = "rounded-md border border-line bg-black/20 px-2 py-1 text-cream outline-none focus:border-gold";

export default function Upload() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [preds, setPreds] = useState<ParsedPrediction[] | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["entrants"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
  };
  const say = (msg: string, ok = false) => { setStatus(msg); setStatusOk(ok); };

  async function onExtract(file: File) {
    setBusy(true);
    say("Reading the photo…");
    try {
      const r = await extractPhoto(file, getToken());
      setName(r.name ?? "");
      setPreds(r.predictions);
      setUnresolved(r.unresolved);
      say(`Read ${r.predictions.length} predictions — check and save below.`, true);
    } catch (e: any) {
      say(`Extract failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!preds || !name.trim()) return;
    setBusy(true);
    say("Saving…");
    try {
      const r = await savePredictions(name.trim(), preds, getToken());
      say(`Saved ${r.entrant}: ${r.groupPredictions} group + ${r.knockoutPredictions} knockout.`, true);
      setPreds(null);
      setName("");
      refresh();
    } catch (e: any) {
      say(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSpreadsheet(file: File, who: string) {
    setBusy(true);
    say("Importing spreadsheet…");
    try {
      const r = await uploadEntrant(who, file, getToken());
      say(`Imported ${r.entrant}: ${r.groupPredictions} group + ${r.knockoutPredictions} knockout.`, true);
      refresh();
    } catch (e: any) {
      say(`Failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const editRow = (i: number, patch: Partial<ParsedPrediction>) => setPreds((p) => p!.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const sections: { label: string; rows: { p: ParsedPrediction; i: number }[] }[] = [];
  preds?.forEach((p, i) => {
    const label = SLOT_LABEL(p);
    let s = sections.find((x) => x.label === label);
    if (!s) sections.push((s = { label, rows: [] }));
    s.rows.push({ p, i });
  });
  const bad = new Set(unresolved.map((u) => u.toLowerCase()));

  return (
    <div className="fl-enter mx-auto max-w-2xl">
      <div className="mb-2 text-[11px] uppercase tracking-[1.8px] text-gold">
        <Link to="/admin" className="text-muted hover:text-cream">← Admin</Link>
      </div>
      <h1 className="text-center font-display text-3xl font-medium text-cream">Add an entrant</h1>
      <p className="mx-auto mb-6 mt-2 max-w-lg text-center text-sm leading-relaxed text-muted">
        Upload a <strong className="text-cream">photo</strong> of the printed sheet — it’s read automatically, then you check and save.
      </p>

      <div className="fl-card p-6">
        {!preds && (
          <div className="flex flex-col gap-4">
            <label className="block cursor-pointer rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:bg-gold-soft" style={{ borderColor: "rgba(201,168,106,0.42)" }}>
              <div className="mx-auto flex h-[46px] w-[46px] items-center justify-center rounded-full border border-gold text-xl text-gold">↑</div>
              <div className="mt-2.5 text-sm text-cream">{busy ? "Working…" : <>Choose a <span className="text-gold">photo</span> of the entry sheet</>}</div>
              <div className="mt-1 text-[11.5px] text-muted">.jpg · read automatically with AI</div>
              <input type="file" accept="image/*" className="hidden" disabled={busy}
                onChange={(e) => e.target.files?.[0] && onExtract(e.target.files[0])} />
            </label>

            <details>
              <summary className="cursor-pointer text-[12.5px] text-muted hover:text-cream">Or import an .xlsx spreadsheet</summary>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input id="ssname" placeholder="entrant name" className={cell + " text-sm"} />
                <input type="file" accept=".xlsx" className="text-xs text-muted" disabled={busy}
                  onChange={(e) => {
                    const who = (document.getElementById("ssname") as HTMLInputElement).value.trim();
                    if (e.target.files?.[0] && who) onSpreadsheet(e.target.files[0], who);
                    else say("Enter a name first.");
                  }} />
              </div>
            </details>
          </div>
        )}

        {preds && (
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-muted">Entrant name (detected)</div>
            <input value={name} onChange={(e) => setName(e.target.value)} className="fl-input mb-4 font-medium" />

            {unresolved.length > 0 && (
              <p className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "rgba(217,146,106,0.4)", background: "rgba(217,146,106,0.1)", color: "#d9926a" }}>
                ⚠️ Unrecognised team names — fix the spelling so they score: {unresolved.join(", ")}
              </p>
            )}

            {sections.map((s) => (
              <div key={s.label} className="mb-4">
                <h4 className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-gold">{s.label}</h4>
                <div className="space-y-1">
                  {s.rows.map(({ p, i }) => (
                    <div key={i} className="flex items-center gap-1.5 text-[13px]">
                      <input value={p.home} onChange={(e) => editRow(i, { home: e.target.value })}
                        className={"flex-1 text-right " + cell + (bad.has(p.home.toLowerCase()) ? " !border-down" : "")} />
                      <input type="number" min={0} value={p.homeGoals} onChange={(e) => editRow(i, { homeGoals: Number(e.target.value) })} className={"w-10 text-center font-mono " + cell} />
                      <span className="text-muted">–</span>
                      <input type="number" min={0} value={p.awayGoals} onChange={(e) => editRow(i, { awayGoals: Number(e.target.value) })} className={"w-10 text-center font-mono " + cell} />
                      <input value={p.away} onChange={(e) => editRow(i, { away: e.target.value })}
                        className={"flex-1 " + cell + (bad.has(p.away.toLowerCase()) ? " !border-down" : "")} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="sticky bottom-0 -mx-6 flex gap-2 border-t border-line bg-pitch-900/90 px-6 py-3 backdrop-blur">
              <button onClick={onSave} disabled={busy || !name.trim()} className="btn-gold px-4 py-2.5 text-sm">{busy ? "Saving…" : "Save entrant"}</button>
              <button onClick={() => { setPreds(null); setName(""); setStatus(null); }} className="btn-ghost px-4 py-2.5 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {status && <p className="mt-4 text-center text-[13px]" style={{ color: statusOk ? "#6bbf86" : "#d9926a" }}>{status}</p>}
      </div>
    </div>
  );
}
