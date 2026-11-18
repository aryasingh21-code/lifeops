import { z } from "zod";

export interface Tool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  run(args: unknown): Promise<unknown>;
}

/** Defines a tool whose arguments are validated (and defaulted) by its zod schema. */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: {
  name: string;
  description: string;
  schema: S;
  run: (args: z.infer<S>) => Promise<unknown>;
}): Tool {
  return {
    name: def.name,
    description: def.description,
    schema: def.schema,
    run: (raw) => def.run(def.schema.parse(raw)),
  };
}
