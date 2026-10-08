import { BriefingView } from "@/components/BriefingView";
import { getBriefing } from "@/lib/data";

export default function BriefingPage() {
  return <BriefingView b={getBriefing()} />;
}
