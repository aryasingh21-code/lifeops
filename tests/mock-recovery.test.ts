import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemorySaver } from "@langchain/langgraph";
import { test } from "node:test";

import { buildGraph } from "../src/agent/graph.js";
import { MockPlanner } from "../src/agent/mock-planner.js";
import { runAgent } from "../src/agent/run.js";
import { InMemoryStore } from "../src/memory.js";
import { createMockTools } from "../src/tools/mock.js";

test("mock planner recovers from a failed tool execution", async () => {
  const graph = buildGraph({
    tools: createMockTools({
      calendar_list_events: 3,
    }),
    planner: new MockPlanner(true),
    memory: new InMemoryStore(),
    checkpointer: new MemorySaver(),
    maxRetries: 3,
    maxRecoveries: 2,
    retryBaseMs: 0,
  });

  const state = await runAgent(
    graph,
    "Check my calendar tomorrow",
    randomUUID(),
    async () => true,
  );

  // The overall task should complete.
  assert.equal(state.status, "completed");

  // First execution fails after three attempts.
  assert.equal(state.results[0].ok, false);
  assert.equal(state.results[0].attempts, 3);

  // Recovery executes the same step successfully.
  assert.equal(state.results[1].ok, true);
  assert.equal(state.results[1].attempts, 1);

  console.log("Mock recovery test passed!");
});
