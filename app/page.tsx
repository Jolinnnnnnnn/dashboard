import Link from "next/link";
import { Suspense } from "react";

import { QueueTable, QueueTableFallback } from "@/components/QueueTable";
import { CountUp } from "@/components/ui";
import { DATA_AS_OF, getQueueRows, getQueueStats } from "@/lib/data";

export default function QueuePage() {
  const stats = getQueueStats();
  const rows = getQueueRows();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-semibold tracking-[-0.015em]">Task queue</h1>
          <div className="mt-[3px] text-muted">Open client tasks, where they sit now, and where they are likely to go next.</div>
        </div>
        <div className="text-xs text-faint">Data as of {DATA_AS_OF}</div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <div className="card p-4">
          <div className="text-xs text-muted">Open tasks</div>
          <div className="mt-1.5 text-[28px] font-semibold tabular-nums tracking-[-0.02em]"><CountUp value={stats.open} /></div>
          <div className="mt-0.5 text-xs text-faint">Across {stats.clients} clients</div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted"><div className="size-1.5 rounded-full bg-red" />At risk</div>
          <div className="mt-1.5 text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-red-ink"><CountUp value={stats.atRisk} /></div>
          <div className="mt-0.5 text-xs text-faint">Held over 1.5× their stakeholder median · {stats.high} over 2×</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">Avg days open</div>
          <div className="mt-1.5 text-[28px] font-semibold tabular-nums tracking-[-0.02em]"><CountUp value={stats.avgDaysOpen} decimals={1} /></div>
          <div className="mt-0.5 text-xs text-faint">Median {stats.medianDaysOpen} days</div>
        </div>
        <div className="card flex flex-col p-4">
          <div className="text-xs text-muted">Biggest bottleneck</div>
          <div className="mt-2.5 text-lg font-semibold tracking-[-0.015em]">{stats.bottleneck.name}</div>
          <div className="mt-auto flex justify-between gap-2 pt-1.5 text-xs">
            <div className="text-amber-ink">{stats.bottleneck.medianHold}d median hold</div>
            <Link href={`/process?node=${stats.bottleneck.id}`} className="no-underline hover:underline">View on map →</Link>
          </div>
        </div>
      </div>

      <Suspense fallback={<QueueTableFallback />}>
        <QueueTable rows={rows} />
      </Suspense>
    </div>
  );
}
