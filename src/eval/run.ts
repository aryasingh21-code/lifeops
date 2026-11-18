import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { MemorySaver } from "@langchain/langgraph";
import { buildGraph } from "../agent/graph.js";
import { AnthropicPlanner } from "../agent/planner.js";
import { runAgent } from "../agent/run.js";
import type { StepResult } from "../agent/state.js";
import { InMemoryStore } from "../memory.js";
import { createMockTools } from "../tools/mock.js";

interface Scenario {
  id: string;
  request: string;
  expectedTools: string[];
  failures?: Record<string, number>;
}

const scenarios: Scenario[] = JSON.parse(
  readFileSync(new URL("../../eval/scenarios.json", import.meta.url), "utf8"),
);

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);
const rows = [];

for (const sc of scenarios) {
  const graph = buildGraph({
    tools: createMockTools(sc.failures),
    planner: new AnthropicPlanner(),
    memory: new InMemoryStore(),
    checkpointer: new MemorySaver(),
    retryBaseMs: 0,
  });

  let plannedTools: string[] = [];
  let status = "error";
  let finalOk = 0;
  try {
    const state = await runAgent(graph, sc.request, randomUUID(), async (plan) => {
      plannedTools = plan.map((p) => p.tool);
      return true; // auto-approve in eval
    });
    status = state.status;
    // last result per step = final outcome of that step (after retries/recovery)
    const finalByStep = new Map<number, StepResult>();
    for (const r of state.results) finalByStep.set(r.stepId, r);
    finalOk = [...finalByStep.values()].filter((r) => r.ok).length;
    if (!plannedTools.length) plannedTools = state.plan.map((p) => p.tool);
    rows.push({
      id: sc.id,
      toolMatch: JSON.stringify(plannedTools) === JSON.stringify(sc.expectedTools),
      steps: state.plan.length,
      stepsOk: finalOk,
      completed: state.status === "completed",
      injectedFailure: !!sc.failures,
      status,
    });
  } catch (e) {
    rows.push({ id: sc.id, toolMatch: false, steps: 0, stepsOk: 0, completed: false, injectedFailure: !!sc.failures, status: `error: ${e}` });
  }
}

const n = rows.length;
const withFailures = rows.filter((r) => r.injectedFailure);
const summary = {
  scenarios: n,
  toolSelectionAccuracy: pct(rows.filter((r) => r.toolMatch).length, n),
  executionSuccess: pct(rows.reduce((a, r) => a + r.stepsOk, 0), rows.reduce((a, r) => a + r.steps, 0)),
  taskCompletion: pct(rows.filter((r) => r.completed).length, n),
  errorRecovery: pct(withFailures.filter((r) => r.completed).length, withFailures.length),
};

console.table(rows);
console.table([summary]);

mkdirSync("eval/results", { recursive: true });
writeFileSync(`eval/results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`, JSON.stringify({ summary, rows }, null, 2));
