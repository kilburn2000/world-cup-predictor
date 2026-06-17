import { useLeaderboard, usePhasesStarted } from "../api.js";
import { standingKey } from "@wc/shared";
import MiniTable from "./MiniTable.js";

// The standings for the current week - the highest-numbered matchday week that
// has kicked off. Hidden until week 1 starts.
export default function MiniWeek({ entrantId }: { entrantId: number }) {
  const { data } = useLeaderboard();
  const { data: phases } = usePhasesStarted();
  if (!data || !phases) return null;

  const week: 1 | 2 | 3 | null = phases.week3 ? 3 : phases.week2 ? 2 : phases.week1 ? 1 : null;
  if (!week) return null;
  const phase = `week${week}` as "week1" | "week2" | "week3";

  return (
    <MiniTable
      entrantId={entrantId}
      title={`Week ${week} Standings`}
      fullTo={`/standings/week-${week}`}
      rows={data.map((r) => ({ entrantId: r.entrantId, name: r.name, nameIncomplete: r.nameIncomplete, value: r[phase], key: standingKey(r[phase], r.statsByPhase?.[phase]?.exact ?? 0, r.statsByPhase?.[phase]?.result ?? 0) }))}
    />
  );
}
