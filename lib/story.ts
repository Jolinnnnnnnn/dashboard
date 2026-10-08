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

/** The build, step by step. `commit` links to the change; its time comes from git. */
export const JOURNEY = [
  { step: "Plan", line: "Spec & rules", commit: "5a5cd8d", icon: "plan" },
  { step: "Data", line: "500 tasks", commit: "0207541", icon: "data" },
  { step: "Model", line: "Predictions", commit: "b3618c6", icon: "model" },
  { step: "Design", line: "Claude Design", commit: "f8ca527", icon: "design" },
  { step: "App", line: "Next.js", commit: "417472c", icon: "app" },
  { step: "Agent", line: "Claude + tools", commit: "2cee8e0", icon: "agent" },
  { step: "Live", line: "Vercel", commit: "384a122", icon: "live" },
] as const;

export type Catch = { title: string; caughtBy: string; commit: string };

/** Three of the moments the AI was wrong (all of them are in docs/prompt-log.md). */
export const CATCHES: Catch[] = [
  { title: "A beautiful design with made-up numbers", caughtBy: "Checked every claim against the data", commit: "daf5379" },
  { title: "Patterns that only worked by luck", caughtBy: "Re-ran on 30 random seeds", commit: "3d675b1" },
  { title: "Right number, wrong label", caughtBy: "Read the output, not just the tests", commit: "daf5379" },
];

export const LOOP = ["Plan", "Build", "Verify", "Ship", "Log"] as const;
