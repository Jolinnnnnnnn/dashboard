// View models passed from server components to client components.
// Built in lib/data.ts from the generated JSON in data/.

export type Risk = "High" | "Medium" | "Low";

export type NextStop = { name: string; pct: number };

export type QueueRow = {
  id: string;
  client: string;
  type: string;
  stakeholder: string;
  days: number;
  median: number;
  ratio: number;
  risk: Risk;
  next: NextStop[];
};

export type QueueStats = {
  open: number;
  atRisk: number;
  high: number;
  clients: number;
  avgDaysOpen: number;
  medianDaysOpen: number;
  bottleneck: { id: string; name: string; medianHold: number };
};

export type FilterOptions = { types: string[]; clients: string[]; stakeholders: string[] };

export type Segment = { name: string; days: number; current?: boolean };

export type CodeArea = { path: string; note: string; tasks: number; hot: boolean };

export type SimilarCaseView = {
  id: string;
  client: string;
  title: string;
  score: number;
  matchedOn: string;
  solvedBy: string;
  closedInDays: number;
};

export type TaskDetail = {
  id: string;
  title: string;
  client: string;
  type: string;
  status: "open" | "closed";
  description: string;
  openDays: number;
  opened: string;
  timeline: Segment[];
  predicted: Segment[];
  // Open tasks only
  risk?: Risk;
  holdDays?: number;
  medianHold?: number;
  next?: NextStop[];
  reason?: string;
  estimatedClose?: string;
  summary?: string;
  action?: string;
  // Closed tasks only
  closed?: string;
  solutionNote?: string;
  code: CodeArea[];
  similar: SimilarCaseView[];
};

export type MapNode = {
  id: string;
  name: string;
  volume: number;
  avgHold?: number;
  medianHold?: number;
  next: NextStop[];
  insight: string;
  open: { id: string; client: string; days: number; risk: Risk }[];
};

export type MapEdge = { from: string; to: string; share: number; avgWait: number; rework: number };

export type MapWindow = {
  key: string;
  label: string;
  tasks: number;
  closed: number;
  medianDaysToClose: number;
  minRework: number;
  nodes: MapNode[];
  edges: MapEdge[];
  modules: { id: string; count: number }[];
};

// ── Briefing (data/artifacts/briefing.json, built by scripts/build_briefing.py) ──

export type Tone = "red" | "amber" | "green" | "accent" | "muted";
export type InsightAction = { label: string; href?: string; ask?: string; primary?: boolean };

export type Insight = {
  kind: "need" | "pattern" | "win";
  id: string;
  title: string;
  body: string;
  meta: string;
  written_by: "claude" | "template";
  facts: Record<string, string | number | boolean | string[]>;
  bars?: { label: string; value: number; unit: string; tone: Tone }[];
  cols?: { label: string; value: number }[];
  evidence: string[];
  actions: InsightAction[];
};

export type Briefing = {
  as_of: string;
  headline: string;
  subhead: string;
  featured: Insight | null;
  insights: Insight[];
  watch_rules: { label: string; count: number; tone: Tone }[];
  stats: { open: number; handoffs_90d: number; insights: number };
  classic: {
    kpis: { open: number; at_risk: number; avg_days_open: number; handoffs_90d: number };
    charts: { title: string; bars?: { label: string; value: number }[]; cols?: { label: string; value: number }[] }[];
  };
};
