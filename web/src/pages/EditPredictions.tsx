import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEditWallchart, savePredictions, updateEntrant, type EditGroup, type EditKnockout, type ParsedPrediction } from "../api.js";
import { getToken } from "../auth.js";
import { flagFor } from "../flags.js";

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
  // profile editor (name + login email)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [prof, setProf] = useState<{ msg: string; ok: boolean } | null>(null);
  const [profBusy, setProfBusy] = useState(false);
  // password editor
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pw, setPw] = useState<{ msg: string; ok: boolean } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setGroups(data.groups);
      setKnockout(data.knockout);
      setName(data.entrant.name);
      setEmail(data.entrant.email ?? "");
    }
  }, [data]);

  async function saveProfile() {
    if (!data) return;
    const patch: { name?: string; email?: string } = {};
    if (name.trim() && name.trim() !== data.entrant.name) patch.name = name.trim();
    if (email.trim() !== (data.entrant.email ?? "")) patch.email = email.trim();
    if (!Object.keys(patch).length) { setProf({ msg: "No changes to save.", ok: false }); return; }
    setProfBusy(true);
    setProf(null);
    try {
      await updateEntrant(data.entrant.id, patch, getToken());
      setProf({ msg: "Profile updated.", ok: true });
      qc.invalidateQueries({ queryKey: ["edit", id] });
      qc.invalidateQueries({ queryKey: ["entrants"] });
    } catch (e) {
      setProf({ msg: e instanceof Error ? e.message : "Failed to update.", ok: false });
    } finally {
      setProfBusy(false);
    }
  }

  async function savePassword() {
    if (!data) return;
    if (password.length < 6) { setPw({ msg: "Password must be at least 6 characters.", ok: false }); return; }
    if (password !== confirm) { setPw({ msg: "Passwords don't match.", ok: false }); return; }
    setPwBusy(true);
    setPw(null);
    try {
      await updateEntrant(data.entrant.id, { password }, getToken());
      setPassword("");
      setConfirm("");
      setPw({ msg: "Password changed.", ok: true });
    } catch (e) {
      setPw({ msg: e instanceof Error ? e.message : "Failed to change password.", ok: false });
    } finally {
      setPwBusy(false);
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

  const inits = data.entrant.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const filled = 104 - groupBlanks - koBlanks;
  const complete = groupBlanks === 0 && koBlanks === 0;

  return (
    <div className="fl-enter mx-auto max-w-2xl">
      <div className="mb-2 text-[11px] uppercase tracking-[1.8px]">
        <Link to="/manage" className="text-muted hover:text-cream">← Manage entrants</Link>
      </div>

      {/* header */}
      <div className="fl-card mb-6 flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-gold font-mono text-lg font-semibold text-gold">
          {inits}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[1.5px] text-gold">Edit entrant</div>
          <h1 className="mt-0.5 font-display text-3xl font-medium tracking-tight text-cream">{data.entrant.name}</h1>
          <div className="mt-1 text-[12px] text-muted">{data.entrant.email ?? "No login email set"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[1.5px] text-muted">Predictions</div>
          <div className={"font-mono text-2xl " + (complete ? "text-up" : "text-down")}>{filled}<span className="text-muted">/104</span></div>
        </div>
      </div>

      {/* account: name + login email */}
      <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-gold">Account</h2>
      <div className="fl-card mb-7 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[1px] text-muted">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="fl-input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[1px] text-muted">Login email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="none set" className="fl-input" />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={saveProfile} disabled={profBusy} className="btn-gold px-4 py-2.5 text-sm">{profBusy ? "Saving…" : "Save account"}</button>
          {prof && <span className="text-[13px]" style={{ color: prof.ok ? "#6bbf86" : "#d9926a" }}>{prof.msg}</span>}
        </div>
      </div>

      {/* password: separate card */}
      <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-gold">Password</h2>
      <div className="fl-card mb-7 p-5">
        <p className="mb-4 text-[12px] text-muted">Set a new login password for this entrant. They'll use their email and this password to sign in.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[1px] text-muted">New password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="at least 6 characters" autoComplete="new-password" className="fl-input" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[1px] text-muted">Confirm password</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="re-enter password" autoComplete="new-password" className="fl-input" />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={savePassword} disabled={pwBusy || !password} className="btn-gold px-4 py-2.5 text-sm">{pwBusy ? "Saving…" : "Change password"}</button>
          {pw && <span className="text-[13px]" style={{ color: pw.ok ? "#6bbf86" : "#d9926a" }}>{pw.msg}</span>}
        </div>
      </div>

      {/* predictions */}
      <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-gold">Predictions</h2>
      <p className="mb-3 text-[13px] text-muted">
        Fill any blanks the import missed. Group fixtures are fixed - just enter the score.{" "}
        {(groupBlanks > 0 || koBlanks > 0) && (
          <span className="text-down">{groupBlanks} group + {koBlanks} knockout still blank.</span>
        )}
      </p>
      <div className="fl-card p-5">
        {groupSecs.map((s) => (
          <div key={s.label} className="mb-4">
            <h4 className="mb-1.5 text-[10px] uppercase tracking-[1.5px] text-gold">{s.label}</h4>
            <div className="space-y-1">
              {s.rows.map(({ g, i }) => {
                const blank = g.homeGoals === null || g.awayGoals === null;
                return (
                  <div key={g.matchId} className={"flex items-center gap-1.5 text-[13px] " + (blank ? "rounded-md bg-down/5 px-1" : "")}>
                    <span className="flex flex-1 items-center justify-end gap-1.5 truncate text-right text-cream">
                      <span className="truncate">{g.home}</span>
                      <span className="shrink-0 text-base leading-none">{flagFor(g.home)}</span>
                    </span>
                    <input value={num(g.homeGoals)} onChange={(e) => setG(i, { homeGoals: parseNum(e.target.value) })} placeholder="–" className={numCell + (blank ? " border-down" : "")} />
                    <span className="text-muted">–</span>
                    <input value={num(g.awayGoals)} onChange={(e) => setG(i, { awayGoals: parseNum(e.target.value) })} placeholder="–" className={numCell + (blank ? " border-down" : "")} />
                    <span className="flex flex-1 items-center gap-1.5 truncate text-cream">
                      <span className="shrink-0 text-base leading-none">{flagFor(g.away)}</span>
                      <span className="truncate">{g.away}</span>
                    </span>
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
                    <span className="w-5 shrink-0 text-center text-base leading-none">{flagFor(k.home)}</span>
                    <input value={k.home ?? ""} onChange={(e) => setK(i, { home: e.target.value })} placeholder="team" className={"flex-1 text-right " + cell + (!k.home ? " border-down" : "")} />
                    <input value={num(k.homeGoals)} onChange={(e) => setK(i, { homeGoals: parseNum(e.target.value) })} placeholder="–" className={numCell} />
                    <span className="text-muted">–</span>
                    <input value={num(k.awayGoals)} onChange={(e) => setK(i, { awayGoals: parseNum(e.target.value) })} placeholder="–" className={numCell} />
                    <input value={k.away ?? ""} onChange={(e) => setK(i, { away: e.target.value })} placeholder="team" className={"flex-1 " + cell + (!k.away ? " border-down" : "")} />
                    <span className="w-5 shrink-0 text-center text-base leading-none">{flagFor(k.away)}</span>
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
