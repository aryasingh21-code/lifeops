import { Command } from "@langchain/langgraph";
import type { buildGraph } from "./graph.js";
import type { AgentStateType, PlanStep } from "./state.js";

type Graph = ReturnType<typeof buildGraph>;

/**
 * Runs the graph until it finishes or pauses for approval.
 * `approve` is called with the proposed plan and decides whether to continue.
 */
export async function runAgent(
  graph: Graph,
  request: string,
  threadId: string,
  approve: (plan: PlanStep[]) => Promise<boolean>,
): Promise<AgentStateType> {
  const config = { configurable: { thread_id: threadId } };
  let state = (await graph.invoke({ request }, config)) as AgentStateType;

  const snapshot = await graph.getState(config);
  if (snapshot.next.length > 0) {
    const approved = await approve(snapshot.values.plan as PlanStep[]);
    state = (await graph.invoke(new Command({ resume: { approved } }), config)) as AgentStateType;
  }
  return state;
}
