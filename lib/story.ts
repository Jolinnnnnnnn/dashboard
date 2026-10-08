// Content for the "How it was built" page (/build): one clickable system diagram.
// Each node gets one sentence, plus a real mistake caught there (from docs/prompt-log.md) with its fix commit.
// Counts and test results are filled in by the page from generated data.

export type NodeId = "data" | "tableau" | "checks" | "predict" | "detect" | "claude" | "queue" | "map" | "briefing" | "agent";

export type NodeInfo = {
  title: string;
  /** One sentence; `{key}` placeholders are filled with live numbers. */
  line: string;
  caught?: { what: string; commit: string };
};

export const NODES: Record<NodeId, NodeInfo> = {
  data: {
    title: "Task data",
    line: "{tasks} synthetic client tasks and {handoffs} handoffs between teams, with patterns planted on purpose.",
    caught: { what: "The patterns passed every check on one random seed only. Re-ran on 30 seeds and fixed the generator.", commit: "3d675b1" },
  },
  tableau: {
    title: "Warehouse or Tableau source",
    line: "Nothing downstream depends on the data being synthetic: point the same pipeline at a warehouse table or a Tableau data source.",
  },
  checks: {
    title: "Checks",
    line: "{checks} automatic checks run every time the data is rebuilt.",
    caught: { what: "A cleaning step copied the wrong team onto some handoffs. One of the checks failed and pointed to it.", commit: "0207541" },
  },
  predict: {
    title: "Predictions",
    line: "Predicts each task's next team ({backtest}) and finds how similar past issues were fixed.",
  },
  detect: {
    title: "Detectors",
    line: "Five rules look for what changed: an overdue task with a known fix, a module behind at-risk tasks, a slow client, rising rework, a process change.",
    caught: { what: "One rule flagged a client whose tasks weren't actually late. Added a significance test.", commit: "daf5379" },
  },
  claude: {
    title: "Claude",
    line: "Haiku writes the task summaries and briefing text from the detectors' numbers; Sonnet runs the agent.",
    caught: { what: "Claude put the wrong label on a correct number. The automatic number check passed it; reading the text didn't.", commit: "daf5379" },
  },
  queue: { title: "Queue", line: "Every open task, its predicted next team, and who owns it." },
  map: { title: "Process map", line: "Where tasks wait and bounce between teams." },
  briefing: {
    title: "Briefing",
    line: "Replaces the dashboard's first screen: what changed and what needs someone today.",
    caught: { what: "The design prototype showed invented numbers. Every card is now built from a detector.", commit: "daf5379" },
  },
  agent: {
    title: "Agent",
    line: "Answers questions with 8 read-only tools and cites the tasks it used. Passes {evals} test questions.",
    caught: { what: "A stalled response could hang forever. Added a timeout after a test run froze.", commit: "2cee8e0" },
  },
};

/** The plan's phases (docs/plan.md), the nodes each one built, and the commit that finished it. */
export const PHASES: { phase: number; name: string; line: string; nodes: NodeId[]; commit: string }[] = [
  { phase: 1, name: "Plan", line: "Wrote the spec, metric definitions, and rules for Claude Code.", nodes: [], commit: "5a5cd8d" },
  { phase: 2, name: "Data", line: "Generated the data and the checks that validate it.", nodes: ["data", "checks"], commit: "0207541" },
  { phase: 3, name: "Model", line: "Built predictions and similar-case search, and backtested them.", nodes: ["predict"], commit: "b3618c6" },
  { phase: 4, name: "Design", line: "Prototyped the screens in Claude Design.", nodes: ["queue", "map", "briefing", "agent"], commit: "f8ca527" },
  { phase: 5, name: "App", line: "Built the Next.js app from the design and deployed it.", nodes: ["queue", "map"], commit: "417472c" },
  { phase: 6, name: "Real data", line: "Wired the computed results into every view.", nodes: ["predict", "queue", "map"], commit: "417472c" },
  { phase: 7, name: "Agent", line: "Added the agent, its tools, and its test questions.", nodes: ["claude", "agent"], commit: "2cee8e0" },
];
