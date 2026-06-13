import { useParams } from "react-router-dom";
import EntrantSummary from "../components/EntrantSummary.js";
import WallchartPredictions from "../components/WallchartPredictions.js";

export default function Entrant() {
  const { id } = useParams();
  return (
    <div className="fl-enter">
      <EntrantSummary id={id!} />
      <div className="mt-7">
        <WallchartPredictions id={id!} />
      </div>
    </div>
  );
}
