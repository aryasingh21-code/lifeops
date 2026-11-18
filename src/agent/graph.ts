import { END, START, StateGraph, interrupt } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { z } from "zod";
import type { MemoryStore } from "../memory.js";
import type { Tool } from "../tools/index.js";
import type { Planner } from "./planner.js";
import { AgentState, type AgentStateType, type PlanStep, type StepResult } from "./state.js";

export interface GraphDeps {
  tools: Tool[];
  planner: Planner;
  memory: MemoryStore;
  checkpointer: BaseCheckpointSaver;
  maxRetries?: number;
  maxRecoveries?: number;
  retryBaseMs?: number;
}

export interface Approval {
  approved: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runStep(
  tool: Tool | undefined,
  step: PlanStep,
  maxRetries: number,
  baseMs: number,
): Promise<StepResult> {
  const base = { stepId: step.id, tool: step.tool };
  if (!tool) return { ...base, ok: false, error: `Unknown tool: ${step.tool}`, attempts: 0 };

  const parsed = tool.schema.safeParse(step.args);
  if (!parsed.success) {
    return { ...base, ok: false, error: `Invalid arguments: ${z.prettifyError(parsed.error)}`, attempts: 0 };
  }

  let error = "";
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const output = await tool.run(parsed.data);
      return { ...base, ok: true, output, attempts: attempt };
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (attempt < maxRetries) await sleep(baseMs * 2 ** (attempt - 1)); // exponential backoff
    }
  }
  return { ...base, ok: false, error, attempts: maxRetries };
}

export function buildGraph(deps: GraphDeps) {
  const { tools, planner, memory, checkpointer } = deps;
  const maxRetries = deps.maxRetries ?? 3;
  const maxRecoveries = deps.maxRecoveries ?? 2;
  const baseMs = deps.retryBaseMs ?? 500;
  const byName = new Map(tools.map((t) => [t.name, t]));

  return new StateGraph(AgentState)
    // 1. Persistent memory: load relevant facts from earlier runs
    .addNode("recall", async (s: AgentStateType) => ({ memories: await memory.recall(s.request) }))

    // 2. Planning (node is named "planner": "plan" is already a state field): natural language -> ordered tool calls
    .addNode("planner", async (s: AgentStateType) => {
      const plan = await planner.plan({ request: s.request, memories: s.memories, tools });
      return { plan, status: plan.length ? ("planning" as const) : ("failed" as const) };
    })

    // 3. Human-in-the-loop: pause until the user approves or rejects the plan
    .addNode("approval", (s: AgentStateType) => {
      const decision = interrupt({ type: "approval", plan: s.plan }) as Approval;
      return { approved: decision.approved, status: decision.approved ? s.status : ("rejected" as const) };
    })

    // 4. Execution with per-step retries (exponential backoff)
    .addNode("execute", async (s: AgentStateType) => {
      const results: StepResult[] = [];
      for (let i = s.cursor; i < s.plan.length; i++) {
        const step = s.plan[i];
        const r = await runStep(byName.get(step.tool), step, maxRetries, baseMs);
        results.push(r);
        if (!r.ok) {
          return {
            results,
            cursor: i,
            failure: { stepIndex: i, error: r.error ?? "unknown error" },
            status: s.recoveries >= maxRecoveries ? ("failed" as const) : s.status,
          };
        }
      }
      return { results, cursor: s.plan.length, failure: null, status: "completed" as const };
    })

    // 5. Failure recovery: ask the planner for a corrected step, then resume execution
    .addNode("recover", async (s: AgentStateType) => {
      const { stepIndex, error } = s.failure!;
      const fixed = await planner.recover({ request: s.request, step: s.plan[stepIndex], error, tools });
      if (!fixed) return { status: "failed" as const };
      const plan = s.plan.map((p, i) => (i === stepIndex ? fixed : p));
      return { plan, failure: null, recoveries: s.recoveries + 1 };
    })

    // 6. Persist a summary of the run for future conversations
    .addNode("remember", async (s: AgentStateType) => {
      if (s.status !== "rejected") {
        const tools = s.plan.map((p) => p.tool).join(" -> ");
        await memory.remember(`Request: "${s.request}" | plan: ${tools} | outcome: ${s.status}`);
      }
      return {};
    })

    .addEdge(START, "recall")
    .addEdge("recall", "planner")
    .addConditionalEdges("planner", (s: AgentStateType) => (s.status === "failed" ? "remember" : "approval"), [
      "approval",
      "remember",
    ])
    .addConditionalEdges("approval", (s: AgentStateType) => (s.approved ? "execute" : "remember"), [
      "execute",
      "remember",
    ])
    .addConditionalEdges(
      "execute",
      (s: AgentStateType) => (s.failure && s.status !== "failed" ? "recover" : "remember"),
      ["recover", "remember"],
    )
    .addConditionalEdges("recover", (s: AgentStateType) => (s.status === "failed" ? "remember" : "execute"), [
      "execute",
      "remember",
    ])
    .addEdge("remember", END)
    .compile({ checkpointer });
}
