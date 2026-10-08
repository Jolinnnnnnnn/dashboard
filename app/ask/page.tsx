import { Suspense } from "react";

import { AskView, AskWithTask } from "@/components/AskView";

export default function AskPage() {
  return (
    <Suspense fallback={<AskView />}>
      <AskWithTask />
    </Suspense>
  );
}
