import { BriefingView } from "@/components/BriefingView";
import { getBriefing, getClassicData } from "@/lib/data";

export default function BriefingPage() {
  return <BriefingView b={getBriefing()} classic={getClassicData()} />;
}
