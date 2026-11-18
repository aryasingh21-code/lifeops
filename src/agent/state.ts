import { Annotation } from "@langchain/langgraph";

export interface PlanStep {
  id: number;
  tool: string;
  description: string;
  args: Record<string, unknown>;
}

export interface StepResult {
  stepId: number;
  tool: string;
  ok: boolean;
  output?: unknown;
  error?: string;
  attempts: number;
}

export type Status = "planning" | "completed" | "failed" | "rejected";

const last = <T>(init: () => T) => Annotation<T>({ reducer: (_, b) => b, default: init });

export const AgentState = Annotation.Root({
  request: Annotation<string>(),
  memories: last<string[]>(() => []),
  plan: last<PlanStep[]>(() => []),
  approved: last<boolean>(() => false),
  cursor: last<number>(() => 0),
  results: Annotation<StepResult[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  failure: last<{ stepIndex: number; error: string } | null>(() => null),
  recoveries: last<number>(() => 0),
  status: last<Status>(() => "planning"),
});

export type AgentStateType = typeof AgentState.State;
