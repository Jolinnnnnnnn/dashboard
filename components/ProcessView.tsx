"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AskButton, useAgent } from "@/components/AgentDock";
import { DEFAULT_WINDOW, WINDOWS } from "@/lib/filters";
import { riskVars } from "@/components/ui";
import type { MapEdge, MapNode, MapWindow } from "@/lib/types";

const MIN_EDGE_SHARE = 0.03; // hide minor routes (mostly random detours) to keep the map readable

// Fixed layout in a 1120×440 viewBox: work flows left to right, Closed bottom-right.
const POS: Record<string, [number, number]> = {
  intake: [70, 220], support: [260, 120], security: [260, 340], network_eng: [500, 80], ops: [500, 260],
  dev: [730, 130], qa: [730, 330], customer: [900, 200], closed: [1050, 320],
};

// Rough stage order, so a "sent back" label only goes on edges that move work backwards
const STAGE: Record<string, number> = {
  intake: 0, support: 1, security: 2, network_eng: 2, ops: 3, dev: 3, qa: 4, customer: 5, closed: 6,
};

const radius = (volume: number) => 12 + Math.sqrt(volume) * 1.45;
// Avg wait 0.5d (green) → 2.8d+ (red), as in the design
const waitColor = (w: number) => `oklch(0.68 0.15 ${Math.round(150 - 125 * Math.max(0, Math.min(1, (w - 0.5) / 2.3)))})`;

type Placed = MapNode & { x: number; y: number; r: number };

/** Cubic curve from a to b, bowed sideways by `offset`; tries offsets until it clears every other node. */
function routeEdge(a: Placed, b: Placed, others: Placed[], startOffset: number) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const px = -uy, py = ux; // perpendicular
  const x1 = a.x + ux * a.r, y1 = a.y + uy * a.r, x2 = b.x - ux * (b.r + 6), y2 = b.y - uy * (b.r + 6);
  const offsets = [0, 45, -45, 90, -90, 140, -140].map((o) => o + startOffset);
  for (const o of offsets) {
    const c1 = [x1 + dx / 3 + px * o, y1 + dy / 3 + py * o], c2 = [x1 + (2 * dx) / 3 + px * o, y1 + (2 * dy) / 3 + py * o];
    const clear = others.every((n) => {
      for (let t = 0.05; t < 1; t += 0.05) {
        const m = 1 - t;
        const x = m * m * m * x1 + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * x2;
        const y = m * m * m * y1 + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * y2;
        if (Math.hypot(x - n.x, y - n.y) < n.r + 8) return false;
      }
      return true;
    });
    if (clear || o === offsets.at(-1)) {
      const mid = { x: (x1 + x2) / 2 + px * o * 0.75, y: (y1 + y2) / 2 + py * o * 0.75 };
      return { d: `M ${x1} ${y1} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${x2} ${y2}`, mid };
    }
  }
  throw new Error("unreachable");
}

function MapSvg({ w, selected, onSelect, animate }: {
  w: MapWindow; selected: string | null; onSelect: (id: string | null) => void; animate: boolean;
}) {
  const nodes: Placed[] = w.nodes.filter((n) => POS[n.id]).map((n) => ({ ...n, x: POS[n.id][0], y: POS[n.id][1], r: radius(n.volume) }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges = w.edges.filter((e) => e.share >= MIN_EDGE_SHARE && byId[e.from] && byId[e.to]);
  const pairs = new Set(edges.map((e) => `${e.from}>${e.to}`));

  return (
    <svg viewBox="0 0 1120 440" className="block h-auto w-full min-[900px]:h-full" role="img" aria-label="Process map of handoffs between stakeholders">
      <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: "var(--muted)" }} />
        </marker>
      </defs>
      {edges.map((e: MapEdge, i) => {
        const a = byId[e.from], b = byId[e.to];
        // Two-way pairs (e.g. Support ⇄ Security) bow apart so they don't overlap
        const twoWay = pairs.has(`${e.to}>${e.from}`);
        const { d, mid } = routeEdge(a, b, nodes.filter((n) => n !== a && n !== b), twoWay ? 35 : 0);
        const dim = selected !== null && e.from !== selected && e.to !== selected;
        const showRework = e.rework >= w.minRework && STAGE[e.to] < STAGE[e.from];
        return (
          <g key={`${e.from}-${e.to}`}>
            <path
              d={d}
              fill="none"
              stroke={waitColor(e.avgWait)}
              strokeWidth={1.5 + e.share * 9}
              strokeLinecap="round"
              markerEnd="url(#arr)"
              opacity={dim ? 0.18 : 0.85}
              pathLength={animate ? 1 : undefined}
              strokeDasharray={animate ? 1 : undefined}
              style={animate ? { animation: `draw 300ms ease-out ${i * 25}ms both` } : { transition: "opacity 200ms" }}
            >
              <title>{`${a.name} → ${b.name} · ${Math.round(e.share * 100)}% of tasks · ${e.avgWait.toFixed(1)}d avg wait`}</title>
            </path>
            {showRework && (
              <text
                x={mid.x} y={mid.y} fontSize={12} fontWeight={500} textAnchor="middle" opacity={dim ? 0.3 : 1}
                style={{ fill: "var(--red-ink)", paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}
              >
                {e.rework} sent back
              </text>
            )}
          </g>
        );
      })}
      {nodes.map((n) => {
        const on = selected === n.id;
        return (
          <g
            key={n.id}
            onClick={() => onSelect(on ? null : n.id)}
            role="button"
            aria-label={`${n.name}: ${n.volume} tasks`}
            style={{ cursor: "pointer", opacity: selected && !on ? 0.55 : 1, transition: "opacity 200ms" }}
          >
            <circle
              cx={n.x} cy={n.y} r={n.r} strokeWidth={on ? 2 : 1.25}
              style={{ fill: on ? "var(--accent-soft)" : n.id === "closed" ? "var(--surface2)" : "var(--surface)", stroke: on ? "var(--accent)" : "var(--border2)" }}
            />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize={12} fontFamily="var(--font-mono)" style={{ fill: "var(--muted)" }}>{n.volume}</text>
            <text x={n.x} y={n.y + n.r + 17} textAnchor="middle" fontSize={13} fontWeight={500} style={{ fill: "var(--text)" }}>{n.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

function NodePanel({ n, label, onClose }: { n: MapNode; label: string; onClose: () => void }) {
  const { ask } = useAgent();
  const max = Math.max(n.avgHold ?? 0, n.medianHold ?? 0) || 1;
  const ratio = (n.avgHold ?? 0) / (n.medianHold || 1);
  return (
    <div className="anim-slide flex h-[420px] min-w-0 flex-none flex-col gap-4 overflow-y-auto border-t border-line bg-surface px-[18px] py-4 min-[900px]:h-full min-[900px]:w-[320px] min-[900px]:border-l min-[900px]:border-t-0">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold">{n.name}</div>
          <div className="mt-0.5 text-xs text-muted">{n.volume} tasks {n.id === "closed" ? "closed" : "passed through"} · {label.toLowerCase()}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="border-0 bg-transparent text-base leading-none text-muted hover:text-ink">×</button>
      </div>
      {n.avgHold !== undefined && n.medianHold !== undefined && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted">Avg hold vs median</div>
          {[["Avg", n.avgHold, ratio > 1.2 ? "var(--red)" : ratio > 1 ? "var(--amber)" : "var(--green)"], ["Median", n.medianHold, "var(--border2)"]].map(([lbl, v, c]) => (
            <div key={lbl as string} className="flex items-center gap-2.5">
              <div className={`w-[52px] text-xs ${lbl === "Median" ? "text-muted" : ""}`}>{lbl}</div>
              <div className="h-2 flex-1 rounded bg-surface3"><div className="h-full rounded" style={{ width: `${((v as number) / max) * 100}%`, background: c as string }} /></div>
              <div className="w-9 text-right font-mono text-xs">{(v as number).toFixed(1)}d</div>
            </div>
          ))}
        </div>
      )}
      {n.id !== "closed" && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Open here now ({n.open.length})</div>
          {n.open.slice(0, 4).map((o) => (
            <Link key={o.id} href={`/task/${o.id}`} className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-[7px] text-ink no-underline hover:bg-surface2 hover:text-ink">
              <div className="size-1.5 rounded-full" style={{ background: riskVars(o.risk).dot }} />
              <div className="font-mono text-xs">{o.id}</div>
              <div className="min-w-0 flex-1 truncate text-xs text-muted">{o.client}</div>
              <div className="text-xs tabular-nums">{o.days}d</div>
            </Link>
          ))}
          {n.open.length === 0 && <div className="py-1 text-xs text-faint">No open tasks at this stage.</div>}
        </div>
      )}
      {n.next.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-muted">Top next stops</div>
          {n.next.map((x, i) => (
            <div key={x.name} className="flex items-center gap-2.5">
              <div className="w-[84px] text-xs">{x.name}</div>
              <div className="h-1.5 flex-1 rounded-[3px] bg-surface3"><div className="h-full rounded-[3px] bg-accent" style={{ width: `${x.pct}%`, opacity: [1, 0.5, 0.28][i] }} /></div>
              <div className="w-8 text-right font-mono text-xs text-muted">{x.pct}%</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-pretty rounded-md border border-line bg-surface2 px-3 py-2.5 leading-normal">{n.insight}</div>
      <button
        onClick={() => ask(`What's happening at ${n.name}?`, n.name)}
        className="flex h-8 items-center justify-center gap-[7px] rounded-lg border border-transparent bg-accent-soft font-medium text-accent-ink hover:border-accent"
      >
        <span className="size-1.5 rounded-[2px] bg-accent" />Ask agent about {n.name}
      </button>
    </div>
  );
}

function Header({ w, onWindow }: { w?: MapWindow; onWindow?: (key: string) => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 min-[900px]:flex-nowrap min-[900px]:gap-6">
      <div className="min-w-0">
        <h1 className="m-0 text-xl font-semibold tracking-[-0.015em]">Process map</h1>
        <div className="mt-[3px] text-muted">
          How tasks move between stakeholders{w ? ` · ${w.label.toLowerCase()} · ${w.tasks} tasks, median ${w.medianDaysToClose}d to close` : ""}
        </div>
      </div>
      <div className="flex flex-none flex-col items-start gap-2.5 min-[900px]:items-end">
        {/* History window lives next to the map it controls */}
        <select
          aria-label="History window"
          className="field"
          value={w?.key ?? DEFAULT_WINDOW}
          disabled={!onWindow}
          onChange={(e) => onWindow?.(e.target.value)}
        >
          {WINDOWS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        <div className="flex items-center gap-1.5"><div className="h-0.5 w-[18px] bg-line2" /><div className="h-1.5 w-[18px] rounded-[3px] bg-line2" />Share of tasks</div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-14 rounded-[3px]" style={{ background: "linear-gradient(90deg,oklch(0.68 0.15 150),oklch(0.72 0.15 90),oklch(0.68 0.15 25))" }} />
          Avg wait 0.5d → 3d
        </div>
        </div>
      </div>
    </div>
  );
}

export function ProcessView({ windows }: { windows: MapWindow[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const w = windows.find((x) => x.key === (params.get("window") ?? DEFAULT_WINDOW)) ?? windows.at(-1)!;
  const [selected, setSelected] = useState<string | null>(params.get("node"));
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAnimate(false), 900); // edges draw in once
    return () => clearTimeout(t);
  }, []);
  const node = useMemo(() => w.nodes.find((n) => n.id === selected), [w, selected]);
  const hidden = w.edges.filter((e) => e.share < MIN_EDGE_SHARE).length;
  const maxModule = w.modules[0]?.count || 1;

  return (
    <div className="flex flex-col gap-5">
      <Header w={w} onWindow={(key) => router.replace(key === DEFAULT_WINDOW ? "/process" : `/process?window=${key}`, { scroll: false })} />
      <div className="flex flex-col overflow-hidden rounded-xl bg-surface min-[900px]:h-[520px] min-[900px]:flex-row">
        <div className="relative flex min-w-0 flex-1 flex-col px-4 py-3.5">
          <div className="text-xs text-faint">
            Click a stakeholder to inspect · node size = task volume · {hidden} minor routes under {MIN_EDGE_SHARE * 100}% of tasks hidden
          </div>
          <div className="mt-1.5 min-h-0 flex-1">
            <MapSvg w={w} selected={selected} onSelect={setSelected} animate={animate} />
          </div>
        </div>
        {node && <NodePanel n={node} label={w.label} onClose={() => setSelected(null)} />}
      </div>

      <div className="rule">
        <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-semibold">Top problem modules</div>
          <div className="flex items-center gap-2.5">
            <div className="text-xs text-faint">Tasks touching each module · {w.label.toLowerCase()}</div>
            <AskButton q={`Which clients are blocked on ${w.modules[0]?.id}/?`} context={`${w.modules[0]?.id}/`} />
          </div>
        </div>
        <div className="flex flex-col gap-[9px]">
          {w.modules.slice(0, 8).map((m, i) => (
            <div key={m.id} className="flex items-center gap-3">
              <div className="w-[150px] flex-none font-mono text-xs">{m.id}/</div>
              <div className="h-3.5 flex-1 rounded-[3px] bg-surface2">
                <div className="anim-fill h-full rounded-[3px] bg-accent" style={{ width: `${(m.count / maxModule) * 100}%`, opacity: i === 0 ? 1 : 0.5 }} />
              </div>
              <div className="w-7 text-right text-xs tabular-nums text-muted">{m.count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProcessViewFallback() {
  return (
    <div className="flex flex-col gap-5">
      <Header />
      <div className="rounded-xl bg-surface px-4 py-3.5 min-[900px]:h-[520px]"><div className="skeleton mt-3 h-[420px] rounded-md" /></div>
    </div>
  );
}
