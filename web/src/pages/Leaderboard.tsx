import { useState } from "react";
import { Link } from "react-router-dom";
import { useGroups, type GroupEntrant } from "../api.js";

function LiveDot() {
  return <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#d9534f]" style={{ animation: "loadDots 1.2s infinite" }} />;
}

function GroupRow({ e }: { e: GroupEntrant }) {
  return (
    <Link
      to={`/entrant/${e.entrantId}`}
      className="grid grid-cols-[28px_1fr_34px_34px_34px_44px] items-center gap-1 border-t border-line px-3 py-2 text-[13px] transition-colors first:border-t-0 hover:bg-gold-soft"
    >
      <div className="font-mono text-xs">
        {e.qualifying ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/15 font-semibold text-gold">{e.rank}</span>
        ) : (
          <span className="pl-1.5 text-muted">{e.rank}</span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={"truncate " + (e.qualifying ? "text-cream" : "text-muted")}>{e.name}</span>
        {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
        {e.live && <LiveDot />}
      </div>
      <div className="text-center font-mono text-[11px] text-muted">{e.week1 || "–"}</div>
      <div className="text-center font-mono text-[11px] text-muted">{e.week2 || "–"}</div>
      <div className="text-center font-mono text-[11px] text-muted">{e.week3 || "–"}</div>
      <div className="text-right font-mono text-sm font-semibold text-cream">{e.total}</div>
    </Link>
  );
}

export default function Leaderboard() {
  const { data, isLoading, error } = useGroups();
  const [tab, setTab] = useState<"groups" | "overall">("groups");

  if (isLoading) return <p className="font-mono text-sm uppercase tracking-widest text-muted">Loading…</p>;
  if (error) return <p className="text-down">Couldn’t load the standings.</p>;
  if (!data?.length) return <p className="text-muted">No groups set yet.</p>;

  const overall = data
    .flatMap((g) => g.entrants.map((e) => ({ ...e, group: g.group })))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const subTab = (active: boolean) =>
    "rounded-lg px-3.5 py-1.5 text-sm transition-colors " +
    (active ? "border border-gold bg-gold-soft text-cream" : "border border-transparent text-muted hover:text-cream");

  return (
    <div className="fl-enter">
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[1.8px] text-gold">Group stage</div>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-cream">Standings</h1>
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
          Entrants compete in groups over the three group-stage weeks. The <span className="text-gold">top two</span> in each group qualify. Points update live during games.
        </p>
      </div>

      <div className="mb-5 flex gap-2">
        <button className={subTab(tab === "groups")} onClick={() => setTab("groups")}>Groups</button>
        <button className={subTab(tab === "overall")} onClick={() => setTab("overall")}>Overall</button>
      </div>

      {tab === "groups" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((g) => (
            <div key={g.group} className="fl-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="font-display text-lg text-cream">Group {g.group}</div>
                <div className="grid grid-cols-[34px_34px_34px_44px] gap-1 text-[9px] uppercase tracking-wide text-muted">
                  <div className="text-center">W1</div>
                  <div className="text-center">W2</div>
                  <div className="text-center">W3</div>
                  <div className="text-right">Pts</div>
                </div>
              </div>
              {g.entrants.map((e, i) => (
                <div key={e.entrantId}>
                  <GroupRow e={e} />
                  {i === 1 && <div className="border-t border-dashed" style={{ borderColor: "rgba(201,168,106,0.4)" }} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="fl-card overflow-hidden">
          <div className="grid grid-cols-[36px_1fr_44px_34px_34px_34px_46px] items-center gap-1 px-4 py-2 text-[9px] uppercase tracking-wide text-muted">
            <div>#</div><div>Entrant</div><div className="text-center">Grp</div>
            <div className="text-center">W1</div><div className="text-center">W2</div><div className="text-center">W3</div>
            <div className="text-right">Pts</div>
          </div>
          {overall.map((e, i) => (
            <Link key={e.entrantId} to={`/entrant/${e.entrantId}`} className="grid grid-cols-[36px_1fr_44px_34px_34px_34px_46px] items-center gap-1 border-t border-line px-4 py-2 text-[13px] transition-colors hover:bg-gold-soft">
              <div className="font-mono text-xs text-muted">{i + 1}</div>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-cream">{e.name}</span>
                {e.nameIncomplete && <span className="shrink-0 font-mono text-[9px]" style={{ color: "#e3c558" }}>(?)</span>}
                {e.live && <LiveDot />}
              </div>
              <div className="text-center font-mono text-[10px] text-muted">{e.group}</div>
              <div className="text-center font-mono text-[11px] text-muted">{e.week1 || "–"}</div>
              <div className="text-center font-mono text-[11px] text-muted">{e.week2 || "–"}</div>
              <div className="text-center font-mono text-[11px] text-muted">{e.week3 || "–"}</div>
              <div className="text-right font-mono text-sm font-semibold text-cream">{e.total}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
