// Illustrations for the "How it was built" page. Plain SVG/HTML using theme tokens, so they work in
// light and dark mode without images.

import type { ClaudeExamples } from "@/lib/data";
import { CATCHES, DETECTORS, GUARDRAILS, JOURNEY, LANES, SOURCE_LINKS } from "@/lib/story";

const ARROW = (id: string, color: string) => (
  <marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
    <path d="M0,0 L8,4 L0,8 z" style={{ fill: color }} />
  </marker>
);

// ── Tableau vs Signal: two lanes from the same data ──

function LaneIcon({ kind, x, y }: { kind: string; x: number; y: number }) {
  const ink = kind === "person" || kind === "chart" ? "var(--muted)" : "var(--accent)";
  if (kind === "person") return <g style={{ fill: "none", stroke: ink }} strokeWidth={1.6}><circle cx={x} cy={y - 4} r={4} /><path d={`M${x - 7} ${y + 9} a7 6.5 0 0 1 14 0`} /></g>;
  if (kind === "chart") return <g style={{ fill: ink }}>{[[-7, 4], [-1.5, -2], [4, -6]].map(([dx, top]) => <rect key={dx} x={x + dx} y={y + top} width={4} height={8 - top} rx={1} />)}</g>;
  if (kind === "claude") return <path d={`M${x} ${y - 8} L${x + 2.4} ${y - 2.4} L${x + 8} ${y} L${x + 2.4} ${y + 2.4} L${x} ${y + 8} L${x - 2.4} ${y + 2.4} L${x - 8} ${y} L${x - 2.4} ${y - 2.4} Z`} style={{ fill: ink }} />;
  return <circle cx={x} cy={y} r={4} className="anim-pulse" style={{ fill: ink }} />;
}

export function TableauLanes() {
  const COLS = [210, 400, 590, 780];
  const W = 160;
  const H = 52;
  const rows = [{ key: "tableau", y: 50, label: "TABLEAU · BY HAND" }, { key: "signal", y: 200, label: "SIGNAL · EVERY REFRESH" }] as const;
  return (
    <svg viewBox="0 0 960 290" className="block h-auto w-full min-w-[720px]" role="img" aria-label="Tableau: dashboard, then you filter, spot changes, and write it up. Signal: checks, detectors, and Claude produce the briefing from the same data.">
      <defs>{ARROW("lane-grey", "var(--border2)")}{ARROW("lane-accent", "var(--accent)")}</defs>
      {/* the shared data source */}
      <g>
        <path d="M30 130 v44 a50 12 0 0 0 100 0 v-44" style={{ fill: "var(--surface2)", stroke: "var(--border2)" }} strokeWidth={1.2} />
        <ellipse cx={80} cy={130} rx={50} ry={12} style={{ fill: "var(--surface)", stroke: "var(--border2)" }} strokeWidth={1.2} />
        <text x={80} y={162} textAnchor="middle" fontSize={14} fontWeight={600} style={{ fill: "var(--text)" }}>Same data</text>
        <text x={80} y={214} textAnchor="middle" fontSize={11} style={{ fill: "var(--faint)" }}>tasks · handoffs</text>
      </g>
      <path d={`M130 140 C170 140, 170 ${50 + H / 2}, ${COLS[0] - 4} ${50 + H / 2}`} fill="none" strokeWidth={1.4} markerEnd="url(#lane-grey)" style={{ stroke: "var(--border2)" }} />
      <path d={`M130 160 C170 160, 170 ${200 + H / 2}, ${COLS[0] - 4} ${200 + H / 2}`} fill="none" strokeWidth={1.8} markerEnd="url(#lane-accent)" style={{ stroke: "var(--accent)" }} />
      {rows.map((r) => {
        const signal = r.key === "signal";
        const cy = r.y + H / 2;
        return (
          <g key={r.key}>
            <text x={COLS[0]} y={r.y - 14} fontSize={11} letterSpacing={1.2} fontFamily="var(--font-mono)" style={{ fill: signal ? "var(--accent-ink)" : "var(--faint)" }}>{r.label}</text>
            {COLS.slice(0, -1).map((x) => (
              <g key={x}>
                <path d={`M${x + W} ${cy} H${x + 190 - 4}`} fill="none" strokeWidth={1.4} markerEnd={`url(#${signal ? "lane-accent" : "lane-grey"})`} style={{ stroke: signal ? "var(--accent)" : "var(--border2)" }} />
                {signal && <path d={`M${x + W} ${cy} H${x + 190 - 8}`} fill="none" strokeWidth={3.5} className="anim-flow" style={{ stroke: "var(--accent)" }} />}
              </g>
            ))}
            {LANES[r.key].map((n, i) => {
              const x = COLS[i];
              const claude = n.icon === "claude";
              return (
                <g key={n.label}>
                  <rect x={x} y={r.y} width={W} height={H} rx={12} strokeWidth={claude ? 1.6 : 1.2}
                    style={{ fill: signal ? (claude ? "var(--accent-soft)" : "var(--surface)") : "var(--surface2)", stroke: signal ? "var(--accent)" : "var(--border2)" }} />
                  <LaneIcon kind={n.icon} x={x + 24} y={cy} />
                  <text x={x + 44} y={cy + 5} fontSize={14.5} fontWeight={600} style={{ fill: signal ? (claude ? "var(--accent-ink)" : "var(--text)") : "var(--muted)" }}>{n.label}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      {/* the people move out of the loop */}
      <text x={COLS[1] + W + 15} y={142} textAnchor="middle" fontSize={11.5} style={{ fill: "var(--amber-ink)" }}>3 manual steps → 0</text>
    </svg>
  );
}

// ── Where insights come from: sources → detectors → one insight ──

export function InsightFlow({ counts, example }: {
  counts: { tasks: number; handoffs: number; modules: number; clients: number; events: number };
  example?: { title: string; evidence: string[] };
}) {
  const sources: [string, string][] = [
    ["Task records", String(counts.tasks)],
    ["Handoff history", counts.handoffs.toLocaleString("en-US")],
    ["Code areas", String(counts.modules)],
    ["Client profiles", String(counts.clients)],
    ["Process change log", String(counts.events)],
  ];
  const rowY = (i: number) => 30 + i * 60;
  const H = 42;
  const cy = (i: number) => rowY(i) + H / 2;
  const SX = 210; // source box width
  const DX = 320; // detector box x
  const DW = 220;
  const OUT = { x: 660, y: cy(2) };
  return (
    <div className="grid items-center gap-4 min-[900px]:grid-cols-[1fr_300px]">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 660 330" className="block h-auto w-full min-w-[560px]" role="img" aria-label="Five data sources feed five detectors, which produce the briefing's insights">
          <defs>{ARROW("ins-accent", "var(--accent)")}</defs>
          <text x={0} y={14} fontSize={11} letterSpacing={1.2} fontFamily="var(--font-mono)" style={{ fill: "var(--faint)" }}>SOURCES</text>
          <text x={DX} y={14} fontSize={11} letterSpacing={1.2} fontFamily="var(--font-mono)" style={{ fill: "var(--accent-ink)" }}>DETECTORS</text>
          {SOURCE_LINKS.map(([s, d]) => (
            <path key={`${s}-${d}`} d={`M${SX} ${cy(s)} C${SX + 55} ${cy(s)}, ${DX - 55} ${cy(d)}, ${DX} ${cy(d)}`} fill="none" strokeWidth={1.3} style={{ stroke: "var(--border2)" }} />
          ))}
          {DETECTORS.map((_, d) => (
            <g key={d}>
              <path d={`M${DX + DW} ${cy(d)} C${DX + DW + 60} ${cy(d)}, ${OUT.x - 60} ${OUT.y}, ${OUT.x - 4} ${OUT.y}`} fill="none" strokeWidth={1.4} markerEnd="url(#ins-accent)" style={{ stroke: "var(--accent)" }} />
              <path d={`M${DX + DW} ${cy(d)} C${DX + DW + 60} ${cy(d)}, ${OUT.x - 60} ${OUT.y}, ${OUT.x - 8} ${OUT.y}`} fill="none" strokeWidth={3.5} className="anim-flow" style={{ stroke: "var(--accent)", animationDelay: `${d * -0.15}s` }} />
            </g>
          ))}
          {sources.map(([name, n], i) => (
            <g key={name}>
              <rect x={0} y={rowY(i)} width={SX} height={H} rx={8} strokeWidth={1.2} style={{ fill: "var(--surface)", stroke: "var(--border2)" }} />
              <text x={14} y={cy(i) + 5} fontSize={13.5} style={{ fill: "var(--text)" }}>{name}</text>
              <text x={SX - 14} y={cy(i) + 5} textAnchor="end" fontSize={12} fontFamily="var(--font-mono)" style={{ fill: "var(--faint)" }}>{n}</text>
            </g>
          ))}
          {DETECTORS.map((d, i) => (
            <g key={d}>
              <rect x={DX} y={rowY(i)} width={DW} height={H} rx={8} strokeWidth={1.2} strokeDasharray="4 3" style={{ fill: "var(--accent-soft)", stroke: "var(--accent)" }} />
              <circle cx={DX + 16} cy={cy(i)} r={3.5} style={{ fill: "var(--accent)" }} />
              <text x={DX + 30} y={cy(i) + 5} fontSize={13.5} style={{ fill: "var(--accent-ink)" }}>{d}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-[0_8px_24px_rgba(16,24,40,0.08)]">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-red-soft px-2.5 py-0.5 text-xs font-medium text-red-ink">Needs you</span>
          <span className="font-mono text-[10.5px] tracking-[.08em] text-faint">BRIEFING</span>
        </div>
        <div className="text-balance font-serif text-[22px] leading-[1.15]">{example?.title}</div>
        <div className="flex flex-wrap gap-1.5">
          {example?.evidence.slice(0, 3).map((id) => <span key={id} className="rounded border border-line px-1.5 font-mono text-[11px] text-muted">{id}</span>)}
        </div>
        <div className="flex items-center gap-2 border-t border-line pt-2.5 text-xs text-green-ink">
          <span className="flex size-4 items-center justify-center rounded-full bg-green-soft text-[10px]">✓</span>Worded by Claude; every number checked
        </div>
      </div>
    </div>
  );
}

// ── How Claude is used: two real calls ──

function ModelTag({ model, when }: { model: string; when: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md bg-accent px-2 py-0.5 font-mono text-[11.5px] text-on-accent">{model}</span>
      <span className="text-[13px] text-muted">{when}</span>
    </div>
  );
}

function Step({ n, label, children, accent }: { n: number; label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border p-4 ${accent ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
      <div className={`font-mono text-[10.5px] tracking-[.08em] ${accent ? "text-accent-ink" : "text-faint"}`}>{n} · {label.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Next() {
  return <div className="text-center text-xl text-accent" aria-hidden><span className="min-[1000px]:hidden">↓</span><span className="hidden min-[1000px]:inline">→</span></div>;
}

function factValue(v: unknown) {
  return Array.isArray(v) ? `[${v.length}]` : typeof v === "string" ? `"${v}"` : String(v);
}

export function ClaudeWriter({ writer }: { writer: NonNullable<ClaudeExamples["writer"]> }) {
  const facts = Object.entries(writer.facts).slice(0, 6);
  return (
    <div className="flex flex-col gap-4">
      <ModelTag model="claude-haiku-5-5" when="writes the briefing · runs offline, once per data refresh" />
      <div className="grid items-center gap-3 min-[1000px]:grid-cols-[1.6fr_auto_1fr_auto_1fr_auto_1fr]">
        <Step n={1} label="Detector output">
          <pre className="m-0 overflow-hidden whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-muted">
            {facts.map(([k, v]) => <div key={k}><span className="text-ink">{k}</span>: {factValue(v)}</div>)}
          </pre>
        </Step>
        <Next />
        <Step n={2} label="Prompt" accent>
          <div className="font-serif text-[19px] leading-[1.2] text-ink">“Use only the facts provided. Every number you write must appear in the facts exactly as given.”</div>
        </Step>
        <Next />
        <Step n={3} label="Claude writes">
          <div className="text-balance font-serif text-[19px] leading-[1.2]">{writer.title}</div>
        </Step>
        <Next />
        <Step n={4} label="Number check">
          <div className="flex flex-wrap gap-1.5">
            {writer.numbers.map(({ n, ok }) => (
              <span key={n} className={`rounded-md px-2 py-0.5 font-mono text-[12px] ${ok ? "bg-green-soft text-green-ink" : "bg-red-soft text-red-ink"}`}>{n} {ok ? "✓" : "✗"}</span>
            ))}
          </div>
          <div className="flex flex-col gap-1 text-[12.5px]">
            <span className="text-green-ink">All found → shown on the briefing</span>
            <span className="text-muted">Any missing → template text instead</span>
          </div>
        </Step>
      </div>
    </div>
  );
}

const LANE_W = 100 / 3;

function Msg({ from, to, children }: { from: 0 | 1 | 2; to: 0 | 1 | 2; children: React.ReactNode }) {
  const left = Math.min(from, to);
  const rightward = to > from;
  return (
    <div className="relative flex flex-col gap-2 py-2.5" style={{ marginLeft: `${left * LANE_W + LANE_W / 2}%`, width: `${Math.abs(to - from) * LANE_W}%` }}>
      <div className="px-4">{children}</div>
      <div className="relative h-[1.5px] bg-accent">
        <svg width="9" height="10" viewBox="0 0 9 10" className={`absolute -top-[4.25px] ${rightward ? "-right-px" : "-left-px rotate-180"}`} aria-hidden>
          <path d="M0 0 L9 5 L0 10 z" style={{ fill: "var(--accent)" }} />
        </svg>
      </div>
    </div>
  );
}

export function AgentTrace({ agent }: { agent: NonNullable<ClaudeExamples["agent"]> }) {
  const calls = Object.entries(agent.tools.reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {}));
  return (
    <div className="flex flex-col gap-4">
      <ModelTag model={agent.model} when="answers questions · runs live, per question" />
      <div className="overflow-x-auto rounded-xl bg-surface p-4">
        <div className="relative min-w-[680px]">
          {/* lifelines */}
          {[0, 1, 2].map((i) => (
            <div key={i} className="absolute bottom-0 top-12 border-l border-dashed border-line2" style={{ left: `${i * LANE_W + LANE_W / 2}%` }} aria-hidden />
          ))}
          <div className="relative grid grid-cols-3 gap-4 pb-3">
            {[["You", "", false], ["Claude Sonnet", "decides what to look up", true], ["Tools → data", "8 read-only", false]].map(([name, sub, accent]) => (
              <div key={String(name)} className={`mx-auto flex min-w-[150px] flex-col items-center rounded-lg border px-3 py-1.5 ${accent ? "border-accent bg-accent-soft text-accent-ink" : "border-line2 bg-bg"}`}>
                <span className="text-[14px] font-semibold">{name}</span>
                {sub && <span className="text-[11px] text-muted">{sub}</span>}
              </div>
            ))}
          </div>
          <div className="relative flex flex-col">
            <Msg from={0} to={1}><div className="text-pretty font-serif text-[18px] leading-[1.2]">{agent.question}</div></Msg>
            <Msg from={1} to={2}>
              <div className="flex flex-wrap gap-1.5">
                {calls.map(([t, n]) => <span key={t} className="rounded-md border border-line2 bg-bg px-2 py-0.5 font-mono text-[11.5px]">{t}(){n > 1 ? ` ×${n}` : ""}</span>)}
              </div>
            </Msg>
            <Msg from={2} to={1}><div className="text-[13px] text-muted">counts, holds, and the task IDs behind them</div></Msg>
            <Msg from={1} to={0}>
              <div className="flex flex-col gap-2 rounded-lg border border-line bg-bg p-3">
                <div className="text-pretty text-[13.5px] leading-relaxed">{agent.answer}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {agent.ids.map((id) => <span key={id} className="rounded border border-line px-1.5 font-mono text-[11px] text-muted">{id}</span>)}
                  <span className="text-[11.5px] text-green-ink">✓ every ID came from a tool</span>
                </div>
              </div>
            </Msg>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-mono text-[12px] text-muted">{agent.seconds.toFixed(1)}s · ${agent.cost.toFixed(3)} · {agent.tools.length} tool calls</span>
        <div className="flex flex-wrap gap-1.5">
          {GUARDRAILS.map((g) => <span key={g} className="rounded-full border border-line2 px-2.5 py-0.5 text-[12px] text-muted">{g}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── Build timeline: hours from the first commit ──

function iconPaths(name: string) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    plan: <><path {...p} d="M7 5h10M7 10h10M7 15h6" /><circle {...p} cx="4" cy="5" r=".6" /><circle {...p} cx="4" cy="10" r=".6" /><circle {...p} cx="4" cy="15" r=".6" /></>,
    data: <><ellipse {...p} cx="10" cy="5" rx="6" ry="2.5" /><path {...p} d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></>,
    model: <path {...p} d="M3 15l4-5 3 3 4-6 3 3" />,
    design: <><rect {...p} x="3" y="3" width="14" height="14" rx="2" /><path {...p} d="M3 8h14M8 8v9" /></>,
    app: <><rect {...p} x="2.5" y="4" width="15" height="12" rx="2" /><path {...p} d="M2.5 7.5h15" /><circle cx="5" cy="5.8" r=".7" fill="currentColor" /></>,
    agent: <><path {...p} d="M4 4h12a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0116 14h-6l-4 3v-3H4a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 014 4z" /><path {...p} d="M7 9h.01M10 9h.01M13 9h.01" strokeWidth={2.4} /></>,
    live: <><circle {...p} cx="10" cy="10" r="2" /><path {...p} d="M5.5 5.5a6.4 6.4 0 000 9M14.5 5.5a6.4 6.4 0 010 9M3 3a10 10 0 000 14M17 3a10 10 0 010 14" /></>,
  };
  return paths[name];
}

export function BuildTimeline({ times, firstCommit, liveHours, repo }: { times: Record<string, string>; firstCommit: string; liveHours: number; repo: string }) {
  const start = new Date(firstCommit).getTime();
  const at = (hash: string) => (times[hash] ? (new Date(times[hash]).getTime() - start) / 3_600_000 : 0);
  const MAX = Math.ceil(liveHours / 2) * 2;
  const X0 = 170;
  const X1 = 940;
  const x = (h: number) => X0 + (h / MAX) * (X1 - X0);
  const ROW = 34;
  const TOP = 20;
  // Each phase runs from the previous phase's finishing commit to its own (phases 5 and 6 shipped together).
  const bars = JOURNEY.map((j, i) => {
    const end = at(j.commit);
    const prev = JOURNEY.slice(0, i).reverse().find((p) => at(p.commit) < end);
    return { ...j, from: prev ? at(prev.commit) : 0, to: end };
  });
  const lastEnd = Math.max(...bars.map((b) => b.to));
  const axisY = TOP + bars.length * ROW + 12;
  const fmt = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)}h`);
  return (
    <svg viewBox={`0 0 960 ${axisY + 30}`} className="block h-auto w-full min-w-[680px]" role="img" aria-label="Timeline of the seven build phases in hours from the first commit">
      {/* overnight gap between the agent and going live */}
      <rect x={x(lastEnd) + 6} y={TOP - 6} width={x(liveHours) - x(lastEnd) - 12} height={bars.length * ROW + 6} rx={8} style={{ fill: "var(--surface2)" }} />
      <text x={(x(lastEnd) + x(liveHours)) / 2} y={TOP + bars.length * ROW / 2} textAnchor="middle" fontSize={13} style={{ fill: "var(--faint)" }}>overnight</text>
      {Array.from({ length: MAX / 2 + 1 }, (_, i) => i * 2).map((h) => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={TOP - 6} y2={axisY - 6} strokeDasharray="2 4" style={{ stroke: "var(--border)" }} />
          <text x={x(h)} y={axisY + 8} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" style={{ fill: "var(--faint)" }}>{h}h</text>
        </g>
      ))}
      {bars.map((b, i) => {
        const y = TOP + i * ROW;
        const w = Math.max(x(b.to) - x(b.from), 6);
        return (
          <a key={b.phase} href={`${repo}/commit/${b.commit}`} target="_blank" rel="noreferrer">
            <title>{`Phase ${b.phase}: ${b.line} · commit ${b.commit}`}</title>
            <g transform={`translate(4 ${y + 3}) scale(0.95)`} style={{ color: "var(--muted)" }}>{iconPaths(b.icon)}</g>
            <text x={34} y={y + 17} fontSize={11} fontFamily="var(--font-mono)" style={{ fill: "var(--faint)" }}>P{b.phase}</text>
            <text x={60} y={y + 17} fontSize={14} fontWeight={500} style={{ fill: "var(--text)" }}>{b.step}</text>
            <rect x={x(b.from)} y={y + 4} width={w} height={20} rx={5} style={{ fill: b.phase === 7 ? "var(--accent)" : "var(--accent-soft)", stroke: "var(--accent)" }} strokeWidth={1} />
            <text x={x(b.from) + w + 8} y={y + 18} fontSize={11.5} fontFamily="var(--font-mono)" style={{ fill: "var(--muted)" }}>{fmt(b.to - b.from)}</text>
          </a>
        );
      })}
      {/* live */}
      <line x1={x(liveHours)} x2={x(liveHours)} y1={TOP - 6} y2={axisY - 6} strokeWidth={1.5} style={{ stroke: "var(--green)" }} />
      <circle cx={x(liveHours)} cy={TOP + (bars.length - 1) * ROW + 14} r={6} className="anim-pulse" style={{ fill: "var(--green)" }} />
      <text x={x(liveHours) - 12} y={TOP + (bars.length - 1) * ROW + 18} textAnchor="end" fontSize={13} fontWeight={600} style={{ fill: "var(--green-ink)" }}>Live</text>
    </svg>
  );
}

// ── Mistakes: wrong → caught → fixed ──

export function Catches({ repo }: { repo: string }) {
  return (
    <div className="grid gap-5 min-[800px]:grid-cols-3">
      {CATCHES.map((c) => (
        <div key={c.title} className="card flex flex-col gap-0 p-5">
          {[
            { dot: "bg-red", ink: "text-red-ink", label: "Wrong", body: <span className="text-balance font-serif text-[21px] leading-[1.15] text-ink">{c.title}</span> },
            { dot: "bg-amber", ink: "text-amber-ink", label: "Caught", body: <span className="text-ink">{c.caughtBy}</span> },
            { dot: "bg-green", ink: "text-green-ink", label: "Fixed", body: <a href={`${repo}/commit/${c.commit}`} target="_blank" rel="noreferrer" className="font-mono text-xs">{c.commit} ↗</a> },
          ].map((s, i) => (
            <div key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`mt-1 size-2.5 flex-none rounded-full ${s.dot}`} />
                {i < 2 && <span className="w-px flex-1 bg-line2" />}
              </div>
              <div className={`flex flex-col gap-1 ${i < 2 ? "pb-4" : ""}`}>
                <span className={`font-mono text-[10.5px] tracking-[.08em] ${s.ink}`}>{s.label.toUpperCase()}</span>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Architecture ──

type Box = { x: number; y: number; w: number; h: number; title: string; lines: string[]; kind?: "claude" | "live" };

function SvgBox({ b }: { b: Box }) {
  const fill = b.kind === "claude" ? "var(--accent-soft)" : "var(--surface)";
  const stroke = b.kind === "claude" ? "var(--accent)" : b.kind === "live" ? "var(--text)" : "var(--border2)";
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} style={{ fill, stroke }} strokeWidth={1.2} />
      <text x={b.x + 16} y={b.y + 27} fontSize={15} fontWeight={600} style={{ fill: b.kind === "claude" ? "var(--accent-ink)" : "var(--text)" }}>{b.title}</text>
      {b.lines.map((l, i) => (
        <text key={l} x={b.x + 16} y={b.y + 49 + i * 19} fontSize={12.5} style={{ fill: "var(--muted)" }}>{l}</text>
      ))}
    </g>
  );
}

function Arrow({ d, label, lx, ly }: { d: string; label?: string; lx?: number; ly?: number }) {
  return (
    <g>
      <path d={d} fill="none" strokeWidth={1.4} markerEnd="url(#arch-arrow)" style={{ stroke: "var(--muted)" }} />
      {label && (
        <text x={lx} y={ly} fontSize={11.5} textAnchor="middle" style={{ fill: "var(--muted)", paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 5 }}>{label}</text>
      )}
    </g>
  );
}

export function Architecture({ evals, backtest }: { evals: string; backtest: string }) {
  const W = 260;
  const L = [30, 370, 710];
  const boxes: Record<string, Box> = {
    gen: { x: L[0], y: 64, w: W, h: 76, title: "Data generator", lines: ["500 tasks, 9 hidden patterns"] },
    val: { x: L[0], y: 168, w: W, h: 76, title: "Validator", lines: ["20 checks on every rebuild"] },
    mod: { x: L[0], y: 272, w: W, h: 76, title: "Prediction & search", lines: [backtest] },
    art: { x: L[0], y: 376, w: W, h: 76, title: "Precomputed results", lines: ["predictions, fixes, map"] },
    design: { x: L[1], y: 64, w: W, h: 76, title: "Claude Design", lines: ["the UI prototype, v1 to v3"], kind: "claude" },
    haiku: { x: L[1], y: 206, w: W, h: 94, title: "Claude Haiku · the writer", lines: ["fast, low-cost model:", "task summaries & briefing text"], kind: "claude" },
    agent: { x: L[1], y: 364, w: W, h: 94, title: "Claude Sonnet · the agent", lines: ["answers questions with", `8 read-only tools · ${evals}`], kind: "claude" },
    app: { x: L[2], y: 64, w: W, h: 232, title: "Signal (Next.js)", lines: ["Briefing", "Queue & task pages", "Process map", "Ask the agent", "Team notes"], kind: "live" },
    redis: { x: L[2], y: 376, w: W, h: 76, title: "Upstash Redis", lines: ["rate limits · team notes"] },
  };
  const b = boxes;
  const right = (x: Box) => x.x + x.w;
  const midY = (x: Box) => x.y + x.h / 2;
  return (
    <svg viewBox="0 0 1000 480" className="block h-auto w-full min-w-[760px]" role="img" aria-label="Architecture: Python pipeline, Claude models, and the live app">
      <defs>
        <marker id="arch-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: "var(--muted)" }} />
        </marker>
      </defs>
      {[["OFFLINE · PYTHON", L[0]], ["CLAUDE", L[1]], ["LIVE · VERCEL", L[2]]].map(([label, x]) => (
        <text key={label} x={Number(x)} y={36} fontSize={11.5} letterSpacing={1.2} fontFamily="var(--font-mono)" style={{ fill: "var(--faint)" }}>{label}</text>
      ))}
      {/* pipeline */}
      <Arrow d={`M${b.gen.x + W / 2} ${b.gen.y + b.gen.h} V${b.val.y - 4}`} />
      <Arrow d={`M${b.val.x + W / 2} ${b.val.y + b.val.h} V${b.mod.y - 4}`} />
      <Arrow d={`M${b.mod.x + W / 2} ${b.mod.y + b.mod.h} V${b.art.y - 4}`} />
      {/* results feed the writer and the agent */}
      <Arrow d={`M${right(b.art)} ${midY(b.art) - 14} C${right(b.art) + 40} ${midY(b.art) - 14}, ${b.haiku.x - 40} ${midY(b.haiku)}, ${b.haiku.x - 4} ${midY(b.haiku)}`} label="facts" lx={330} ly={300} />
      <Arrow d={`M${right(b.art)} ${midY(b.art) + 10} H${b.agent.x - 4}`} label="tools read" lx={330} ly={b.art.y + 56} />
      {/* Claude into the app */}
      <Arrow d={`M${right(b.design)} ${midY(b.design)} H${b.app.x - 4}`} label="handoff" lx={670} ly={midY(b.design) - 8} />
      <Arrow d={`M${right(b.haiku)} ${midY(b.haiku)} H${b.app.x - 4}`} label="text" lx={670} ly={midY(b.haiku) - 8} />
      <Arrow d={`M${right(b.agent)} ${midY(b.agent) - 12} C${right(b.agent) + 50} ${midY(b.agent) - 12}, ${b.app.x - 50} ${b.app.y + b.app.h - 30}, ${b.app.x - 4} ${b.app.y + b.app.h - 30}`} label="answers" lx={670} ly={330} />
      <Arrow d={`M${b.app.x + W / 2} ${b.app.y + b.app.h} V${b.redis.y - 4}`} />
      {Object.values(b).map((x) => <SvgBox key={x.title} b={x} />)}
    </svg>
  );
}

// ── Design evolution ──

export function WireframeDashboard() {
  const line = { style: { fill: "var(--surface3)" } };
  return (
    <svg viewBox="0 0 320 200" className="block h-auto w-full" role="img" aria-label="Wireframe of the first design: KPI cards and a table">
      <rect x="0" y="0" width="320" height="200" rx="8" style={{ fill: "var(--surface)", stroke: "var(--border)" }} />
      <rect x="0" y="0" width="64" height="200" rx="8" style={{ fill: "var(--surface2)" }} />
      {[24, 40, 56].map((y) => <rect key={y} x="12" y={y} width="38" height="6" rx="3" {...line} />)}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={78 + i * 59} y="16" width="51" height="36" rx="5" style={{ fill: "var(--bg)", stroke: "var(--border)" }} />
          <rect x={84 + i * 59} y="24" width="22" height="5" rx="2.5" {...line} />
          <rect x={84 + i * 59} y="35" width="30" height="10" rx="3" style={{ fill: "var(--border2)" }} />
        </g>
      ))}
      {Array.from({ length: 7 }, (_, r) => (
        <g key={r}>
          {[78, 120, 180, 240].map((x, c) => <rect key={c} x={x} y={68 + r * 18} width={[30, 46, 40, 56][c]} height="6" rx="3" {...line} />)}
          <rect x={300} y={68 + r * 18} width="8" height="6" rx="3" style={{ fill: r < 2 ? "var(--red)" : "var(--surface3)" }} />
        </g>
      ))}
    </svg>
  );
}

