import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AskButton } from "@/components/AgentDock";
import { RiskPill } from "@/components/ui";
import { allTaskIds, getTaskDetail } from "@/lib/data";
import type { Segment, TaskDetail } from "@/lib/types";

export function generateStaticParams() {
  return allTaskIds().map((id) => ({ id }));
}

export default function TaskPage({ params }: PageProps<"/task/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Task params={params} />
    </Suspense>
  );
}

async function Task({ params }: Pick<PageProps<"/task/[id]">, "params">) {
  const { id } = await params;
  const d = getTaskDetail(id);
  if (!d) notFound();
  return (
    <div className="flex flex-col gap-5">
      <Header d={d} />
      <Timeline d={d} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-8">
        {d.status === "open" ? <Prediction d={d} /> : <Resolution d={d} />}
        {d.status === "open" ? <Summary d={d} /> : <Description d={d} />}
        <RelatedCode d={d} />
      </div>
      <SimilarCases d={d} />
    </div>
  );
}

function Header({ d }: { d: TaskDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/queue" className="self-start text-muted no-underline hover:text-ink">← Queue</Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 text-pretty text-xl font-semibold tracking-[-0.015em]">
            <span className="font-mono font-medium">{d.id}</span> · {d.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 text-muted">
            <div className="text-ink">{d.client}</div><Dot /><div>{d.type}</div><Dot />
            {d.risk ? <RiskPill risk={d.risk} suffix=" risk" /> : <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium">Closed</span>}
            <Dot /><div>{d.status === "open" ? `Open ${d.openDays} days` : `Closed in ${d.openDays} days`}</div>
          </div>
        </div>
        <AskButton q={`What should happen next on ${d.id}?`} context={d.id} label="Ask about this task" size="md" />
      </div>
    </div>
  );
}

const Dot = () => <div className="text-faint">·</div>;

function Timeline({ d }: { d: TaskDetail }) {
  const actualTotal = d.timeline.reduce((a, s) => a + s.days, 0);
  // Closed gets a nominal width so the end of the predicted route is visible
  const predicted = d.predicted.map((s) => ({ ...s, flex: s.days || 0.4 }));
  const predTotal = predicted.reduce((a, s) => a + s.flex, 0);
  return (
    <div className="rule pb-1">
      <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><div className="font-semibold">Handoff timeline</div><AskButton q={`Where has ${d.id} spent its time?`} context={d.id} /></div>
        <div className="flex gap-3.5 text-xs text-muted">
          <Legend swatch="bg-surface3" label="Completed" />
          {d.status === "open" && <Legend swatch="bg-accent" label="Current" />}
          {d.status === "open" && <Legend swatch="border-[1.5px] border-dashed border-line2" label="Predicted" />}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-w-[560px] gap-[3px]">
          <div className="anim-fill flex gap-[3px]" style={{ flex: `${actualTotal} 1 0` }}>
            {d.timeline.map((s, i) => <Step key={i} s={s} />)}
          </div>
          {predicted.length > 0 && (
            <div className="anim-fade flex gap-[3px]" style={{ flex: `${predTotal} 1 0` }}>
              {predicted.map((s, i) => (
                <div key={i} className="flex min-w-[72px] flex-col gap-2" style={{ flex: `${s.flex} 1 0` }}>
                  <div className="h-7 rounded border-[1.5px] border-dashed border-line2" />
                  <div>
                    <div className="whitespace-nowrap text-[12.5px] font-medium text-muted">{s.name}</div>
                    <div className="whitespace-nowrap font-mono text-xs text-faint">{s.name === "Closed" ? d.estimatedClose : `est. ${s.days}d`}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3.5 flex justify-between border-t border-line pt-2.5 text-xs text-faint">
        <div>Opened {d.opened}</div>
        <div>{d.status === "open" ? `Est. close ${d.estimatedClose}` : `Closed ${d.closed}`}</div>
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return <div className="flex items-center gap-1.5"><div className={`h-2 w-3 rounded-sm ${swatch}`} />{label}</div>;
}

function Step({ s }: { s: Segment }) {
  return (
    <div className="flex min-w-[72px] flex-col gap-2" style={{ flex: `${s.days} 1 0` }}>
      <div className={`h-7 rounded ${s.current ? "bg-accent" : "bg-surface3"}`} />
      <div>
        <div className="whitespace-nowrap text-[12.5px] font-medium">{s.name}</div>
        <div className={`whitespace-nowrap font-mono text-xs ${s.current ? "text-accent-ink" : "text-muted"}`}>
          {s.days}d{s.current ? " · ongoing" : ""}
        </div>
      </div>
    </div>
  );
}

function Prediction({ d }: { d: TaskDetail }) {
  return (
    <div className="rule flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-2"><div className="font-semibold">Predicted next stop</div><AskButton q={`Why is ${d.next![0]?.name} the likely next stop for ${d.id}?`} context={d.id} /></div>
      <div className="flex flex-col gap-2.5">
        {d.next!.map((n, i) => (
          <div key={n.name} className="flex items-center gap-2.5">
            <div className="w-[92px] text-[12.5px]">{n.name}</div>
            <div className="h-2 flex-1 overflow-hidden rounded bg-surface3">
              <div className="h-full rounded bg-accent" style={{ width: `${n.pct}%`, opacity: [1, 0.5, 0.28][i] }} />
            </div>
            <div className="w-[34px] text-right font-mono text-xs text-muted">{n.pct}%</div>
          </div>
        ))}
      </div>
      <div className="text-pretty text-[12.5px] text-muted">{d.reason}</div>
      <div className="mt-auto flex items-baseline justify-between border-t border-line pt-3">
        <div className="text-xs text-muted">Est. close</div>
        <div className="text-[15px] font-semibold">{d.estimatedClose}</div>
      </div>
    </div>
  );
}

function Summary({ d }: { d: TaskDetail }) {
  return (
    <div className="rule flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Summary</div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-faint"><div className="size-1.5 rounded-[2px] bg-accent" />Generated by Claude</div>
      </div>
      <div className="text-pretty leading-relaxed">{d.summary ?? "No summary generated for this task."}</div>
      {d.action && (
        <div className="rounded-md border border-line bg-surface2 px-3 py-2.5">
          <div className="mb-[3px] text-[11.5px] font-medium text-muted">Suggested action</div>
          <div className="text-pretty leading-normal">{d.action}</div>
        </div>
      )}
    </div>
  );
}

function Resolution({ d }: { d: TaskDetail }) {
  return (
    <div className="rule flex flex-col gap-3">
      <div className="font-semibold">How it was solved</div>
      <div className="text-pretty leading-relaxed">{d.solutionNote}</div>
      <div className="mt-auto flex items-baseline justify-between border-t border-line pt-3">
        <div className="text-xs text-muted">Time to close</div>
        <div className="text-[15px] font-semibold">{d.openDays} days</div>
      </div>
    </div>
  );
}

function Description({ d }: { d: TaskDetail }) {
  return (
    <div className="rule flex flex-col gap-3">
      <div className="font-semibold">Original report</div>
      <div className="text-pretty leading-relaxed text-muted">{d.description}</div>
    </div>
  );
}

function RelatedCode({ d }: { d: TaskDetail }) {
  return (
    <div className="rule flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">Related code</div>
          <div className="mt-0.5 text-xs text-faint">From the code-mapping service · task counts over 12 months</div>
        </div>
        <AskButton q={`Which code is behind ${d.id}?`} context={d.id} />
      </div>
      <div className="flex flex-col">
        {d.code.length === 0 && <div className="border-t border-line py-2.5 text-xs text-faint">No code areas recorded for this task.</div>}
        {d.code.map((c) => (
          <div key={c.path} className="flex items-center gap-2.5 border-t border-line py-[9px]">
            <div className="min-w-0 flex-1">
              <div className="break-all font-mono text-[12.5px]">{c.path}</div>
              <div className="text-xs text-muted">{c.note}</div>
            </div>
            {c.hot && <span className="rounded bg-red-soft px-[7px] py-px text-[11.5px] font-medium text-red-ink">hotspot</span>}
            <div className="whitespace-nowrap text-xs text-faint">{c.tasks} tasks</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SimilarCases({ d }: { d: TaskDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <div className="text-[15px] font-semibold">Similar cases</div>
        <div className="text-xs text-faint">Solved for other clients</div>
        <span className="ml-1"><AskButton q={`Which past fix applies to ${d.id}?`} context={d.id} label="Which fix applies here?" /></span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-8">
        {d.similar.map((s) => (
          <Link key={s.id} href={`/task/${s.id}`} className="rule flex flex-col gap-2.5 text-ink no-underline hover:border-ink hover:text-ink">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">{s.score}% match</span>
              <div className="text-xs text-muted">Closed in {s.closedInDays}d</div>
            </div>
            <div>
              <div className="text-xs text-muted"><span className="font-mono text-ink">{s.id}</span> · {s.client}</div>
              <div className="mt-[3px] text-pretty text-sm font-medium">{s.title}</div>
            </div>
            <div className="text-xs text-muted">Matched on: {s.matchedOn}</div>
            <div className="mt-auto text-pretty border-t border-line pt-2.5 text-[12.5px]">
              <span className="text-muted">Solved by:</span> {s.solvedBy}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="skeleton h-5 w-2/3" />
      <div className="card h-[150px] p-4"><div className="skeleton mt-10 h-7" /></div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
        {[0, 1, 2].map((i) => <div key={i} className="card anim-pulse h-[200px]" />)}
      </div>
    </div>
  );
}
