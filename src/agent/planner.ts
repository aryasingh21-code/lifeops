import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { config } from "../config.js";
import type { Tool } from "../tools/index.js";
import type { PlanStep } from "./state.js";

export interface Planner {
  plan(input: { request: string; memories: string[]; tools: Tool[] }): Promise<PlanStep[]>;
  /** Returns a corrected replacement for a failed step, or null to give up. */
  recover(input: {
    request: string;
    step: PlanStep;
    error: string;
    tools: Tool[];
  }): Promise<PlanStep | null>;
}

const PlanSchema = z.object({
  steps: z.array(
    z.object({
      tool: z.string().describe("Exact tool name"),
      description: z.string().describe("One-line, human-readable purpose of this step"),
      argsJson: z.string().describe("Tool arguments as a JSON object string"),
    }),
  ),
});

const RecoverySchema = z.object({
  giveUp: z.boolean(),
  tool: z.string(),
  description: z.string(),
  argsJson: z.string(),
});

const toolDocs = (tools: Tool[]) =>
  tools
    .map(
      (t) =>
        `- ${t.name}: ${t.description}\n  args schema: ${JSON.stringify(z.toJSONSchema(t.schema))}`,
    )
    .join("\n");

function parseArgs(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export class AnthropicPlanner implements Planner {
  private llm = new ChatAnthropic({ model: config.model });

  async plan({ request, memories, tools }: Parameters<Planner["plan"]>[0]) {
    const system = [
      "You are LifeOps, a personal execution agent. Convert the user's request into the shortest ordered plan of tool calls that fulfils it.",
      `Current time: ${new Date().toISOString()}. User timezone: ${config.timezone}. Always output datetimes as ISO 8601 with a UTC offset.`,
      "Rules:",
      "- Use only the tools listed below, with exact names.",
      "- Before calendar_create_event, check availability with calendar_list_events for that time window.",
      "- Use gmail_create_draft when the user says 'draft'; use gmail_send only when they say 'send'.",
      "- Do not invent email addresses; if one is missing, return an empty plan.",
      "- Later steps cannot reference earlier results, so only plan steps whose arguments are known now.",
      memories.length ? `Relevant memory about the user:\n${memories.map((m) => `- ${m}`).join("\n")}` : "",
      `Tools:\n${toolDocs(tools)}`,
    ]
      .filter(Boolean)
      .join("\n");

    const out = await this.llm
      .withStructuredOutput(PlanSchema)
      .invoke([new SystemMessage(system), new HumanMessage(request)]);

    return out.steps.map((s, i) => ({
      id: i + 1,
      tool: s.tool,
      description: s.description,
      args: parseArgs(s.argsJson),
    }));
  }

  async recover({ request, step, error, tools }: Parameters<Planner["recover"]>[0]) {
    const system = [
      "A step in an execution plan failed after retries. Propose a corrected version of the step (fix invalid arguments, or choose a better tool), or set giveUp=true if it cannot succeed.",
      `Tools:\n${toolDocs(tools)}`,
    ].join("\n");
    const user = `Request: ${request}\nFailed step: ${JSON.stringify(step)}\nError: ${error}`;

    const out = await this.llm
      .withStructuredOutput(RecoverySchema)
      .invoke([new SystemMessage(system), new HumanMessage(user)]);

    if (out.giveUp) return null;
    return { id: step.id, tool: out.tool, description: out.description, args: parseArgs(out.argsJson) };
  }
}
