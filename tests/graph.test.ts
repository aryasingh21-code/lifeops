import assert from "node:assert/strict";
import { test } from "node:test";
import { MemorySaver } from "@langchain/langgraph";
import { buildGraph } from "../src/agent/graph.js";
import type { Planner } from "../src/agent/planner.js";
import { runAgent } from "../src/agent/run.js";
import { InMemoryStore } from "../src/memory.js";
import { createMockTools } from "../src/tools/mock.js";

const fakePlanner: Planner = {
  async plan() {
    return [
      { id: 1, tool: "calendar_list_events", description: "check", args: { timeMin: "2026-11-20T00:00:00Z", timeMax: "2026-11-21T00:00:00Z" } },
      { id: 2, tool: "gmail_send", description: "send", args: { to: "a@example.com", subject: "hi", body: "hello" } },
    ];
  },
  async recover({ step }) {
    return { ...step, description: "retry with fix" };
  },
};

const make = (failures = {}, memory = new InMemoryStore()) =>
  buildGraph({
    tools: createMockTools(failures),
    planner: fakePlanner,
    memory,
    checkpointer: new MemorySaver(),
    retryBaseMs: 0,
  });

test("executes the plan after approval and stores memory", async () => {
  const memory = new InMemoryStore();
  const s = await runAgent(make({}, memory), "x", "t1", async () => true);
  assert.equal(s.status, "completed");
  assert.equal(s.results.length, 2);
  assert.equal(memory.items.length, 1);
});

test("rejected plan executes nothing", async () => {
  const s = await runAgent(make(), "x", "t2", async () => false);
  assert.equal(s.status, "rejected");
  assert.equal(s.results.length, 0);
});

test("transient failure is fixed by retries", async () => {
  const s = await runAgent(make({ gmail_send: 2 }), "x", "t3", async () => true);
  assert.equal(s.status, "completed");
  assert.equal(s.results.find((r) => r.tool === "gmail_send")?.attempts, 3);
  assert.equal(s.recoveries, 0);
});

test("persistent failure triggers recovery and then completes", async () => {
  const s = await runAgent(make({ gmail_send: 3 }), "x", "t4", async () => true);
  assert.equal(s.status, "completed");
  assert.equal(s.recoveries, 1);
});

test("gives up after max recoveries", async () => {
  const s = await runAgent(make({ gmail_send: 100 }), "x", "t5", async () => true);
  assert.equal(s.status, "failed");
});

test("invalid arguments are caught before the tool runs", async () => {
  const bad: Planner = { ...fakePlanner, async plan() { return [{ id: 1, tool: "gmail_send", description: "bad", args: { to: "not-an-email" } }]; }, async recover() { return null; } };
  const g = buildGraph({ tools: createMockTools(), planner: bad, memory: new InMemoryStore(), checkpointer: new MemorySaver(), retryBaseMs: 0 });
  const s = await runAgent(g, "x", "t6", async () => true);
  assert.equal(s.status, "failed");
  assert.equal(s.results[0].attempts, 0);
});
