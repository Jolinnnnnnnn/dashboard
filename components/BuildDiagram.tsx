"use client";

import { useState } from "react";

import { NODES, PHASES, type NodeId } from "@/lib/story";

// One clickable diagram of the system. Click a box for one sentence (and a mistake caught there);
// click a phase to light up what it built.

type Box = { id: NodeId; x: number; y: number; w: number; dashed?: boolean; claude?: boolean };
const H = 56;
const BOXES: Box[] = [
  { id: "data", x: 40, y: 30, w: 200 },
  { id: "tableau", x: 290, y: 30, w: 230, dashed: true },
  { id: "checks", x: 40, y: 170, w: 170 },
  { id: "predict", x: 270, y: 170, w: 170 },
  { id: "detect", x: 500, y: 170, w: 170 },
  { id: "claude", x: 730, y: 170, w: 170, claude: true },
  { id: "queue", x: 130, y: 310, w: 150 },
  { id: "map", x: 310, y: 310, w: 150 },
  { id: "briefing", x: 560, y: 310, w: 150 },
  { id: "agent", x: 740, y: 310, w: 150 },
];
const EDGES: { d: string; dashed?: boolean }[] = [
  { d: "M125 86 V164" },
  { d: "M405 86 C405 132, 190 126, 190 164", dashed: true },
  { d: "M210 198 H264" },
  { d: "M440 198 H494" },
  { d: "M670 198 H724" },
  { d: "M330 226 C330 268, 205 268, 205 304" },
  { d: "M385 226 V304" },
  { d: "M770 226 C770 268, 635 268, 635 304" },
  { d: "M815 226 V304" },
];
const LAYERS = [["INPUT", 22], ["PROCESSING", 162], ["WHAT YOU SEE", 302]] as const;

export function BuildDiagram({ values, repo }: { values: Record<string, string>; repo: string }) {
  const [node, setNode] = useState<NodeId | null>("tableau");
  const [phase, setPhase] = useState<number | null>(null);
  const lit = phase !== null ? new Set(PHASES[phase - 1].nodes) : null;
  const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? k);
  const info = node ? NODES[node] : null;
  const p = phase !== null ? PHASES[phase - 1] : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-xl bg-surface px-2 py-3">
        <svg viewBox="0 0 940 390" className="block h-auto w-full min-w-[720px]" role="img" aria-label="System diagram: click a box to learn about it">
          <defs>
            <marker id="bd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" style={{ fill: "var(--faint)" }} />
            </marker>
          </defs>
          {LAYERS.map(([label, y]) => (
            <text key={label} x={930} y={y} textAnchor="end" fontSize={10.5} letterSpacing={1.2} fontFamily="var(--font-mono)" style={{ fill: "var(--faint)" }}>{label}</text>
          ))}
          {EDGES.map((e) => (
            <path key={e.d} d={e.d} fill="none" strokeWidth={1.4} strokeDasharray={e.dashed ? "4 4" : undefined} markerEnd="url(#bd-arrow)" style={{ stroke: "var(--border2)" }} />
          ))}
          <text x={300} y={124} fontSize={11.5} textAnchor="middle" style={{ fill: "var(--accent-ink)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 5 }}>swap in</text>
          {BOXES.map((b) => {
            const selected = node === b.id;
            const dim = lit !== null && !lit.has(b.id);
            const on = lit?.has(b.id);
            return (
              <g
                key={b.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={NODES[b.id].title}
                onClick={() => { setNode(b.id); setPhase(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setNode(b.id); setPhase(null); } }}
                style={{ cursor: "pointer", opacity: dim ? 0.3 : 1, transition: "opacity 200ms" }}
                className="outline-none"
              >
                <rect
                  x={b.x} y={b.y} width={b.w} height={H} rx={12}
                  strokeWidth={selected || on ? 2 : 1.2}
                  strokeDasharray={b.dashed ? "5 4" : undefined}
                  style={{
                    fill: selected ? "var(--accent-soft)" : b.claude ? "var(--accent-soft)" : "var(--bg)",
                    stroke: selected || on ? "var(--accent)" : b.claude ? "var(--accent)" : "var(--border2)",
                    transition: "fill 150ms, stroke 150ms",
                  }}
                />
                <text x={b.x + b.w / 2} y={b.y + H / 2 + 5} textAnchor="middle" fontSize={14.5} fontWeight={600}
                  style={{ fill: b.dashed && !selected ? "var(--muted)" : b.claude || selected ? "var(--accent-ink)" : "var(--text)" }}>
                  {NODES[b.id].title}
                </text>
                {NODES[b.id].caught && <circle cx={b.x + b.w - 12} cy={b.y + 12} r={4} style={{ fill: "var(--amber)" }} />}
              </g>
            );
          })}
        </svg>
      </div>

      {/* What the selection means */}
      <div className="min-h-[132px] max-w-[760px]" aria-live="polite">
        {p ? (
          <div className="flex flex-col gap-2">
            <div className="font-mono text-[11px] tracking-[.08em] text-faint">PHASE {p.phase}</div>
            <div className="font-serif text-[30px] leading-none">{p.name}</div>
            <div className="text-pretty text-[15px] leading-relaxed text-muted">{p.line}</div>
            <a href={`${repo}/commit/${p.commit}`} target="_blank" rel="noreferrer" className="self-start font-mono text-xs">commit {p.commit} ↗</a>
          </div>
        ) : info ? (
          <div className="flex flex-col gap-2">
            <div className="font-serif text-[30px] leading-none">{info.title}</div>
            <div className="text-pretty text-[15px] leading-relaxed text-muted">{fill(info.line)}</div>
            {info.caught && (
              <div className="mt-1 flex items-start gap-2.5 rounded-lg bg-amber-soft px-3 py-2.5">
                <span className="mt-1.5 size-2 flex-none rounded-full bg-amber" />
                <div className="text-pretty leading-relaxed">
                  <span className="font-medium">Caught here: </span>{info.caught.what}{" "}
                  <a href={`${repo}/commit/${info.caught.commit}`} target="_blank" rel="noreferrer" className="whitespace-nowrap font-mono text-xs">fix ↗</a>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Phases */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line2 pt-5">
        <span className="mr-1 text-xs text-faint">Build order</span>
        {PHASES.map((ph) => (
          <button
            key={ph.phase}
            onClick={() => { setPhase(phase === ph.phase ? null : ph.phase); setNode(null); }}
            aria-pressed={phase === ph.phase}
            className={`rounded-full border px-3 py-1 ${phase === ph.phase ? "border-accent bg-accent text-on-accent" : "border-line2 bg-transparent text-ink hover:border-accent"}`}
          >
            <span className="font-mono text-[11px] opacity-70">P{ph.phase}</span> {ph.name}
          </button>
        ))}
      </div>
    </div>
  );
}
