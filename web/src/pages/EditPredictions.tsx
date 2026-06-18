import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEditWallchart, savePredictions, updateEntrant, type EditGroup, type EditKnockout, type ParsedPrediction } from "../api.js";
import { getToken } from "../auth.js";

const cell = "rounded-md border border-line bg-black/20 px-2 py-1 text-cream outline-none focus:border-gold";
const numCell = "w-10 text-center font-mono " + cell;

function num(v: number | null) {
  return v === null || v === undefined ? "" : String(v);
}
function parseNum(s: string): number | null {
  return s === "" ? null : Math.max(0, Math.floor(Number(s) || 0));
}

export default function EditPredictions() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useEditWallchart(id!);
  const [groups, setGroups] = useState<EditGroup[]>([]);
  const [knockout, setKnockout] = useState<EditKnockout[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState(false);
  const [busy, setBusy] = useState(false);
  // account editor
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acct, setAcct] = useState<{ msg: string; ok: boolean } | null>(null);
  const [acctBusy, setAcctBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setGroups(data.groups);
      setKnockout(data.knockout);
      setName(data.entrant.name);
      setEmail(data.entrant.email ?? "");
    }
  }, [data]);

  async function saveAccount() {
    if (!data) return;
    const patch: { name?: string; email?: string; password?: string } = {};
    if (name.trim() && name.trim() !== data.entrant.name) patch.name = name.trim();
    if (email.trim() !== (data.entrant.email ?? "")) patch.email = email.trim();
    if (password) patch.password = password;
    if (!Object.keys(patch).length) { setAcct({ msg: "Nothing to save.", ok: false }); return; }
    setAcctBusy(true);
    setAcct(null);
    try {
      await updateEntrant(data.entrant.id, patch, getToken());
      setPassword("");
      setAcct({ msg: "Account updated.", ok: true });
      qc.invalidateQueries({ queryKey: ["edit", id] });
      qc.invalidateQueries({ queryKey: ["entrants"] });
    } catch (e) {
      setAcct({ msg: e instanceof Error ? e.message : "Failed to update.", ok: false });
    } finally {
      setAcctBusy(false);
    }
  }

  if (isLoading || !data) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;

  const setG = (i: number, patch: Partial<EditGroup>) => setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setK = (i: number, patch: Partial<EditKnockout>) => setKnockout((k) => k.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const groupBlanks = groups.filter((g) => g.homeGoals === null || g.awayGoals === null).length;
  const koBlanks = knockout.filter((k) => !k.home || !k.away || k.homeGoals === null || k.awayGoals === null).length;

  async function save() {
    setBusy(true);
    setStatus(null);
    const preds: ParsedPrediction[] = [];
    for (const g of groups) {
      if (g.homeGoals !== null && g.awayGoals !== null) preds.push({ kind: "group", home: g.home, away: g.away, homeGoals: g.homeGoals, awayGoals: g.awayGoals });
    }
    for (const k of knockout) {
      if (k.home && k.away && k.homeGoals !== null && k.awayGoals !== null)
        preds.push({ kind: "knockout", slot: k.slot, home: k.home, away: k.away, homeGoals: k.homeGoals, awayGoals: k.awayGoals });
    }
    try {
      const r = await savePredictions(data!.entrant.name, preds, getToken());
      setStatusOk(true);
      setStatus(`Saved - ${r.groupPredictions + r.knockoutPredictions}/104 predictions.`);
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["entrants"] });
      qc.invalidateQueries({ queryKey: ["edit", id] });
    } catch (e: any) {
      setStatusOk(false);
      setStatus(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // group rows by group letter / knockout round label, preserving order + index
  const groupSecs: { label: string; rows: { g: EditGroup; i: number }[] }[] = [];
  groups.forEach((g, i) => {
    const label = `Group ${g.group}`;
    let s = groupSecs.find((x) => x.label === label);
    if (!s) groupSecs.push((s = { label, rows: [] }));
    s.rows.push({ g, i });
  });
  const koSecs: { label: string; rows: { k: EditKnockout; i: number }[] }[] = [];
  knockout.forEach((k, i) => {
    let s = koSecs.find((x) => x.label === k.label);
    if (!s) koSecs.push((s = { label: k.label, rows: [] }));
    s.rows.push({ k, i });
  });

  return (
    <div className="fl-enter mx-auto max-w-2xl">
      <div className="mb-2 text-[11px] uppercase tracking-[1.8px]">
        <Link to="/manage" className="text-muted hover:text-cream">← Manage entrants</Link>
      </div>
      <h1 className="font-display text-3xl font-medium text-cream">Edit · {data.entrant.name}</h1>
      <p className="mb-5 mt-1 text-[13px] text-muted">
        Fill any blanks the import missed. Group fixtures are fixed - just enter the score.{" "}
        {(groupBlanks > 0 || koBlanks > 0) && (
          <span className="text-down">{groupBlanks} group + {koBlanks} knockout still blank.</span>
        )}
      </p>

      {/* account: name + login email + password */}
      <div className="fl-card mb-5 p-5">
        <h4 className="mb-3 text-[10px] uppercase tracking-[1.5px] text-gold">Account</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={cell + " w-full py-2"} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">Login email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="none set" className={cell + " w-full py-2"} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-muted">New password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="leave blank to keep current" autoComplete="new-password" className={cell + " w-full py-2"} />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={saveAccount} disabled={acctBusy} className="rounded-lg border border-gold bg-gold-soft px-4 py-2 text-sm text-cream transition-colors hover:bg-gold/20 disabled:opacity-50">
            {acctBusy ? "Saving…" : "Save account"}
          </button>
          {acct && <span className="text-[13px]" style={{ color: acct.ok ? "#6bbf86" : "#d9926a" }}>{acct.msg}</span>}
        </div>
      </div>

      <div className="fl-card p-5">
        {groupSecs.map((s) => (
          <div key={s.label} className="mb-4">
            <h4 className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-gold">{s.label}</h4>
            <div className="space-y-1">
              {s.rows.map(({ g, i }) => {
                const blank = g.homeGoals === null || g.awayGoals === null;
                return (
                  <div key={g.matchId} className={"flex items-center gap-1.5 text-[13px] " + (blank ? "rounded-md bg-down/5 px-1" : "")}>
                    <span className="flex-1 truncate text-right text-cream">{g.home}</span>
                    <input value={num(g.homeGoals)} onChange={(e) => setG(i, { homeGoals: parseNum(e.target.value) })} placeholder="–" className={numCell + (blank ? " border-down" : "")} />
                    <span className="text-muted">–</span>
                    <input value={num(g.awayGoals)} onChange={(e) => setG(i, { awayGoals: parseNum(e.target.value) })} placeholder="–" className={numCell + (blank ? " border-down" : "")} />
                    <span className="flex-1 truncate text-cream">{g.away}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {koSecs.map((s) => (
          <div key={s.label} className="mb-4">
            <h4 className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-gold">{s.label}</h4>
            <div className="space-y-1">
              {s.rows.map(({ k, i }) => {
                const blank = !k.home || !k.away || k.homeGoals === null || k.awayGoals === null;
                return (
                  <div key={k.slot} className={"flex items-center gap-1.5 text-[13px] " + (blank ? "rounded-md bg-down/5 px-1" : "")}>
                    <input value={k.home ?? ""} onChange={(e) => setK(i, { home: e.target.value })} placeholder="team" className={"flex-1 text-right " + cell + (!k.home ? " border-down" : "")} />
                    <input value={num(k.homeGoals)} onChange={(e) => setK(i, { homeGoals: parseNum(e.target.value) })} placeholder="–" className={numCell} />
                    <span className="text-muted">–</span>
                    <input value={num(k.awayGoals)} onChange={(e) => setK(i, { awayGoals: parseNum(e.target.value) })} placeholder="–" className={numCell} />
                    <input value={k.away ?? ""} onChange={(e) => setK(i, { away: e.target.value })} placeholder="team" className={"flex-1 " + cell + (!k.away ? " border-down" : "")} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-line bg-pitch-900/90 px-5 py-3 backdrop-blur">
          <button onClick={save} disabled={busy} className="btn-gold px-4 py-2.5 text-sm">{busy ? "Saving…" : "Save predictions"}</button>
          <button onClick={() => nav("/manage")} className="btn-ghost px-4 py-2.5 text-sm">Back</button>
          {status && <span className="ml-2 text-[13px]" style={{ color: statusOk ? "#6bbf86" : "#d9926a" }}>{status}</span>}
        </div>
      </div>
    </div>
  );
}
