import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useEntrants } from "../api.js";

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
}

export default function Players() {
  const { data, isLoading, error } = useEntrants();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...(data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return q ? list.filter((e) => e.name.toLowerCase().includes(q)) : list;
  }, [data, query]);

  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load players.</p>;

  return (
    <div className="fl-enter">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[1.8px] text-gold">The field</div>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">
            Players <span className="font-mono text-2xl text-muted">{data?.length ?? 0}</span>
          </h1>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="fl-input w-56"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => (
          <Link key={e.id} to={`/entrant/${e.id}`} className="fl-card flex items-center gap-3 p-4 transition-colors hover:border-gold">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line font-mono text-sm text-muted">
              {initials(e.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-display text-lg text-cream">{e.name}</span>
                {e.nameIncomplete && <span className="shrink-0 font-mono text-[10px]" style={{ color: "#e3c558" }} title="full name unknown">(name?)</span>}
              </div>
              <div className="font-mono text-[11px] text-muted">{e.predictions} predictions</div>
            </div>
            <span className="ml-auto text-gold">→</span>
          </Link>
        ))}
      </div>
      {!filtered.length && <p className="mt-6 text-muted">No players match.</p>}
    </div>
  );
}
