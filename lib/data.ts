// Server-only data access. Pages and (later) the agent read data through here, never the JSON directly.
// Everything is precomputed by scripts/ (see CLAUDE.md); this file only reshapes it for the UI.
import "server-only";

import clientsJson from "@/data/clients.json";
import handoffsJson from "@/data/handoffs.json";
import modulesJson from "@/data/modules.json";
import stakeholdersJson from "@/data/stakeholders.json";
import tasksJson from "@/data/tasks.json";
import predictionsJson from "@/data/artifacts/predictions.json";
import processMapJson from "@/data/artifacts/process_map.json";
import similarJson from "@/data/artifacts/similar_cases.json";
import summariesJson from "@/data/artifacts/summaries.json";
import transitionsJson from "@/data/artifacts/transitions.json";

import type {
  CodeArea, FilterOptions, MapWindow, QueueRow, QueueStats, Risk, Segment, SimilarCaseView, TaskDetail,
} from "@/lib/types";

// ── Raw shapes (see docs/data-spec.md) ──

type RawTask = {
  id: string; title: string; description: string; client_id: string; type: string; family: string;
  status: "open" | "closed"; created_at: string; closed_at: string | null; code_areas: string[];
  solution_note: string; current_stakeholder: string;
};
type RawHandoff = {
  task_id: string; seq: number; from_stakeholder: string | null; to_stakeholder: string;
  entered_at: string; left_at: string | null; hold_days: number | null;
};
type RawPrediction = {
  current_stakeholder: string; hold_days: number; median_hold_days: number; hold_ratio: number; risk: Risk;
  next: { stakeholder: string; probability: number; count: number }[]; basis: string; reason: string;
  expected_path: string[]; eta_days: number; estimated_close: string;
};
type RawSimilar = {
  task_id: string; title: string; client: string; score: number; text_score: number; module_score: number;
  shared_modules: string[]; matched_on: string; solution_note: string; resolution_days: number;
};
type RawTransition = { n: number; next: Record<string, number>; median_hold_days: number };
type RawMapNode = {
  id: string; name: string; volume: number; avg_hold_days?: number; median_hold_days?: number;
  next?: { stakeholder: string; share: number }[]; insight: string;
};
type RawMapWindow = {
  label: string; tasks: number; closed: number; median_days_to_close: number; bottleneck: string;
  min_rework_tasks: number; nodes: RawMapNode[];
  edges: { from: string; to: string; count: number; share_of_tasks: number; avg_wait_days: number; rework_tasks: number }[];
  modules: { id: string; count: number }[];
};

const TASKS = tasksJson as unknown as RawTask[];
const HANDOFFS = handoffsJson as unknown as RawHandoff[];
const PREDICTIONS = predictionsJson as unknown as Record<string, RawPrediction>;
const SIMILAR = similarJson as unknown as Record<string, RawSimilar[]>;
const SUMMARIES = summariesJson as unknown as Record<string, { summary: string }>;
const TRANSITIONS = transitionsJson as unknown as {
  min_pair_examples: number;
  by_stakeholder: Record<string, RawTransition>;
  by_pair: Record<string, Record<string, RawTransition>>;
};
const MAP = processMapJson as unknown as { as_of: string; windows: Record<string, RawMapWindow> };

/** Fixed "today" for the synthetic data (matches scripts/relay_data.py). */
export const TODAY = new Date("2026-10-07T09:00:00Z");
export const DATA_AS_OF = "Oct 7, 2026";

const DAY_MS = 86_400_000;
const STAKEHOLDER_NAMES = Object.fromEntries(stakeholdersJson.map((s) => [s.id, s.name]));
const CLIENT_NAMES = Object.fromEntries(clientsJson.map((c) => [c.id, c.name]));
const MODULE_NOTES = Object.fromEntries(modulesJson.map((m) => [m.id, m.description]));
const TASK_BY_ID = new Map(TASKS.map((t) => [t.id, t]));
const OPEN_TASKS = TASKS.filter((t) => t.status === "open");

const HANDOFFS_BY_TASK = new Map<string, RawHandoff[]>();
for (const h of HANDOFFS) {
  const list = HANDOFFS_BY_TASK.get(h.task_id) ?? [];
  list.push(h);
  HANDOFFS_BY_TASK.set(h.task_id, list);
}

// Module task counts over the full history; a "hotspot" has at least 2× the average module's tasks.
const MODULE_COUNTS = Object.fromEntries(MAP.windows["365"].modules.map((m) => [m.id, m.count]));
const MODULE_AVG = MAP.windows["365"].modules.reduce((a, m) => a + m.count, 0) / modulesJson.length;

export const name = (stakeholder: string) => STAKEHOLDER_NAMES[stakeholder] ?? stakeholder;
const round1 = (x: number) => Math.round(x * 10) / 10;
const daysBetween = (a: string, b: Date) => (b.getTime() - new Date(a).getTime()) / DAY_MS;
export const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function nextStops(p: RawPrediction) {
  return p.next.slice(0, 3).map((n) => ({ name: name(n.stakeholder), pct: Math.round(n.probability * 100) }));
}

function medianHold(stakeholder: string, type: string): number {
  const pair = TRANSITIONS.by_pair[stakeholder]?.[type];
  if (pair && pair.n >= TRANSITIONS.min_pair_examples) return pair.median_hold_days;
  return TRANSITIONS.by_stakeholder[stakeholder]?.median_hold_days ?? 1;
}

// ── Queue ──

export function getQueueRows(): QueueRow[] {
  return OPEN_TASKS.map((t) => {
    const p = PREDICTIONS[t.id];
    return {
      id: t.id,
      client: CLIENT_NAMES[t.client_id],
      type: t.type,
      stakeholder: name(p.current_stakeholder),
      days: round1(p.hold_days),
      median: round1(p.median_hold_days),
      ratio: p.hold_ratio,
      risk: p.risk,
      next: nextStops(p),
    };
  });
}

export function getQueueStats(): QueueStats {
  const preds = OPEN_TASKS.map((t) => PREDICTIONS[t.id]);
  const ages = OPEN_TASKS.map((t) => daysBetween(t.created_at, TODAY)).sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  const median = ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2;
  const w = MAP.windows["365"];
  const bottleneck = w.nodes.find((n) => n.id === w.bottleneck)!;
  return {
    open: OPEN_TASKS.length,
    atRisk: preds.filter((p) => p.risk !== "Low").length,
    high: preds.filter((p) => p.risk === "High").length,
    clients: new Set(OPEN_TASKS.map((t) => t.client_id)).size,
    avgDaysOpen: round1(ages.reduce((a, b) => a + b, 0) / ages.length),
    medianDaysOpen: round1(median),
    bottleneck: { id: bottleneck.id, name: bottleneck.name, medianHold: round1(bottleneck.median_hold_days ?? 0) },
  };
}

export function getFilterOptions(): FilterOptions {
  const rows = getQueueRows();
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  return { types: uniq(rows.map((r) => r.type)), clients: uniq(rows.map((r) => r.client)), stakeholders: uniq(rows.map((r) => r.stakeholder)) };
}

// ── Task detail ──

export const allTaskIds = () => TASKS.map((t) => t.id);

/** Handoff stints for a task, merging duplicate consecutive rows (see relay_data.clean_handoffs). */
function stints(taskId: string) {
  const out: { stakeholder: string; entered: string; hold: number | null }[] = [];
  for (const h of HANDOFFS_BY_TASK.get(taskId) ?? []) {
    const last = out.at(-1);
    if (last && last.stakeholder === h.to_stakeholder) {
      last.hold = last.hold !== null && h.hold_days !== null ? last.hold + h.hold_days : null;
      continue;
    }
    out.push({ stakeholder: h.to_stakeholder, entered: h.entered_at, hold: h.hold_days });
  }
  return out;
}

function codeAreas(paths: string[]): CodeArea[] {
  return paths.map((path) => {
    const mod = path.split("/")[0];
    const tasks = MODULE_COUNTS[mod] ?? 0;
    return { path, note: MODULE_NOTES[mod] ?? "", tasks, hot: tasks >= 2 * MODULE_AVG };
  });
}

function similarCases(taskId: string): SimilarCaseView[] {
  return (SIMILAR[taskId] ?? []).slice(0, 3).map((s) => ({
    id: s.task_id,
    client: s.client,
    title: s.title,
    score: Math.round(s.score * 100),
    matchedOn: s.matched_on,
    solvedBy: s.solution_note || "No solution note recorded",
    closedInDays: s.resolution_days,
  }));
}

function splitSummary(text: string | undefined) {
  if (!text) return { summary: undefined, action: undefined };
  const [summary, action] = text.split(/\n*Suggested action:\s*/);
  return { summary: summary.trim(), action: action?.trim() };
}

export function getTaskDetail(id: string): TaskDetail | null {
  const t = TASK_BY_ID.get(id);
  if (!t) return null;
  const all = stints(id);
  const timeline: Segment[] = all
    .filter((s) => s.stakeholder !== "closed")
    .map((s) => ({
      name: name(s.stakeholder),
      days: round1(s.hold ?? daysBetween(s.entered, TODAY)),
      current: s.hold === null,
    }));
  const base = {
    id: t.id, title: t.title, client: CLIENT_NAMES[t.client_id], type: t.type, status: t.status,
    description: t.description, opened: shortDate(t.created_at), timeline,
    code: codeAreas(t.code_areas), similar: similarCases(id),
  };

  if (t.status === "closed") {
    return {
      ...base,
      openDays: round1((new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()) / DAY_MS),
      predicted: [],
      closed: shortDate(t.closed_at!),
      solutionNote: t.solution_note || "No solution note recorded",
    };
  }

  const p = PREDICTIONS[id];
  const predicted: Segment[] = p.expected_path.map((s) => ({
    name: name(s),
    days: s === "closed" ? 0 : round1(medianHold(s, t.type)),
  }));
  return {
    ...base,
    ...splitSummary(SUMMARIES[id]?.summary),
    openDays: round1(daysBetween(t.created_at, TODAY)),
    predicted,
    risk: p.risk,
    holdDays: round1(p.hold_days),
    medianHold: round1(p.median_hold_days),
    next: nextStops(p),
    reason: p.reason,
    estimatedClose: shortDate(p.estimated_close),
  };
}

// ── Process map ──

export function getProcessMap(): MapWindow[] {
  const openHere = (stakeholder: string) =>
    OPEN_TASKS.map((t) => ({ t, p: PREDICTIONS[t.id] }))
      .filter(({ p }) => p.current_stakeholder === stakeholder)
      .sort((a, b) => b.p.hold_ratio - a.p.hold_ratio)
      .map(({ t, p }) => ({ id: t.id, client: CLIENT_NAMES[t.client_id], days: round1(p.hold_days), risk: p.risk }));

  return Object.entries(MAP.windows).map(([key, w]) => ({
    key,
    label: w.label,
    tasks: w.tasks,
    closed: w.closed,
    medianDaysToClose: w.median_days_to_close,
    minRework: w.min_rework_tasks,
    nodes: w.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      volume: n.volume,
      avgHold: n.avg_hold_days,
      medianHold: n.median_hold_days,
      next: (n.next ?? []).map((x) => ({ name: name(x.stakeholder), pct: Math.round(x.share * 100) })),
      insight: n.insight,
      open: n.id === "closed" ? [] : openHere(n.id),
    })),
    edges: w.edges.map((e) => ({ from: e.from, to: e.to, share: e.share_of_tasks, avgWait: e.avg_wait_days, rework: e.rework_tasks })),
    modules: w.modules,
  }));
}
