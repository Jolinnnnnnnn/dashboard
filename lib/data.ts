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
import briefingJson from "@/data/artifacts/briefing.json";
import eventsJson from "@/data/events.json";
import buildStoryJson from "@/data/artifacts/build_story.json";

import type {
  Briefing, CodeArea, FilterOptions, MapWindow, QueueRow, QueueStats, Risk, Segment, SimilarCaseView, TaskDetail,
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

/** Fixed "today" for the synthetic data (matches scripts/signal_data.py). */
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

/** Handoff stints for a task, merging duplicate consecutive rows (see signal_data.clean_handoffs). */
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

// ── Briefing ──

export function getBriefing(): Briefing {
  return briefingJson as unknown as Briefing;
}

// ── Agent queries (read-only; used by lib/agent/tools.ts) ──
// Return plain JSON so tool results are easy for the model to read and for evals to inspect.

const CLIENT_BY_ID = Object.fromEntries(clientsJson.map((c) => [c.id, c]));
const STAKEHOLDER_IDS = stakeholdersJson.map((s) => s.id);

/** Accepts a stakeholder id ("network_eng") or display name ("Network Eng"), case-insensitive. */
export function resolveStakeholder(input: string): string | null {
  const k = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STAKEHOLDER_IDS.find((id) => id === k || STAKEHOLDER_NAMES[id].toLowerCase().replace(/[\s-]+/g, "_") === k
    || STAKEHOLDER_NAMES[id].toLowerCase().startsWith(input.trim().toLowerCase())) ?? null;
}

function resolveClient(input: string) {
  const k = input.trim().toLowerCase();
  return clientsJson.find((c) => c.name.toLowerCase() === k) ?? clientsJson.find((c) => c.name.toLowerCase().includes(k)) ?? null;
}

const moduleOf = (path: string) => path.split("/")[0];

function taskRow(t: RawTask) {
  const p = PREDICTIONS[t.id];
  return {
    id: t.id, title: t.title, client: CLIENT_NAMES[t.client_id], type: t.type, status: t.status,
    created: t.created_at.slice(0, 10), closed: t.closed_at?.slice(0, 10) ?? null,
    current_stakeholder: t.status === "open" ? name(t.current_stakeholder) : null,
    days_with_current: p ? round1(p.hold_days) : null, risk: p?.risk ?? null,
    modules: [...new Set(t.code_areas.map(moduleOf))],
  };
}

export type TaskSearch = {
  query?: string; status?: "open" | "closed" | "any"; stakeholder?: string; client?: string; type?: string;
  risk?: "High" | "Medium" | "Low" | "at_risk"; module?: string; created_after?: string; limit?: number;
};

export function searchTasks(f: TaskSearch) {
  const stk = f.stakeholder ? resolveStakeholder(f.stakeholder) : null;
  if (f.stakeholder && !stk) return { error: `Unknown stakeholder "${f.stakeholder}". Known: ${stakeholdersJson.map((s) => s.name).join(", ")}` };
  const client = f.client ? resolveClient(f.client) : null;
  if (f.client && !client) return { error: `Unknown client "${f.client}". Known: ${clientsJson.map((c) => c.name).join(", ")}` };
  const q = f.query?.trim().toLowerCase();
  const mod = f.module?.replace(/\/$/, "");
  const status = f.status ?? "any";
  const matches = TASKS.filter((t) => {
    const p = PREDICTIONS[t.id];
    if (status !== "any" && t.status !== status) return false;
    if (stk && (t.status !== "open" || t.current_stakeholder !== stk)) return false;
    if (client && t.client_id !== client.id) return false;
    if (f.type && t.type.toLowerCase() !== f.type.toLowerCase()) return false;
    if (f.risk && (!p || (f.risk === "at_risk" ? p.risk === "Low" : p.risk !== f.risk))) return false;
    if (mod && !t.code_areas.some((a) => moduleOf(a) === mod)) return false;
    if (f.created_after && t.created_at < f.created_after) return false;
    if (q && !(t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      || CLIENT_NAMES[t.client_id].toLowerCase().includes(q))) return false;
    return true;
  });
  // Most urgent first: open tasks by hold ratio, then newest
  matches.sort((a, b) => (PREDICTIONS[b.id]?.hold_ratio ?? -1) - (PREDICTIONS[a.id]?.hold_ratio ?? -1) || b.created_at.localeCompare(a.created_at));
  const limit = Math.min(f.limit ?? 10, 25);
  return { total_matches: matches.length, showing: Math.min(limit, matches.length), tasks: matches.slice(0, limit).map(taskRow) };
}

export function agentTask(id: string) {
  const t = TASK_BY_ID.get(id.trim().toUpperCase());
  if (!t) return { error: `No task ${id}. Task IDs look like T-4821.` };
  const p = PREDICTIONS[t.id];
  const timeline = stints(t.id).filter((s) => s.stakeholder !== "closed").map((s) => ({
    stakeholder: name(s.stakeholder), entered: s.entered.slice(0, 10),
    days: round1(s.hold ?? daysBetween(s.entered, TODAY)), ongoing: s.hold === null,
  }));
  return {
    ...taskRow(t),
    description: t.description,
    client_tier: CLIENT_BY_ID[t.client_id].tier, client_region: CLIENT_BY_ID[t.client_id].region,
    code_areas: t.code_areas.map((a) => ({ path: a, module_description: MODULE_NOTES[moduleOf(a)] })),
    handoff_timeline: timeline,
    ...(t.status === "closed"
      ? { days_to_close: round1((new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()) / DAY_MS), solution_note: t.solution_note || null }
      : {
          prediction: {
            median_hold_for_this_stakeholder_and_type: round1(p.median_hold_days), hold_ratio: round1(p.hold_ratio),
            next_stakeholder: p.next.map((n) => ({ stakeholder: name(n.stakeholder), probability: Math.round(n.probability * 100) + "%", past_cases: n.count })),
            evidence: p.reason, expected_route: p.expected_path.map(name), estimated_close: p.estimated_close,
          },
          ai_summary: SUMMARIES[t.id]?.summary ?? null,
        }),
    similar_case_ids: (SIMILAR[t.id] ?? []).slice(0, 3).map((m) => m.task_id),
  };
}

export function agentSimilar(id: string, limit = 3) {
  const t = TASK_BY_ID.get(id.trim().toUpperCase());
  if (!t) return { error: `No task ${id}.` };
  return {
    task: t.id,
    similar_cases: (SIMILAR[t.id] ?? []).slice(0, Math.min(limit, 5)).map((m) => ({
      id: m.task_id, client: m.client, title: m.title, match: Math.round(m.score * 100) + "%", matched_on: m.matched_on,
      solution_note: m.solution_note || null, days_to_close: m.resolution_days,
    })),
  };
}

export function stakeholderStats(input: string | undefined, type?: string, windowKey: "90" | "180" | "365" = "365") {
  if (!input) {
    // Comparison across every team, so "which team is slowest?" takes one call
    const w = MAP.windows[windowKey];
    return {
      window: w.label, bottleneck: name(w.bottleneck),
      teams: w.nodes.filter((n) => n.id !== "closed")
        .map((n) => ({ stakeholder: n.name, tasks_passed_through: n.volume, median_hold_days: n.median_hold_days, avg_hold_days: n.avg_hold_days,
          open_now: OPEN_TASKS.filter((t) => t.current_stakeholder === n.id).length,
          at_risk_now: OPEN_TASKS.filter((t) => t.current_stakeholder === n.id && PREDICTIONS[t.id].risk !== "Low").length }))
        .sort((x, y) => (y.median_hold_days ?? 0) - (x.median_hold_days ?? 0)),
    };
  }
  const stk = resolveStakeholder(input);
  if (!stk) return { error: `Unknown stakeholder "${input}". Known: ${stakeholdersJson.map((s) => s.name).join(", ")}` };
  const w = MAP.windows[windowKey];
  const node = w.nodes.find((n) => n.id === stk);
  const outgoing = w.edges.filter((e) => e.from === stk);
  const incoming = w.edges.filter((e) => e.to === stk);
  const byType = Object.entries(TRANSITIONS.by_pair[stk] ?? {})
    .filter(([t]) => !type || t.toLowerCase() === type.toLowerCase())
    .map(([t, v]) => ({ type: t, past_stints: v.n, median_hold_days: v.median_hold_days,
      next: Object.entries(v.next).map(([k, c]) => ({ stakeholder: name(k), share: Math.round((c / v.n) * 100) + "%" })) }));
  const openHere = OPEN_TASKS.filter((t) => t.current_stakeholder === stk).map((t) => ({
    id: t.id, client: CLIENT_NAMES[t.client_id], type: t.type, days: round1(PREDICTIONS[t.id].hold_days), risk: PREDICTIONS[t.id].risk,
  })).sort((a, b) => b.days - a.days);
  return {
    stakeholder: name(stk), window: w.label, is_bottleneck: w.bottleneck === stk,
    tasks_passed_through: node?.volume ?? 0, avg_hold_days: node?.avg_hold_days ?? null, median_hold_days: node?.median_hold_days ?? null,
    next_stops: outgoing.sort((a, b) => b.count - a.count).map((e) => ({ to: name(e.to), handoffs: e.count, avg_wait_days: e.avg_wait_days, rework_tasks: e.rework_tasks })),
    arrives_from: incoming.sort((a, b) => b.count - a.count).slice(0, 4).map((e) => ({ from: name(e.from), handoffs: e.count })),
    by_task_type_12_months: byType,
    open_now: { count: openHere.length, tasks: openHere.slice(0, 10) },
    process_changes: (eventsJson as { date: string; stakeholder: string; title: string }[]).filter((e) => e.stakeholder === stk),
    insight: node?.insight ?? null,
  };
}

export function moduleStats(module?: string) {
  const counts = MAP.windows["365"].modules;
  const atRisk = OPEN_TASKS.filter((t) => PREDICTIONS[t.id].risk !== "Low");
  if (!module) {
    return {
      modules_by_task_count_12_months: counts.slice(0, 10).map((m) => ({
        module: `${m.id}/`, tasks: m.count, description: MODULE_NOTES[m.id],
        at_risk_open_tasks: atRisk.filter((t) => t.code_areas.some((a) => moduleOf(a) === m.id)).length,
      })),
      at_risk_open_tasks_total: atRisk.length,
    };
  }
  const id = module.replace(/\/$/, "");
  if (!MODULE_NOTES[id]) return { error: `Unknown module "${module}". Known: ${modulesJson.map((m) => m.id + "/").join(", ")}` };
  const touching = TASKS.filter((t) => t.code_areas.some((a) => moduleOf(a) === id));
  const closed = touching.filter((t) => t.status === "closed");
  const fixes = closed.filter((t) => t.solution_note).slice(-5).map((t) => ({ id: t.id, client: CLIENT_NAMES[t.client_id], fix: t.solution_note }));
  const riskHere = atRisk.filter((t) => t.code_areas.some((a) => moduleOf(a) === id));
  return {
    module: `${id}/`, description: MODULE_NOTES[id], tasks_12_months: MODULE_COUNTS[id] ?? 0,
    rank: counts.findIndex((m) => m.id === id) + 1, open_tasks: touching.length - closed.length,
    at_risk_open_tasks: riskHere.map((t) => ({ id: t.id, client: CLIENT_NAMES[t.client_id], stakeholder: name(t.current_stakeholder), risk: PREDICTIONS[t.id].risk })),
    clients_with_at_risk_tasks: [...new Set(riskHere.map((t) => CLIENT_NAMES[t.client_id]))],
    median_days_to_close: closed.length ? round1(median(closed.map((t) => (new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()) / DAY_MS))) : null,
    recent_fixes: fixes,
  };
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function clientStats(input: string) {
  const c = resolveClient(input);
  if (!c) return { error: `Unknown client "${input}". Known: ${clientsJson.map((x) => x.name).join(", ")}` };
  const theirs = TASKS.filter((t) => t.client_id === c.id);
  const customerHolds = (pred: (t: RawTask) => boolean) => TASKS.filter(pred).flatMap((t) =>
    stints(t.id).filter((s) => s.stakeholder === "customer" && s.hold !== null).map((s) => s.hold!));
  const closed = theirs.filter((t) => t.status === "closed");
  const open = theirs.filter((t) => t.status === "open");
  return {
    client: c.name, tier: c.tier, region: c.region,
    open_tasks: open.map((t) => ({ id: t.id, type: t.type, stakeholder: name(t.current_stakeholder), days: round1(PREDICTIONS[t.id].hold_days), risk: PREDICTIONS[t.id].risk })),
    waiting_on_client_now: open.filter((t) => t.current_stakeholder === "customer").map((t) => t.id),
    closed_tasks_12_months: closed.length,
    median_days_to_close: closed.length ? round1(median(closed.map((t) => (new Date(t.closed_at!).getTime() - new Date(t.created_at).getTime()) / DAY_MS))) : null,
    median_client_response_days: round1(median(customerHolds((t) => t.client_id === c.id)) || 0),
    median_client_response_days_other_clients: round1(median(customerHolds((t) => t.client_id !== c.id))),
    task_types: Object.entries(theirs.reduce<Record<string, number>>((a, t) => ({ ...a, [t.type]: (a[t.type] ?? 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1]).map(([type, n]) => ({ type, tasks: n })),
  };
}

export function briefingForAgent() {
  const b = getBriefing();
  return {
    as_of: b.as_of, headline: b.headline,
    insights: [b.featured, ...b.insights].filter(Boolean).map((i) => ({ kind: i!.kind, title: i!.title, body: i!.body, evidence: i!.evidence, facts: i!.facts })),
    watch_rules: b.watch_rules.map((r) => ({ rule: r.label, count: r.count })),
    process_changes: eventsJson,
  };
}

// ── How it was built (data/artifacts/build_story.json, from scripts/build_story.mjs) ──

export type BuildStory = {
  repo: string;
  first_commit: string;
  agent_live: string;
  hours_to_live_agent: number;
  commits: number;
  lines: { typescript: number; python: number };
  logged_decisions: number;
  validator_checks: number;
  evals: { passed: number; total: number; by_group: Record<string, string>; median_seconds: number; total_cost_usd: number };
  timeline: { hash: string; date: string; subject: string }[];
};

export function getBuildStory(): BuildStory {
  return buildStoryJson as BuildStory;
}

// ── Search and classic-dashboard data ──

export type SearchIndex = {
  tasks: { id: string; title: string; client: string; status: "open" | "closed" }[];
  clients: { name: string; open: number }[];
};

/** Everything the jump-to search can match (served once as static JSON). */
export function getSearchIndex(): SearchIndex {
  return {
    tasks: TASKS.map((t) => ({ id: t.id, title: t.title, client: CLIENT_NAMES[t.client_id], status: t.status })),
    clients: clientsJson.map((c) => ({ name: c.name, open: OPEN_TASKS.filter((t) => t.client_id === c.id).length }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export type ClassicData = {
  open: { stakeholder: string; type: string; client: string; region: string; risk: Risk; age: number }[];
  history: { type: string; client: string; region: string; week: string; handoffs90: number }[];
  weeks: string[];
};

/** Raw rows for the classic dashboard, so its filters can recompute every chart in the browser. */
export function getClassicData(): ClassicData {
  const regionOf = Object.fromEntries(clientsJson.map((c) => [c.id, c.region]));
  const weekStart = (iso: string) => {
    const d = new Date(iso);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
    return d.toISOString().slice(0, 10);
  };
  const ninetyDaysAgo = TODAY.getTime() - 90 * DAY_MS;
  // Last 8 complete weeks before the current one
  const current = weekStart(TODAY.toISOString());
  const weeks = Array.from({ length: 8 }, (_, i) => new Date(new Date(current).getTime() - (8 - i) * 7 * DAY_MS).toISOString().slice(0, 10));
  return {
    open: OPEN_TASKS.map((t) => ({
      stakeholder: name(t.current_stakeholder), type: t.type, client: CLIENT_NAMES[t.client_id], region: regionOf[t.client_id],
      risk: PREDICTIONS[t.id].risk, age: round1(daysBetween(t.created_at, TODAY)),
    })),
    history: TASKS.map((t) => ({
      type: t.type, client: CLIENT_NAMES[t.client_id], region: regionOf[t.client_id], week: weekStart(t.created_at),
      // Cleaned stints (duplicate rows merged), matching the Python pipeline's handoff counts
      handoffs90: stints(t.id).filter((st) => new Date(st.entered).getTime() >= ninetyDaysAgo).length,
    })),
    weeks,
  };
}
