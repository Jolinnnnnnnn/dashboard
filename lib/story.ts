// Curated content for the "How it was built" page. Every entry is a real event recorded in
// docs/prompt-log.md; `commit` links to the change that fixed it. Numbers come from
// data/artifacts/build_story.json (scripts/build_story.mjs), not from this file, except where noted.

export type Catch = {
  title: string;
  what: string;
  caughtBy: string;
  fix: string;
  commit: string;
};

export const CATCHES: Catch[] = [
  {
    title: "A data-cleaning bug that looked fine",
    what: "Merging duplicate handoffs used pandas' groupby().first(), which silently skips empty values, so one task's first handoff got the wrong “from” team.",
    caughtBy: "The validation script: “duplicates cleaned” failed with 1 left over.",
    fix: "Positional first/last. All 17 checks passed.",
    commit: "0207541",
  },
  {
    title: "Patterns that only worked on a lucky seed",
    what: "Adding text noise re-drew every route, and two planted patterns failed. The data had only passed because seed 42 happened to be lucky.",
    caughtBy: "Running the validator on 30 seeds instead of one.",
    fix: "Separate random streams for structure and text, quotas instead of coin flips. 28 of 30 seeds pass all checks; the 2 misses are near misses.",
    commit: "3d675b1",
  },
  {
    title: "A result too good to believe",
    what: "Similar-case search found the right issue family 100% of the time, because each family's text templates never overlapped.",
    caughtBy: "Asking how an interviewer would react to a perfect score.",
    fix: "Realistic messiness (vague titles, misworded tickets), then measured why it lands at ~93%: text alone 78%, code modules 90%, combined best.",
    commit: "3d675b1",
  },
  {
    title: "A framework newer than the AI's training data",
    what: "Next.js 16 ships with a note that its APIs differ from what models know. Code that works in dev can fail the production build.",
    caughtBy: "Having a subagent read the bundled docs before writing any app code.",
    fix: "Every URL read sits inside a Suspense boundary; the build prerenders all 500 task pages.",
    commit: "417472c",
  },
  {
    title: "A beautiful design with invented numbers",
    what: "The Claude Design prototype's briefing said Security rework rose from 11% to 18% and Ops got 30% faster. Neither was true of the data.",
    caughtBy: "Checking every claim in the design against the data before building it.",
    fix: "Insights now come only from detectors over the data; the two patterns the story needed were planted in the generator and validated.",
    commit: "daf5379",
  },
  {
    title: "A detector that fired on noise",
    what: "“3 Kestrel Retail tasks are waiting on the client”: longest wait 0.8 days, client responds in 0.9 vs 0.9 for everyone else. Nothing was late.",
    caughtBy: "Reading the generated briefing, not just checking it ran.",
    fix: "A significance rule. The card disappeared and the headline honestly became “Two things need you today.”",
    commit: "daf5379",
  },
  {
    title: "Right number, wrong label",
    what: "Claude wrote “median config hold time fell 1.4 to 1.0 days”. The numbers were right; they described all of Ops, not config changes.",
    caughtBy: "Reading the wording against the facts. The automated number check had passed it.",
    fix: "Explicit “measure” fields in the facts Claude writes from. Lesson: a number check catches invented numbers, not mislabeled ones.",
    commit: "daf5379",
  },
  {
    title: "Output that changed between identical runs",
    what: "Re-running the pipeline changed two files with no code change: modules tied on count were ordered by Python's per-process hash randomization.",
    caughtBy: "Expecting a rebuild to be byte-identical, and diffing when it wasn't.",
    fix: "Ties sorted by name; verified identical across three hash seeds.",
    commit: "f379d1c",
  },
  {
    title: "An agent call that could hang forever",
    what: "An eval run sat idle for 10+ minutes. The SDK's timeout covers starting a response, not a stream that stalls midway.",
    caughtBy: "Inspecting the stuck process: an open connection to the API, waiting.",
    fix: "A 25-second stream-idle watchdog and a 55-second deadline, under Vercel's 60-second limit. Real users would have hit this.",
    commit: "2cee8e0",
  },
  {
    title: "My grader was wrong, not the agent",
    what: "The first eval run failed 3 “unanswerable” questions. The agent had answered correctly (“the data has no SLAs”); my regex didn't recognize the phrasing.",
    caughtBy: "Reading every failing answer before touching the agent.",
    fix: "Fixed the grader. Changing the prompt to satisfy a broken test would have made the agent worse.",
    commit: "2cee8e0",
  },
  {
    title: "Evals that found a missing tool",
    what: "Asked for the biggest bottleneck, the agent checked all 8 teams one by one: 8 tool calls, over its budget of 6.",
    caughtBy: "The eval's tool-call limit.",
    fix: "An all-teams comparison mode for the stats tool: 8 calls became 1. All 15 evals pass.",
    commit: "2cee8e0",
  },
];

export const RULES = [
  { rule: "Never hand-edit files in data/. Change the spec or the generator, then regenerate.", why: "Every number on the site traces back to code that can be re-run." },
  { rule: "Every briefing insight must come from a detector over the data, never hand-written copy.", why: "The design's invented insights were the biggest risk to credibility." },
  { rule: "The agent is read-only, must cite task IDs, and says “I don't know” when the data doesn't support an answer.", why: "Answers are checked: IDs no tool returned are flagged “unverified”." },
  { rule: "Verify your own work: run scripts, check numbers against validation output, run evals.", why: "Most catches above came from this rule, not from luck." },
];

// Verification layers; numbers marked * are recorded in README / data-spec rather than generated.
export const LAYERS = [
  { layer: "Data", check: "20 checks on counts, noise, and 9 planted patterns", result: "20/20 · 28 of 30 seeds*" },
  { layer: "Model", check: "Backtest on held-out Jul–Sep tasks vs a baseline", result: "89.0% vs 56.2% top-1*" },
  { layer: "AI summaries", check: "Every task ID a summary cites must be one it was given", result: "100 summaries, 0 violations*" },
  { layer: "Briefing", check: "Wording with any number not in the facts falls back to a template", result: "4 of 4 Claude-worded*" },
  { layer: "Agent", check: "15 graded questions incl. ones the data can't answer", result: "EVALS" },
  { layer: "App", check: "Typecheck, lint, production build before every push", result: "All 500 task pages prerendered" },
];
