// Runs evals/agent-questions.json through the agent and grades each answer with deterministic checks.
// Writes evals/results.json. Costs a few cents per question (Claude API).
//
// Usage (from repo root):
//   npm run eval            # all questions
//   npm run eval -- sla     # only questions whose id contains "sla"
import { readFileSync, writeFileSync } from "node:fs";

import { type AgentEvent, MODEL, runAgent } from "@/lib/agent/run";

type Expect = { include?: string[]; includeAny?: string[][]; tools?: string[]; declines?: boolean; draft?: boolean };
type Case = { id: string; group: string; question: string; context?: string; expect: Expect };

// Load ANTHROPIC_API_KEY from .env.local (tolerates spaces around "=")
if (!process.env.ANTHROPIC_API_KEY) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k.trim() === "ANTHROPIC_API_KEY") process.env.ANTHROPIC_API_KEY = v.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

// A decline must come first: the answer's opening says the data can't answer (then it may offer an alternative)
const DECLINE = /\b(can't|cannot|couldn't|could not|doesn't|does not|don't|do not|isn't|is not|has no|have no|no such|not in the data|not available|unable)\b/i;

function grade(c: Case, text: string, tools: string[], done: Extract<AgentEvent, { type: "done" }> | undefined, error?: string) {
  const fails: string[] = [];
  const lower = text.toLowerCase();
  if (error) fails.push(`error: ${error}`);
  if (!done) fails.push("no completion event");
  if (done && done.unverified.length) fails.push(`unverified task IDs: ${done.unverified.join(", ")}`);
  if (done && done.toolCalls > 6) fails.push(`too many tool calls: ${done.toolCalls}`);
  for (const s of c.expect.include ?? []) if (!lower.includes(s.toLowerCase())) fails.push(`missing "${s}"`);
  for (const group of c.expect.includeAny ?? []) if (!group.some((s) => lower.includes(s.toLowerCase()))) fails.push(`missing one of ${group.map((s) => `"${s}"`).join(" / ")}`);
  if (c.expect.tools && !c.expect.tools.some((t) => tools.includes(t))) fails.push(`didn't call ${c.expect.tools.join(" or ")}`);
  if (c.expect.declines && !DECLINE.test(text.slice(0, 200))) fails.push("didn't open by saying the data can't answer this");
  if (c.expect.draft && !/^>/m.test(text)) fails.push("no block-quoted draft");
  return fails;
}

async function main() {
  const filter = process.argv[2];
  const cases = (JSON.parse(readFileSync("evals/agent-questions.json", "utf8")) as Case[]).filter((c) => !filter || c.id.includes(filter));
  type Result = { id: string; group: string; pass: boolean; fails: string[]; seconds: number; tools: string[]; cost?: number; answer: string };
  const results: Result[] = [];
  let cost = 0;
  for (const c of cases) {
    const t0 = Date.now();
    let done: Extract<AgentEvent, { type: "done" }> | undefined;
    let error: string | undefined;
    const { text, toolsUsed } = await runAgent([], c.question, c.context, (e) => {
      if (e.type === "done") done = e;
      if (e.type === "error") error = e.message;
    });
    const seconds = (Date.now() - t0) / 1000;
    const fails = grade(c, text, toolsUsed, done, error);
    cost += done?.usage.costUsd ?? 0;
    results.push({ id: c.id, group: c.group, pass: fails.length === 0, fails, seconds, tools: toolsUsed, cost: done?.usage.costUsd, answer: text });
    console.log(`${fails.length ? "FAIL" : "PASS"}  ${c.id.padEnd(16)} ${seconds.toFixed(1)}s  ${toolsUsed.length} tools  ${fails.join("; ")}`);
  }
  const passed = results.filter((r) => r.pass).length;
  const byGroup = Object.fromEntries([...new Set(results.map((r) => r.group))].map((g) => {
    const rs = results.filter((r) => r.group === g);
    return [g, `${rs.filter((r) => r.pass).length}/${rs.length}`];
  }));
  const summary = {
    model: MODEL, run_at: new Date().toISOString(), passed, total: results.length, by_group: byGroup,
    median_seconds: results.map((r) => r.seconds).sort((a, b) => a - b)[Math.floor(results.length / 2)],
    total_cost_usd: Math.round(cost * 1000) / 1000,
  };
  console.log(`\n${passed}/${results.length} passed · ${JSON.stringify(byGroup)} · median ${summary.median_seconds.toFixed(1)}s · $${summary.total_cost_usd}`);
  if (!filter) writeFileSync("evals/results.json", JSON.stringify({ summary, results }, null, 2) + "\n");
}

main();
