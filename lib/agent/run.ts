// The Signal agent: a manual tool-use loop over read-only tools, streaming events to the caller.
// Used by app/api/agent/route.ts and by the eval runner (evals/run.ts).
import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { TOOLS, executeTool, stepLabel } from "@/lib/agent/tools";

export const MODEL = "claude-sonnet-5-5";
const MAX_TOOL_CALLS = 6;
const MAX_TURNS = 8;
const MAX_TOKENS = 4000;
// The SDK timeout covers starting a response, not a stream that stalls midway, so watch for silence.
const STREAM_IDLE_MS = 25_000;
const DEADLINE_MS = 55_000; // under the route's 60s maxDuration
// Sonnet 5.5 list prices per million tokens (input, output, cache read), for the cost readout
const PRICE = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };

const SYSTEM = `You are Signal, an operations analyst agent for a CDN company's technical program managers. You answer questions about client tasks as they move between teams, using read-only tools over the task data.

The data
- Synthetic data for a fictional CDN company, as of Wednesday 2026-10-07. 500 client tasks: 100 open, 400 closed (Oct 2025 to Sep 2026).
- Teams (stakeholders): Intake, Support, Network Eng, Security Review, Ops, QA, Dev, Customer (the client), then Closed.
- Task types: Cache purge bug, New domain setup, SSL renewal, Traffic spike, Config change, DNS routing issue, Origin failover, Log access request.
- Hold time: days a task spends with one team. Hold ratio: current hold ÷ that team's median for the task type. Risk: High over 2×, Medium over 1.5×, otherwise Low.
- Rework: a handoff back to a team the task had already been with.
- Bottleneck: the team with the highest median hold time over the last 12 months (get_stakeholder_stats reports is_bottleneck). This is the definition the dashboard uses; if you also mention where at-risk tasks pile up, say that it's a different measure.
- Team workspace (get_task_workspace): who has claimed a task and the team's notes. Teammates are fictional demo people; the current user appears as "You". Unclaimed means nobody has taken ownership. Claims are the only record of who owns a task; individual engineer assignments aren't tracked. The workspace is live, so its timestamps can be later than the data's as-of date; that's expected, don't flag it.
- Not in the data: SLAs or contract deadlines, revenue, staffing, anything after 2026-10-07. If asked about these, say the data doesn't have it and offer the closest thing it does have.

How to answer
- Get every number and task ID from a tool result in this conversation. Never estimate or recall them. If the tools don't give you what you need, say so plainly.
- Lead with the answer in one or two sentences, then the evidence. Keep it under about 150 words unless asked for more. Use short bullet lists for comparisons. No headings.
- Mention task IDs (like T-4821) for the evidence you used; they become links.
- When asked to draft a message (a ping, an email, a checklist change), write the draft as a block quote (lines starting with "> "), ready to paste, and keep it under 80 words.
- Distinguish what the data shows from what you infer: a timing coincidence is not proof of cause.
- Be efficient with tools: use filters instead of fetching everything, and stop once you have enough to answer.`;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "step"; id: string; label: string; status: "running" | "done" | "error" }
  | { type: "text"; delta: string }
  | { type: "done"; sources: string[]; unverified: string[]; toolCalls: number; usage: Usage }
  | { type: "error"; code: "not_configured" | "refused" | "failed"; message: string };

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number };

const TASK_ID = /T-\d{4}/g;

/**
 * Runs one question through the agent. `history` is prior turns as plain text (earlier tool calls
 * aren't replayed, so each request is append-only within itself). `context` is the card the user
 * asked from, e.g. "T-4821".
 */
export async function runAgent(
  history: ChatMessage[],
  question: string,
  context: string | undefined,
  emit: (e: AgentEvent) => void,
  signal?: AbortSignal,
  visitor: string | null = null,
): Promise<{ text: string; toolsUsed: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    emit({ type: "error", code: "not_configured", message: "The agent isn't configured on this deployment yet (no API key)." });
    return { text: "", toolsUsed: [] };
  }
  const client = new Anthropic({ timeout: 60_000, maxRetries: 2 });
  const userText = context && context !== "Briefing" ? `[Asked from: ${context}]\n${question}` : question;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userText },
  ];

  // Task IDs count as verified if a tool returned them or the user mentioned them
  const seenIds = new Set<string>([...`${question} ${context ?? ""}`.matchAll(TASK_ID)].map((m) => m[0]));
  const toolsUsed: string[] = [];
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 };
  let finalText = "";
  let toolCalls = 0;

  // One controller for the whole run: aborts on client disconnect, a stalled stream, or the deadline
  const controller = new AbortController();
  let stopReason: "idle" | "deadline" | null = null;
  const stop = (why: "idle" | "deadline") => { stopReason ??= why; controller.abort(); };
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  const deadline = setTimeout(() => stop("deadline"), DEADLINE_MS);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => stop("idle"), STREAM_IDLE_MS); };

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const budgetLeft = toolCalls < MAX_TOOL_CALLS;
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM,
          tools: TOOLS,
          // Out of tool budget: keep the tools (history references them) but require an answer now
          tool_choice: budgetLeft ? { type: "auto" } : { type: "none" },
          messages,
          output_config: { effort: "medium" },
          cache_control: { type: "ephemeral" },
          // Server-side refusal fallback (retries cyber / frontier_llm declines on Sonnet 5)
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: controller.signal },
      );
      touch();
      stream.on("streamEvent", touch);
      let turnText = "";
      stream.on("text", (delta) => {
        turnText += delta;
        emit({ type: "text", delta });
      });
      const message = await stream.finalMessage();
      clearTimeout(idle);

      const u = message.usage;
      usage.inputTokens += u.input_tokens;
      usage.outputTokens += u.output_tokens;
      usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
      usage.costUsd += (u.input_tokens * PRICE.input + u.output_tokens * PRICE.output
        + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1e6;

      if (message.stop_reason === "refusal") {
        emit({ type: "error", code: "refused", message: "The model declined this request. Try rephrasing it as a question about the task data." });
        return { text: finalText, toolsUsed };
      }
      finalText += turnText;

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;
      if (message.stop_reason === "tool_use" && turnText) emit({ type: "text", delta: "\n\n" });

      // Append the full assistant content (including thinking blocks) unchanged, then the results
      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tool of toolUses) {
        const label = stepLabel(tool.name, tool.input as Record<string, unknown>);
        emit({ type: "step", id: tool.id, label, status: "running" });
        toolCalls++;
        toolsUsed.push(tool.name);
        if (toolCalls > MAX_TOOL_CALLS) {
          results.push({ type: "tool_result", tool_use_id: tool.id, is_error: true, content: "Tool budget for this question is used up. Answer now with what you have, and say what you couldn't check." });
          emit({ type: "step", id: tool.id, label, status: "error" });
          continue;
        }
        const { content, isError } = await executeTool(tool.name, tool.input, { visitor });
        for (const id of content.match(TASK_ID) ?? []) seenIds.add(id);
        results.push({ type: "tool_result", tool_use_id: tool.id, content, is_error: isError });
        emit({ type: "step", id: tool.id, label, status: isError ? "error" : "done" });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    if (signal?.aborted) return { text: finalText, toolsUsed };
    if (stopReason) {
      emit({ type: "error", code: "failed", message: stopReason === "idle"
        ? "The model stopped responding partway through. Try again."
        : "This question took too long to answer. Try a narrower question." });
      return { text: finalText, toolsUsed };
    }
    const message = err instanceof Anthropic.RateLimitError ? "The model is busy right now. Try again in a minute."
      : err instanceof Anthropic.APIError ? `The model request failed (${err.status ?? "network"}).`
      : "Something went wrong while answering.";
    console.error("agent error", err);
    emit({ type: "error", code: "failed", message });
    return { text: finalText, toolsUsed };
  } finally {
    clearTimeout(deadline);
    clearTimeout(idle);
  }

  clearTimeout(deadline);
  clearTimeout(idle);
  // Only cite task IDs the tools actually returned; anything else is flagged as unverified
  const cited = [...new Set(finalText.match(TASK_ID) ?? [])];
  emit({
    type: "done",
    sources: cited.filter((id) => seenIds.has(id)),
    unverified: cited.filter((id) => !seenIds.has(id)),
    toolCalls,
    usage: { ...usage, costUsd: Math.round(usage.costUsd * 10000) / 10000 },
  });
  return { text: finalText, toolsUsed };
}
