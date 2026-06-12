import { useTopScorer } from "../api.js";
import MiniTable from "./MiniTable.js";

export default function MiniTopScorer({ entrantId }: { entrantId: number }) {
  const { data } = useTopScorer();
  if (!data) return null;
  return (
    <MiniTable
      entrantId={entrantId}
      title="Top Scorer Standings"
      fullTo="/standings/top-scorer"
      rows={data.map((r) => ({ entrantId: r.entrantId, name: r.name, nameIncomplete: r.nameIncomplete, value: r.total }))}
    />
  );
}
