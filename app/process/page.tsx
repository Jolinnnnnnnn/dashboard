import { Suspense } from "react";

import { ProcessView, ProcessViewFallback } from "@/components/ProcessView";
import { getProcessMap } from "@/lib/data";

export default function ProcessPage() {
  const windows = getProcessMap();
  return (
    <Suspense fallback={<ProcessViewFallback />}>
      <ProcessView windows={windows} />
    </Suspense>
  );
}
