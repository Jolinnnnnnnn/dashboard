// The agent's tools: read-only queries over the task data (lib/data.ts).
// Each tool validates its input with zod before running; the model's input is untrusted.
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import {
  agentSimilar, agentTask, briefingForAgent, clientStats, moduleStats, searchTasks, stakeholderStats,
} from "@/lib/data";

const TaskId = z.string().regex(/^T-\d{4}$/i, "Task IDs look like T-4821");

const schemas = {
  search_tasks: z.object({
    query: z.string().max(100).optional(),
    status: z.enum(["open", "closed", "any"]).optional(),
    stakeholder: z.string().max(40).optional(),
    client: z.string().max(60).optional(),
    type: z.string().max(40).optional(),
    risk: z.enum(["High", "Medium", "Low", "at_risk"]).optional(),
    module: z.string().max(40).optional(),
    created_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  get_task: z.object({ task_id: TaskId }),
  find_similar_cases: z.object({ task_id: TaskId, limit: z.number().int().min(1).max(5).optional() }),
  get_stakeholder_stats: z.object({
    stakeholder: z.string().max(40).optional(),
    task_type: z.string().max(40).optional(),
    window: z.enum(["90", "180", "365"]).optional(),
  }),
  get_module_stats: z.object({ module: z.string().max(40).optional() }),
  get_client_stats: z.object({ client: z.string().max(60) }),
  get_briefing: z.object({}),
} as const;

export type ToolName = keyof typeof schemas;

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_tasks",
    description:
      "Search the 500 client tasks (100 open, 400 closed). Filters combine with AND. `stakeholder` matches only open tasks currently with that team. " +
      "`risk: at_risk` means Medium or High. Results are sorted most urgent first (open tasks by hold ratio). Returns total_matches plus up to `limit` rows.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text matched against task ID, title, description, and client name" },
        status: { type: "string", enum: ["open", "closed", "any"], description: "Default any" },
        stakeholder: { type: "string", description: "Team name or id, e.g. 'Network Eng' or 'security'" },
        client: { type: "string", description: "Client name, e.g. 'Northwind Media'" },
        type: { type: "string", description: "Task type, e.g. 'Cache purge bug'" },
        risk: { type: "string", enum: ["High", "Medium", "Low", "at_risk"] },
        module: { type: "string", description: "Code module, e.g. 'edge-sync'" },
        created_after: { type: "string", description: "YYYY-MM-DD" },
        limit: { type: "integer", description: "1-25, default 10" },
      },
    },
  },
  {
    name: "get_task",
    description:
      "Full record for one task: description, client, code areas, handoff timeline with days per team, and for open tasks the next-stakeholder prediction " +
      "(probabilities, evidence, expected route, estimated close) and the AI summary; for closed tasks the solution note.",
    input_schema: { type: "object", properties: { task_id: { type: "string", description: "e.g. T-4821" } }, required: ["task_id"] },
  },
  {
    name: "find_similar_cases",
    description: "Closed tasks most similar to a task (text + shared code modules), with match score, what matched, how each was solved, and days to close.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" }, limit: { type: "integer", description: "1-5, default 3" } },
      required: ["task_id"],
    },
  },
  {
    name: "get_stakeholder_stats",
    description:
      "Without `stakeholder`: one table comparing every team (median and average hold, volume, open and at-risk tasks now) plus which team is the bottleneck; " +
      "use this for any cross-team comparison. With `stakeholder`: how that team handles tasks: volume, average and median hold, where tasks go next " +
      "(with rework counts), where they arrive from, per-task-type routing over 12 months, open tasks with them now, and recorded process changes.",
    input_schema: {
      type: "object",
      properties: {
        stakeholder: { type: "string", description: "Team name or id; omit to compare all teams" },
        task_type: { type: "string", description: "Optional: limit the per-type routing to one task type" },
        window: { type: "string", enum: ["90", "180", "365"], description: "Days of history, default 365" },
      },
    },
  },
  {
    name: "get_module_stats",
    description:
      "Code modules. Without `module`: the top modules by task count with at-risk counts. With `module`: its description, rank, open and at-risk tasks touching it, " +
      "affected clients, median days to close, and recent fixes.",
    input_schema: { type: "object", properties: { module: { type: "string", description: "e.g. 'edge-sync'" } } },
  },
  {
    name: "get_client_stats",
    description: "One client: tier, region, open tasks (and which wait on the client), closed count, median days to close, and how fast they respond vs other clients.",
    input_schema: { type: "object", properties: { client: { type: "string" } }, required: ["client"] },
  },
  {
    name: "get_briefing",
    description: "Today's briefing: the detected insights with their facts and evidence task IDs, the watch-rule counts, and recorded process changes.",
    input_schema: { type: "object", properties: {} },
  },
];

const run: { [K in ToolName]: (input: z.infer<(typeof schemas)[K]>) => unknown } = {
  search_tasks: (i) => searchTasks(i),
  get_task: (i) => agentTask(i.task_id),
  find_similar_cases: (i) => agentSimilar(i.task_id, i.limit),
  get_stakeholder_stats: (i) => stakeholderStats(i.stakeholder, i.task_type, i.window),
  get_module_stats: (i) => moduleStats(i.module),
  get_client_stats: (i) => clientStats(i.client),
  get_briefing: () => briefingForAgent(),
};

/** Validates input and runs a tool. Returns the JSON result and whether it is an error. */
export function executeTool(name: string, input: unknown): { content: string; isError: boolean } {
  if (!(name in schemas)) return { content: JSON.stringify({ error: `Unknown tool ${name}` }), isError: true };
  const parsed = schemas[name as ToolName].safeParse(input ?? {});
  if (!parsed.success) {
    return { content: JSON.stringify({ error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }), isError: true };
  }
  const result = (run[name as ToolName] as (i: unknown) => unknown)(parsed.data);
  const isError = typeof result === "object" && result !== null && "error" in result;
  return { content: JSON.stringify(result), isError };
}

/** Plain-language label for the step trail in the UI. */
export function stepLabel(name: string, input: Record<string, unknown>): string {
  const i = input ?? {};
  switch (name) {
    case "search_tasks": {
      const parts = [i.status, i.risk === "at_risk" ? "at-risk" : i.risk, i.type, i.client, i.stakeholder && `with ${i.stakeholder}`, i.module && `touching ${i.module}`, i.query && `"${i.query}"`]
        .filter(Boolean);
      return `Searched tasks${parts.length ? ` (${parts.join(", ")})` : ""}`;
    }
    case "get_task": return `Read ${i.task_id}`;
    case "find_similar_cases": return `Found cases similar to ${i.task_id}`;
    case "get_stakeholder_stats": return `${i.stakeholder ? `Pulled ${i.stakeholder} handoff stats` : "Compared all teams"}${i.window && i.window !== "365" ? ` (${i.window} days)` : ""}`;
    case "get_module_stats": return i.module ? `Checked module ${i.module}` : "Ranked code modules";
    case "get_client_stats": return `Checked ${i.client}`;
    case "get_briefing": return "Read today's briefing";
    default: return name;
  }
}
