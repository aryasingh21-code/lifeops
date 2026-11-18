import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { MemorySaver } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { buildGraph } from "./agent/graph.js";
import { AnthropicPlanner } from "./agent/planner.js";
import { MockPlanner } from "./agent/mock-planner.js";
import { runAgent } from "./agent/run.js";
import { config } from "./config.js";
import { InMemoryStore, PgMemoryStore, type MemoryStore } from "./memory.js";
import { realTools } from "./tools/index.js";
import { createMockTools } from "./tools/mock.js";

async function main() {
  const args = process.argv.slice(2);
  const mock = args.includes("--mock");
  const request = args
    .filter((a) => a !== "--mock")
    .join(" ")
    .trim();

  if (!request) {
    console.error('Usage: npm run dev -- [--mock] "your request"');
    process.exit(1);
  }

  console.log(
    mock
      ? "\nLifeOps running in MOCK mode."
      : "\nLifeOps running in REAL mode.",
  );

  const memory: MemoryStore = mock ? new InMemoryStore() : new PgMemoryStore();

  let postgresCheckpointer: PostgresSaver | undefined;

  const checkpointer = mock
    ? new MemorySaver()
    : (postgresCheckpointer = PostgresSaver.fromConnString(config.databaseUrl));

  if (memory instanceof PgMemoryStore) {
    await memory.init();
  }

  if (postgresCheckpointer) {
    await postgresCheckpointer.setup();
  }

  const tools = mock ? createMockTools() : realTools;
  const planner = mock ? new MockPlanner() : new AnthropicPlanner();

  const graph = buildGraph({
    tools,
    planner,
    memory,
    checkpointer,
    maxRetries: config.maxRetries,
    maxRecoveries: config.maxRecoveries,
    retryBaseMs: config.retryBaseMs,
  });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const state = await runAgent(graph, request, randomUUID(), async (plan) => {
      console.log("\nProposed plan:");

      plan.forEach((step) => {
        console.log(
          `  ${step.id}. [${step.tool}] ${step.description}\n     ${JSON.stringify(step.args)}`,
        );
      });

      const answer = await rl.question("\nApprove and execute? (y/N) ");

      return answer.trim().toLowerCase().startsWith("y");
    });

    console.log(`\nStatus: ${state.status}`);

    for (const result of state.results) {
      console.log(
        `  step ${result.stepId} ${result.tool}: ${
          result.ok ? "ok" : `FAILED (${result.error})`
        } [attempts: ${result.attempts}]`,
      );

      if (result.output) {
        console.log("    Output:", JSON.stringify(result.output));
      }
    }
  } finally {
    rl.close();

    if (postgresCheckpointer) {
      await postgresCheckpointer.end();
    }

    if (memory instanceof PgMemoryStore) {
      await memory.close();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
