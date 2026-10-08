// Generates data/artifacts/build_story.json for the "How it was built" page from real sources:
// git history, tracked code size, the prompt log, the validator, and the latest eval results.
// Usage: npm run story   (re-run before committing when the history changes)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

const commits = git(`log --reverse --format=%h%x09%aI%x09%s`).split("\n").map((line) => {
  const [hash, date, subject] = line.split("\t");
  return { hash, date, subject };
});

const files = git("ls-files").split("\n");
const lines = (pattern) => files
  .filter((f) => pattern.test(f) && !f.startsWith("design/") && !f.endsWith("next-env.d.ts"))
  .reduce((n, f) => n + readFileSync(f, "utf8").split("\n").length, 0);

const promptLog = readFileSync("docs/prompt-log.md", "utf8");
const evals = JSON.parse(readFileSync("evals/results.json", "utf8")).summary;
const validatorChecks = (readFileSync("scripts/validate_patterns.py", "utf8").match(/\bcheck\("/g) ?? []).length;

const first = commits[0];
const agentLive = commits.find((c) => /agent live/i.test(c.subject)) ?? commits.at(-1);
const hours = (new Date(agentLive.date) - new Date(first.date)) / 3_600_000;

const story = {
  generated_from: "git history, docs/prompt-log.md, scripts/validate_patterns.py, evals/results.json",
  repo: git("remote get-url origin").replace(/\.git$/, ""),
  first_commit: first.date,
  agent_live: agentLive.date,
  hours_to_live_agent: Math.round(hours * 10) / 10,
  commits: commits.length,
  lines: { typescript: lines(/\.(ts|tsx)$/), python: lines(/\.py$/) },
  logged_decisions: (promptLog.match(/^\| 20\d\d-/gm) ?? []).length,
  validator_checks: validatorChecks,
  evals: { passed: evals.passed, total: evals.total, by_group: evals.by_group, median_seconds: evals.median_seconds, total_cost_usd: evals.total_cost_usd },
  timeline: commits,
};

writeFileSync("data/artifacts/build_story.json", JSON.stringify(story, null, 2) + "\n");
console.log(`build_story.json: ${story.commits} commits, ${story.lines.typescript + story.lines.python} lines, ` +
  `${story.hours_to_live_agent}h to live agent, ${story.logged_decisions} logged decisions, evals ${story.evals.passed}/${story.evals.total}`);
