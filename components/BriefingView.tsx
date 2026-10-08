"use client";

import Link from "next/link";
import { useState } from "react";

import { AskButton, useAgent } from "@/components/AgentDock";
import { ClaimButton, TaskWorkspaceProvider } from "@/components/Workspace";
import type { ClassicData } from "@/lib/data";
import type { Briefing, Insight, Tone } from "@/lib/types";

const TONE: Record<Tone, string> = {
  red: "var(--red)", amber: "var(--amber)", green: "var(--green)", accent: "var(--accent)", muted: "var(--border2)",
};
const KIND: Record<Insight["kind"], { label: string; bg: string; ink: string }> = {
  need: { label: "Needs you", bg: "var(--red-soft)", ink: "var(--red-ink)" },
  pattern: { label: "Pattern", bg: "var(--amber-soft)", ink: "var(--amber-ink)" },
  win: { label: "Win", bg: "var(--green-soft)", ink: "var(--green-ink)" },
};
// Categorical palette for the classic dashboard (deliberately "busy", as in the design)
const PAL = [250, 40, 160, 15, 300, 90, 200, 340].map((h) => `oklch(0.68 0.12 ${h})`);

function KindTag({ kind, featured }: { kind: Insight["kind"]; featured?: boolean }) {
  const k = KIND[kind];
  return (
    <span className="rounded-full px-[9px] py-0.5 text-xs font-medium" style={{ background: k.bg, color: k.ink }}>
      {featured ? "Needs you today" : k.label}
    </span>
  );
}

function Bars({ bars, wide }: { bars: NonNullable<Insight["bars"]>; wide?: boolean }) {
  const max = Math.max(...bars.map((b) => b.value)) || 1;
  return (
    <div className={`flex flex-col gap-[7px] ${wide ? "max-w-[560px]" : "max-w-[520px]"}`}>
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-3">
          <div className={`flex-none text-[12.5px] ${wide ? "w-[170px] text-muted" : "w-[130px]"}`}>{b.label}</div>
          <div className="h-2 flex-1 rounded bg-surface3">
            <div className="anim-fill h-full rounded" style={{ width: `${(b.value / max) * 100}%`, background: TONE[b.tone] }} />
          </div>
          <div className="w-14 text-right font-mono text-xs text-muted">{b.value}{b.unit}</div>
        </div>
      ))}
    </div>
  );
}

function Cols({ cols }: { cols: NonNullable<Insight["cols"]> }) {
  const max = Math.max(...cols.map((c) => c.value)) || 1;
  return (
    <div className="flex h-[86px] max-w-[420px] items-end gap-2">
      {cols.map((c, i) => {
        const last = i === cols.length - 1;
        return (
          <div key={c.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="font-mono text-[11px]" style={{ color: last ? "var(--amber-ink)" : "var(--faint)" }}>{c.value}%</div>
            <div className="w-full rounded-t-[3px]" style={{ height: `${(c.value / max) * 70}%`, background: last ? "var(--amber)" : "var(--surface3)" }} />
            <div className="font-mono text-[10.5px] text-faint">{c.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function Evidence({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <div className="ml-auto flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <Link key={id} href={`/task/${id}`} className="rounded border border-line px-[7px] py-px font-mono text-[11.5px] text-muted no-underline hover:border-line2 hover:text-ink">
          {id}
        </Link>
      ))}
    </div>
  );
}

function Meta({ insight }: { insight: Insight }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <KindTag kind={insight.kind} featured={insight.id === "featured"} />
      <div className="text-xs text-muted">{insight.meta}</div>
    </div>
  );
}

function Featured({ f }: { f: Insight }) {
  const { ask } = useAgent();
  const context = f.evidence[0];
  return (
    <div className="anim-rise flex flex-col gap-4 border-b border-line pb-8 pt-2">
      <Meta insight={f} />
      <div className="text-balance font-serif text-[30px] leading-[1.08] tracking-[-0.01em] min-[1280px]:text-[42px]">{f.title}</div>
      <div className="max-w-[640px] text-pretty text-sm leading-relaxed text-muted">{f.body}</div>
      {f.bars && <Bars bars={f.bars} wide />}
      <TaskWorkspaceProvider task={context}>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {f.actions.map((a) =>
          a.href ? (
            <Link key={a.label} href={a.href} className="flex h-8 items-center rounded-lg bg-ink px-3.5 font-semibold text-bg no-underline hover:text-bg hover:opacity-85">{a.label}</Link>
          ) : a.label.startsWith("Ask") ? (
            <button key={a.label} onClick={() => ask(a.ask!, context)} className="flex h-8 items-center gap-[7px] rounded-lg border-0 bg-accent px-3 font-medium text-on-accent hover:opacity-90">
              <span className="size-1.5 rounded-[2px] bg-on-accent" />{a.label}
            </button>
          ) : (
            <button key={a.label} onClick={() => ask(a.ask!, context)} className="h-8 rounded-lg border border-line2 bg-transparent px-3 text-ink">{a.label}</button>
          ),
        )}
        <ClaimButton task={context} />
        <Evidence ids={f.evidence} />
      </div>
      </TaskWorkspaceProvider>
    </div>
  );
}

function InsightCard({ insight, index }: { insight: Insight; index: number }) {
  const context = insight.evidence[0] ?? insight.meta.split(" · ").at(-1);
  return (
    <div className="anim-rise flex flex-col gap-3 border-b border-line py-7" style={{ animationDelay: `${(index + 1) * 60}ms` }}>
      <Meta insight={insight} />
      <div className="text-balance font-serif text-[25px] leading-[1.12] tracking-[-0.005em]">{insight.title}</div>
      <div className="max-w-[640px] text-pretty leading-relaxed text-muted">{insight.body}</div>
      {insight.bars && <Bars bars={insight.bars} />}
      {insight.cols && <Cols cols={insight.cols} />}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {insight.actions.map((a) =>
          a.ask ? (
            <AskButton key={a.label} q={a.ask} context={context} size="md" />
          ) : (
            <Link key={a.label} href={a.href!} className="flex h-7 items-center whitespace-nowrap rounded-[7px] border border-line bg-surface px-2.5 text-[12.5px] text-ink no-underline hover:bg-surface2 hover:text-ink">
              {a.label}
            </Link>
          ),
        )}
        <Evidence ids={insight.evidence} />
      </div>
    </div>
  );
}

function SideColumn({ b }: { b: Briefing }) {
  const { ask } = useAgent();
  return (
    <div className="flex min-w-0 flex-col gap-8 min-[1280px]:sticky min-[1280px]:top-[76px]">
      <div className="flex flex-col gap-1 border-t border-ink pt-4">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="font-semibold">What I&apos;m watching</div>
          <div className="ml-auto text-xs text-faint">{b.watch_rules.length} rules</div>
        </div>
        {b.watch_rules.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5 border-t border-line py-[7px]">
            <div className="size-1.5 rounded-full" style={{ background: TONE[r.tone] }} />
            <div className="flex-1">{r.label}</div>
            <div className="font-mono text-xs text-muted">{r.count}</div>
          </div>
        ))}
        <button
          onClick={() => ask("Add a watch rule", "Watch rules")}
          className="mt-2 h-[30px] rounded-[7px] border border-dashed border-line2 bg-transparent text-muted hover:border-accent hover:text-ink"
        >
          + Add a watch rule in plain language
        </button>
      </div>
    </div>
  );
}

type Chart = { title: string; note?: string; bars?: { label: string; value: number }[]; cols?: { label: string; value: number }[] };

const countBy = <T,>(rows: T[], key: (r: T) => string) =>
  Object.entries(rows.reduce<Record<string, number>>((a, r) => ({ ...a, [key(r)]: (a[key(r)] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

function Classic({ data }: { data: ClassicData }) {
  const [f, setF] = useState({ stakeholder: "", type: "", client: "", region: "", risk: "" });
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  // Open tasks honor every filter; history (created per week, handoffs) has no current team or risk
  const open = data.open.filter((r) => (!f.stakeholder || r.stakeholder === f.stakeholder) && (!f.type || r.type === f.type)
    && (!f.client || r.client === f.client) && (!f.region || r.region === f.region)
    && (!f.risk || (f.risk === "At risk" ? r.risk !== "Low" : r.risk === f.risk)));
  const history = data.history.filter((r) => (!f.type || r.type === f.type) && (!f.client || r.client === f.client) && (!f.region || r.region === f.region));
  const historyNote = f.stakeholder || f.risk ? "Team and risk filters don't apply to history" : undefined;

  const byClient = Object.entries(open.reduce<Record<string, number[]>>((a, r) => ({ ...a, [r.client]: [...(a[r.client] ?? []), r.age] }), {}))
    .map(([label, ages]) => ({ label, value: Math.round((ages.reduce((x, y) => x + y, 0) / ages.length) * 10) / 10 }))
    .sort((a, b) => b.value - a.value).slice(0, 8);
  const charts: Chart[] = [
    { title: "Open tasks by stakeholder", bars: countBy(open, (r) => r.stakeholder) },
    { title: "Open tasks by type", bars: countBy(open, (r) => r.type) },
    { title: "Avg days open by client", bars: byClient },
    { title: "Tasks opened per week", note: historyNote,
      cols: data.weeks.map((w) => ({ label: new Date(w).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), value: history.filter((r) => r.week === w).length })) },
  ];
  const kpis: [string, string | number, string?][] = [
    ["Open tasks", open.length],
    ["At risk", open.filter((r) => r.risk !== "Low").length],
    ["Avg days open", open.length ? (open.reduce((a, r) => a + r.age, 0) / open.length).toFixed(1) : "–"],
    ["Handoffs (90d)", history.reduce((a, r) => a + r.handoffs90, 0), historyNote],
  ];
  const anyFilter = Object.values(f).some(Boolean);
  const pick = (label: string, all: string, key: keyof typeof f, options: string[]) => (
    <select aria-label={label} value={f[key] || all} onChange={(e) => set(key)(e.target.value === all ? "" : e.target.value)} className="field h-[30px] max-w-[170px] text-xs">
      {[all, ...options].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="flex flex-col gap-3" style={{ animation: "fadeIn 200ms ease-out both" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {pick("Stakeholder", "All stakeholders", "stakeholder", uniq(data.open.map((r) => r.stakeholder)))}
        {pick("Type", "All task types", "type", uniq(data.open.map((r) => r.type)))}
        {pick("Client", "All clients", "client", uniq(data.open.map((r) => r.client)))}
        {pick("Region", "All regions", "region", uniq(data.open.map((r) => r.region)))}
        {pick("Risk", "Any risk", "risk", ["At risk", "High", "Medium", "Low"])}
        {anyFilter && (
          <button onClick={() => setF({ stakeholder: "", type: "", client: "", region: "", risk: "" })} className="h-[30px] border-0 bg-transparent px-1 text-xs text-muted hover:text-ink">Clear</button>
        )}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {kpis.map(([label, v, note]) => (
          <div key={label} className="card px-4 py-3.5" title={note}>
            <div className="text-xs text-muted">{label}{note && " *"}</div>
            <div className="mt-1 text-[26px] font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3">
        {charts.map((c) => {
          const vals = (c.bars ?? c.cols ?? []).map((x) => x.value);
          const max = Math.max(...vals, 0) || 1;
          return (
            <div key={c.title} className="card flex flex-col gap-2.5 px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[12.5px] font-medium">{c.title}</div>
                {c.note && <div className="text-[11px] text-faint">* {c.note}</div>}
              </div>
              {c.bars && c.bars.length === 0 && <div className="py-4 text-center text-xs text-faint">No open tasks match these filters.</div>}
              {c.bars && (
                <div className="flex flex-col gap-[5px]">
                  {c.bars.map((x, i) => (
                    <div key={x.label} className="flex items-center gap-2">
                      <div className="w-[120px] flex-none truncate text-[11.5px] text-muted">{x.label}</div>
                      <div className="h-3 flex-1"><div className="h-full rounded-sm" style={{ width: `${(x.value / max) * 100}%`, background: PAL[i % 8] }} /></div>
                      <div className="w-8 text-right text-[11.5px] tabular-nums text-muted">{x.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {c.cols && (
                <div className="flex h-[150px] items-end gap-1.5">
                  {c.cols.map((x) => (
                    <div key={x.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div className="text-[11px] text-muted">{x.value}</div>
                      <div className="w-full rounded-t-sm" style={{ height: `${(x.value / max) * 80}%`, background: PAL[0] }} />
                      <div className="whitespace-nowrap text-[10px] text-faint">{x.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BriefingView({ b, classic }: { b: Briefing; classic: ClassicData }) {
  const [mode, setMode] = useState<"agent" | "classic">("agent");
  const tab = (m: "agent" | "classic") =>
    `flex h-[30px] items-center gap-[7px] rounded-md border-0 px-3 font-medium ${mode === m ? "bg-ink text-bg" : "bg-transparent text-muted"}`;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-[780px]">
          <div className="flex items-center gap-2 font-mono text-[11.5px] tracking-[.08em] text-muted">
            <div className="anim-breathe size-[7px] rounded-full bg-accent" />AGENT BRIEFING · {b.as_of}
          </div>
          {mode === "agent" ? (
            <>
              <h1 className="m-0 mt-3.5 text-balance font-serif text-[40px] font-normal leading-none tracking-[-0.02em] min-[900px]:text-[60px]">{b.headline}</h1>
              <div className="mt-3 max-w-[600px] text-pretty text-[15px] leading-normal text-muted">{b.subhead}</div>
            </>
          ) : (
            <>
              <h1 className="m-0 mt-3.5 text-balance font-serif text-[40px] font-normal leading-none tracking-[-0.02em] min-[900px]:text-[60px]">
                Everything is here. <span className="italic text-muted">You find the story.</span>
              </h1>
              <div className="mt-3 max-w-[600px] text-pretty text-[15px] leading-normal text-muted">
                The view we used to build in Tableau: four KPIs, four charts, six filters. Every number is right, and the analyst still has to hunt for what changed.
              </div>
            </>
          )}
        </div>
        <div className="flex rounded-[9px] border border-line bg-surface p-[3px]">
          <button onClick={() => setMode("agent")} className={tab("agent")}><span className="size-1.5 rounded-[2px] bg-accent" />Agent briefing</button>
          <button onClick={() => setMode("classic")} className={tab("classic")}>Classic dashboard</button>
        </div>
      </div>

      {mode === "agent" ? (
        <div className="grid items-start gap-5 min-[1280px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col">
            {b.featured && <Featured f={b.featured} />}
            {b.insights.map((i, n) => <InsightCard key={i.id} insight={i} index={n} />)}
          </div>
          <SideColumn b={b} />
        </div>
      ) : (
        <Classic data={classic} />
      )}
    </div>
  );
}
