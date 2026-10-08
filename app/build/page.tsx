import type { Metadata } from "next";

import { BuildDiagram } from "@/components/BuildDiagram";
import { getBuildStory, getSourceCounts } from "@/lib/data";

export const metadata: Metadata = { title: "How it was built · Signal" };

export default function BuildPage() {
  const s = getBuildStory();
  const c = getSourceCounts();
  const values = {
    tasks: String(c.tasks),
    handoffs: c.handoffs.toLocaleString("en-US"),
    checks: "20",
    backtest: "right 89% of the time, vs 56% for a simple baseline",
    evals: `${s.evals.passed} of ${s.evals.total}`,
  };

  return (
    <div className="flex max-w-[1000px] flex-col gap-8 pb-10">
      <div>
        <h1 className="m-0 font-serif text-[44px] font-normal leading-none tracking-[-0.02em] min-[900px]:text-[60px]">How I built Signal</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12.5px] text-muted">
          <span>{s.hours_to_live_agent}h with Claude Code</span>
          <span>{s.commits} commits</span>
          <span>{s.evals.passed}/{s.evals.total} agent tests</span>
          <a href={s.repo} target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </div>
      <BuildDiagram values={values} repo={s.repo} />
    </div>
  );
}
