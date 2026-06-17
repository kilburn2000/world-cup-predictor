import { useLeaderboard } from "../api.js";
import { standingKey } from "@wc/shared";
import MiniTable from "./MiniTable.js";

export default function MiniStandings({ entrantId }: { entrantId: number }) {
  const { data } = useLeaderboard();
  if (!data) return null;
  return (
    <MiniTable
      entrantId={entrantId}
      title="Overall Standings"
      fullTo="/standings/overall"
      rows={data.map((r) => ({ entrantId: r.entrantId, name: r.name, nameIncomplete: r.nameIncomplete, value: r.total, key: standingKey(r.total, r.exactCount ?? 0, r.resultCount ?? 0) }))}
    />
  );
}
