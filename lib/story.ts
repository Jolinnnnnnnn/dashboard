// Content for the "How it was built" page (/build). Short on purpose: the page is read by people,
// not reviewers of the code. Every catch is a real event from docs/prompt-log.md, linked to its fix.
// Numbers come from data/artifacts/build_story.json (npm run story).

/** The first ideas, as they were written down while planning. */
export const IDEAS = [
  { text: "Dashboards show everything; finding what changed is manual.", tone: "amber" },
  { text: "An agent could flag what changed and say why.", tone: "accent" },
  { text: "Every number should trace back to the data.", tone: "green" },
  { text: "Use synthetic data with patterns I know are there.", tone: "red" },
  { text: "The agent should say when it doesn't know.", tone: "accent" },
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

export const TABLEAU = ["Open the dashboard", "Filter by team, client, and date", "Look for what seems off", "Write up what you found"] as const;
export const SIGNAL = ["Checks run on the data each refresh", "Detectors flag changes, with task IDs", "Claude writes the summary; you can ask follow-ups"] as const;

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
  { title: "The design prototype used invented numbers", caughtBy: "Compared each claim to the data", commit: "daf5379" },
  { title: "Data checks passed on only one random seed", caughtBy: "Re-ran the checks on 30 seeds", commit: "3d675b1" },
  { title: "Claude put the wrong label on a correct number", caughtBy: "Read the generated text", commit: "daf5379" },
];

