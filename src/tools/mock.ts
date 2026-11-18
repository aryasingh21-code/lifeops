import { realTools, type Tool } from "./index.js";

/**
 * Mock versions of every real tool (same names + schemas, no network).
 * `failures[name] = n` makes the first n calls to that tool throw, to exercise retries/recovery.
 */
export function createMockTools(failures: Record<string, number> = {}): Tool[] {
  const calls: Record<string, number> = {};
  return realTools.map((t) => ({
    ...t,
    run: async (raw: unknown) => {
      t.schema.parse(raw);
      calls[t.name] = (calls[t.name] ?? 0) + 1;
      if (calls[t.name] <= (failures[t.name] ?? 0)) {
        throw new Error(`Simulated transient failure in ${t.name}`);
      }
      return { mock: true, tool: t.name, args: raw };
    },
  }));
}
