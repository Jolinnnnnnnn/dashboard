// Content for the "How it was built" page (/build). Short on purpose: the page is read by people,
// not reviewers of the code. Every catch is a real event from docs/prompt-log.md, linked to its fix.
// Numbers come from data/artifacts/build_story.json (npm run story).

/** The first ideas, as they were written down while planning. */
export const IDEAS = [
  { text: "Dashboards make you hunt.", tone: "amber" },
  { text: "An agent that says what matters.", tone: "accent" },
  { text: "Every number traceable.", tone: "green" },
  { text: "Fake data, real patterns.", tone: "red" },
  { text: "Allowed to say \u201cI don't know.\u201d", tone: "accent" },
] as const;

/** The build plan's phases (docs/plan.md). `commit` is the change that finished each; its time comes from git. */
export const JOURNEY = [
  { phase: 1, step: "Plan", line: "Spec, metrics, AI rules", commit: "5a5cd8d", icon: "plan" },
  { phase: 2, step: "Data", line: "500 tasks, hidden patterns", commit: "0207541", icon: "data" },
  { phase: 3, step: "Model", line: "Predictions & past fixes", commit: "b3618c6", icon: "model" },
  { phase: 4, step: "Design", line: "Claude Design prototype", commit: "f8ca527", icon: "design" },
  { phase: 5, step: "App", line: "Next.js from the design", commit: "417472c", icon: "app" },
  { phase: 6, step: "Real data", line: "Wired into every view", commit: "417472c", icon: "live" },
  { phase: 7, step: "Agent", line: "Claude with tools", commit: "2cee8e0", icon: "agent" },
] as const;

export const TABLEAU = ["Open four dashboards", "Filter and compare", "Export to find outliers", "Write it up"] as const;
export const SIGNAL = ["Checks every task and handoff", "Surfaces what changed, with evidence", "Suggests a next step; you decide"] as const;

/** Detectors that turn the sources into briefing insights (scripts/build_briefing.py). */
export const DETECTORS = [
  "Overdue task with a known fix",
  "Module behind at-risk tasks",
  "Client slow to respond",
  "Rework rising at a team",
  "Effect of a process change",
] as const;

export type Catch = { title: string; caughtBy: string; commit: string };

/** Three of the moments the AI was wrong (all of them are in docs/prompt-log.md). */
export const CATCHES: Catch[] = [
  { title: "A beautiful design with made-up numbers", caughtBy: "Checked every claim against the data", commit: "daf5379" },
  { title: "Patterns that only worked by luck", caughtBy: "Re-ran on 30 random seeds", commit: "3d675b1" },
  { title: "Right number, wrong label", caughtBy: "Read the output, not just the tests", commit: "daf5379" },
];

