// Content for the "How it was built" page (/build). Mostly diagrams; text is kept to labels.
// Every catch is a real event from docs/prompt-log.md, linked to its fix.
// Numbers come from data/artifacts/build_story.json (npm run story).

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

/** The same weekly job, by hand in Tableau and automatic in Signal. Columns line up. */
export const LANES = {
  tableau: [{ label: "Dashboard", icon: "chart" }, { label: "Filter", icon: "person" }, { label: "Spot changes", icon: "person" }, { label: "Write it up", icon: "person" }],
  signal: [{ label: "Checks", icon: "auto" }, { label: "Detectors", icon: "auto" }, { label: "Claude", icon: "claude" }, { label: "Briefing", icon: "auto" }],
} as const;

/** Data sources, the detectors that read them (scripts/build_briefing.py), and which source feeds which detector. */
export const DETECTORS = ["Overdue, fix known", "Module blocking tasks", "Slow client", "Rework rising", "Process change"] as const;
export const SOURCE_LINKS: [source: number, detector: number][] = [[0, 0], [1, 0], [0, 1], [2, 1], [1, 2], [3, 2], [1, 3], [1, 4], [4, 4]];

export type Catch = { title: string; caughtBy: string; commit: string };

/** Three of the moments the AI was wrong (all of them are in docs/prompt-log.md). */
export const CATCHES: Catch[] = [
  { title: "The design prototype used invented numbers", caughtBy: "Compared each claim to the data", commit: "daf5379" },
  { title: "Data checks passed on only one random seed", caughtBy: "Re-ran the checks on 30 seeds", commit: "3d675b1" },
  { title: "Claude put the wrong label on a correct number", caughtBy: "Read the generated text", commit: "daf5379" },
];

