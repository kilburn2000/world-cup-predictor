import { useGroups } from "../api.js";
import MiniTable from "./MiniTable.js";

// The knockout competition splits entrants into WC-style groups; show the table
// for the group the logged-in entrant is in. (Format will change once the
// knockout rounds proper begin.)
export default function MiniKnockout({ entrantId }: { entrantId: number }) {
  const { data } = useGroups();
  if (!data) return null;
  const group = data.find((g) => g.entrants.some((e) => e.entrantId === entrantId));
  if (!group) return null;
  return (
    <MiniTable
      entrantId={entrantId}
      title={`Knockout: Group ${group.group}`}
      fullTo="/standings/knockout"
      rows={group.entrants.map((e) => ({ entrantId: e.entrantId, name: e.name, nameIncomplete: e.nameIncomplete, value: e.total }))}
    />
  );
}
