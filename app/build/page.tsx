import type { Metadata } from "next";
import Link from "next/link";

import { Architecture, BuildTimeline, Catches, InsightFlow, TableauLanes, WireframeDashboard } from "@/components/BuildVisuals";
import { getBriefing, getBuildStory, getSourceCounts } from "@/lib/data";

export const metadata: Metadata = { title: "How it was built · Signal" };

function Section({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <div>
        <div className="font-mono text-[11px] tracking-[.08em] text-faint">{kicker}</div>
        <h2 className="m-0 mt-2 text-balance font-serif text-[34px] font-normal leading-[1.08] tracking-[-0.01em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function BuildPage() {
  const s = getBuildStory();
  const briefing = getBriefing();
  const repo = s.repo;
  const times = Object.fromEntries(s.timeline.map((c) => [c.hash, c.date]));
  const moduleInsight = briefing.insights.find((i) => i.id === "module");

  return (
    <div className="flex max-w-[1100px] flex-col gap-20 pb-10">
      <div className="flex flex-col gap-10">
        <div>
        <h1 className="m-0 max-w-[860px] text-balance font-serif text-[44px] font-normal leading-[1.02] tracking-[-0.02em] min-[900px]:text-[68px]">
          How I built Signal
        </h1>
        </div>
        <div className="grid grid-cols-3 gap-8">
          {[[`${s.hours_to_live_agent}h`, "first commit to working agent"], [String(s.commits), "commits"], [`${s.evals.passed}/${s.evals.total}`, "agent test questions passed"]].map(([v, l]) => (
            <div key={l} className="rule">
              <div className="font-serif text-[44px] leading-none tracking-[-0.02em]">{v}</div>
              <div className="mt-2 text-[13px] text-muted">{l}</div>
            </div>
          ))}
        </div>
      </div>

      <Section kicker="01" title="Same data, fewer manual steps than Tableau">
        <div className="overflow-x-auto rounded-xl bg-surface p-4">
          <TableauLanes />
        </div>
      </Section>

      <Section kicker="02" title="Where each insight comes from">
        <InsightFlow counts={getSourceCounts()} example={moduleInsight ? { title: moduleInsight.title, evidence: moduleInsight.evidence } : undefined} />
      </Section>

      <Section kicker="03" title="Seven phases, one day">
        <div className="overflow-x-auto rounded-xl bg-surface p-4">
          <BuildTimeline times={times} firstCommit={s.first_commit} liveHours={s.hours_to_live_agent} repo={repo} />
        </div>
      </Section>

      <Section kicker="04" title="Architecture">
        <div className="overflow-x-auto rounded-xl bg-surface p-4">
          <Architecture evals={`tests ${s.evals.passed}/${s.evals.total}`} backtest="89% vs 56% baseline" />
        </div>
      </Section>

      <Section kicker="05" title="Design versions">
        <div className="grid items-start gap-6 min-[900px]:grid-cols-3">
          <figure className="m-0 flex flex-col gap-2.5">
            <div className="rounded-lg bg-surface2 p-3"><WireframeDashboard /></div>
            <figcaption className="text-[13px] text-muted"><span className="font-medium text-ink">v1</span> · First layout: KPI cards and a table</figcaption>
          </figure>
          <figure className="m-0 flex flex-col gap-2.5">
            <div className="overflow-hidden rounded-lg border border-line bg-surface2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/build/design-v3.webp" alt="Claude Design prototype of the agent briefing" className="block h-auto w-full" />
            </div>
            <figcaption className="text-[13px] text-muted"><span className="font-medium text-ink">v3</span> · Claude Design prototype; its numbers were placeholders</figcaption>
          </figure>
          <figure className="m-0 flex flex-col gap-2.5">
            <Link href="/" className="card flex aspect-[640/406] flex-col justify-center gap-3 px-5 text-ink no-underline hover:border-line2 hover:text-ink">
              <div className="font-mono text-[10px] tracking-[.08em] text-muted">AGENT BRIEFING · LIVE</div>
              <div className="text-balance font-serif text-[26px] leading-none">{briefing.headline}</div>
              <div className="text-[12px] font-medium text-accent-ink">Open the live page</div>
            </Link>
            <figcaption className="text-[13px] text-muted"><span className="font-medium text-ink">Live version</span> · Same layout; numbers come from the data</figcaption>
          </figure>
        </div>
      </Section>

      <Section kicker="06" title="Mistakes I caught">
        <Catches repo={repo} />
      </Section>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line2 pt-5">
        <a href={repo} target="_blank" rel="noreferrer">GitHub ↗</a>
        <a href={`${repo}/blob/main/docs/prompt-log.md`} target="_blank" rel="noreferrer">Full prompt log ↗</a>
      </div>
    </div>
  );
}
