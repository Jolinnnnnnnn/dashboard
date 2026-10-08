// Illustrations for the "How it was built" page. Plain SVG/HTML using theme tokens, so they work in
// light and dark mode without images.

import { IDEAS, JOURNEY, LOOP } from "@/lib/story";

// ── Brainstorm board ──

const NOTE_TONE: Record<string, { bg: string; ink: string }> = {
  amber: { bg: "var(--amber-soft)", ink: "var(--amber-ink)" },
  accent: { bg: "var(--accent-soft)", ink: "var(--accent-ink)" },
  green: { bg: "var(--green-soft)", ink: "var(--green-ink)" },
  red: { bg: "var(--red-soft)", ink: "var(--red-ink)" },
};
const TILT = [-2, 1.5, -1, 2, -1.5];

export function Brainstorm() {
  return (
    <div className="grid grid-cols-1 gap-5 min-[640px]:grid-cols-2 min-[1100px]:grid-cols-5">
      {IDEAS.map((idea, i) => (
        <div
          key={idea.text}
          className="flex min-h-[120px] flex-col justify-between rounded-md p-4 shadow-[0_6px_18px_rgba(16,24,40,0.08)] transition-transform duration-200 hover:rotate-0"
          style={{ background: NOTE_TONE[idea.tone].bg, transform: `rotate(${TILT[i % TILT.length]}deg)` }}
        >
          <div className="text-balance font-serif text-[24px] leading-[1.15] text-ink">{idea.text}</div>
          <div className="mt-3 font-mono text-[10.5px] tracking-[.08em]" style={{ color: NOTE_TONE[idea.tone].ink }}>IDEA {i + 1}</div>
        </div>
      ))}
    </div>
  );
}

// ── Journey ──

function Icon({ name }: { name: string }) {
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
  return <svg viewBox="0 0 20 20" className="size-5" aria-hidden>{paths[name]}</svg>;
}

export function Journey({ times, firstCommit, repo }: { times: Record<string, string>; firstCommit: string; repo: string }) {
  const start = new Date(firstCommit).getTime();
  return (
    <ol className="relative m-0 grid list-none grid-cols-1 gap-6 p-0 min-[900px]:grid-cols-7 min-[900px]:gap-3">
      {/* connecting line (horizontal on wide screens) */}
      <div className="absolute left-[19px] top-5 hidden h-px bg-line2 min-[900px]:left-[7%] min-[900px]:right-[7%] min-[900px]:block" aria-hidden />
      {JOURNEY.map((j, i) => {
        const at = times[j.commit];
        const hours = at ? (new Date(at).getTime() - start) / 3_600_000 : null;
        const last = i === JOURNEY.length - 1;
        return (
          <li key={j.step} className="relative flex gap-4 min-[900px]:flex-col min-[900px]:items-center min-[900px]:gap-3 min-[900px]:text-center">
            <a
              href={`${repo}/commit/${j.commit}`}
              target="_blank"
              rel="noreferrer"
              title={`commit ${j.commit}`}
              className={`relative z-10 flex size-10 flex-none items-center justify-center rounded-full border no-underline ${last ? "border-accent bg-accent text-on-accent hover:text-on-accent" : "border-line2 bg-surface text-ink hover:border-accent hover:text-accent-ink"}`}
            >
              <Icon name={j.icon} />
            </a>
            <div>
              <div className="font-serif text-[22px] leading-none">{j.step}</div>
              <div className="mt-1.5 text-pretty text-[12.5px] leading-snug text-muted">{j.line}</div>
              {hours !== null && <div className="mt-1.5 font-mono text-[11px] text-faint">{hours < 0.05 ? "start" : `+${hours.toFixed(1)}h`}</div>}
            </div>
          </li>
        );
      })}
    </ol>
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
    design: { x: L[1], y: 64, w: W, h: 76, title: "Claude Design", lines: ["prototype, v1 to v3"], kind: "claude" },
    haiku: { x: L[1], y: 220, w: W, h: 76, title: "Claude Haiku", lines: ["writes summaries & briefing"], kind: "claude" },
    agent: { x: L[1], y: 376, w: W, h: 76, title: "Claude Sonnet agent", lines: [`8 read-only tools · ${evals}`], kind: "claude" },
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

// ── Working loop ──

export function Loop() {
  const cx = 180, cy = 150, r = 105;
  const pts = LOOP.map((_, i) => {
    const a = (-90 + (360 / LOOP.length) * i) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
  return (
    <svg viewBox="0 0 360 300" className="mx-auto block h-auto w-full max-w-[380px]" role="img" aria-label="Working loop: plan, build, verify, ship, log">
      <defs>
        <marker id="loop-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" style={{ fill: "var(--accent)" }} />
        </marker>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" strokeDasharray="3 5" style={{ stroke: "var(--border2)" }} />
      {pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        // Start and end on the node edges (radius 30) so the arrowheads stay visible
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
        const s = { x: p.x + ux * 34, y: p.y + uy * 34 }, e = { x: q.x - ux * 36, y: q.y - uy * 36 };
        const mx = (s.x + e.x) / 2, my = (s.y + e.y) / 2;
        const ox = (mx - cx) * 0.18, oy = (my - cy) * 0.18;
        return <path key={i} d={`M${s.x} ${s.y} Q${mx + ox} ${my + oy} ${e.x} ${e.y}`} fill="none" strokeWidth={1.6} markerEnd="url(#loop-arrow)" style={{ stroke: "var(--accent)" }} />;
      })}
      {pts.map((p, i) => (
        <g key={LOOP[i]}>
          <circle cx={p.x} cy={p.y} r={30} style={{ fill: "var(--surface)", stroke: "var(--accent)" }} strokeWidth={1.4} />
          <text x={p.x} y={p.y + 5} fontSize={14} fontWeight={600} textAnchor="middle" style={{ fill: "var(--text)" }}>{LOOP[i]}</text>
        </g>
      ))}
      <text x={cx} y={cy - 6} fontSize={13} textAnchor="middle" style={{ fill: "var(--muted)" }}>Claude Code builds</text>
      <text x={cx} y={cy + 14} fontSize={13} textAnchor="middle" style={{ fill: "var(--muted)" }}>I steer and check</text>
    </svg>
  );
}
