import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useEntrants, renameEntrant, deleteEntrant, setEntrantIncomplete, type EntrantRow } from "../api.js";
import { getToken } from "../auth.js";

function Row({ e, onChanged }: { e: EntrantRow; onChanged: () => void }) {
  const [val, setVal] = useState(e.name);
  const [saved, setSaved] = useState(false);
  const [incompleteName, setIncompleteName] = useState(!!e.nameIncomplete);
  const predsIncomplete = e.predictions !== 104;

  async function commit() {
    if (val.trim() && val.trim() !== e.name) {
      await renameEntrant(e.id, val.trim(), getToken());
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
      onChanged();
    }
  }

  async function toggleIncomplete() {
    const next = !incompleteName;
    setIncompleteName(next);
    await setEntrantIncomplete(e.id, next, getToken());
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
      <input
        value={val}
        onChange={(ev) => setVal(ev.target.value)}
        onBlur={commit}
        onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
        className="fl-input max-w-[200px] flex-1 py-2"
      />
      {incompleteName && (
        <span className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: "rgba(227,197,88,0.16)", color: "#e3c558" }}>
          name?
        </span>
      )}
      <span className={"font-mono text-xs shrink-0 " + (predsIncomplete ? "text-down" : "text-muted")}>
        {e.predictions}/104{predsIncomplete ? " ⚠" : ""}
      </span>
      {saved && <span className="text-xs text-up shrink-0">saved</span>}
      <div className="ml-auto flex items-center gap-3 shrink-0">
        <button onClick={toggleIncomplete} className="text-xs text-muted hover:text-cream">
          {incompleteName ? "✓ full name" : "mark unknown"}
        </button>
        <Link to={`/entrant/${e.id}/edit`} className="text-xs text-gold hover:underline">edit</Link>
        <Link to={`/entrant/${e.id}`} className="text-xs text-muted hover:text-cream">view</Link>
        <button
          onClick={async () => { if (confirm(`Remove ${e.name}? This deletes their predictions.`)) { await deleteEntrant(e.id, getToken()); onChanged(); } }}
          className="text-xs text-down hover:underline"
        >
          remove
        </button>
      </div>
    </div>
  );
}

export default function ManageEntrants() {
  const qc = useQueryClient();
  const { data, isLoading } = useEntrants();
  const [query, setQuery] = useState("");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["entrants"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
  };

  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;

  const list = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const filtered = query.trim() ? list.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase())) : list;
  const incomplete = list.filter((e) => e.predictions !== 104).length;

  return (
    <div className="fl-enter">
      <div className="mb-2 flex items-center gap-3 text-[11px] uppercase tracking-[1.8px] text-gold">
        <Link to="/admin" className="text-muted hover:text-cream">← Admin</Link>
      </div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight text-cream">Manage entrants</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Edit a name to fix a misread (click away to save). {incomplete > 0 && <span className="text-down">{incomplete} sheet{incomplete > 1 ? "s" : ""} read incomplete — re-upload on Add Entrant.</span>}
          </p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="fl-input w-56" />
      </div>

      <div className="fl-card overflow-hidden">
        {filtered.map((e) => <Row key={e.id} e={e} onChanged={refresh} />)}
        {!filtered.length && <div className="px-4 py-3 text-sm text-muted">No entrants match.</div>}
      </div>
    </div>
  );
}
