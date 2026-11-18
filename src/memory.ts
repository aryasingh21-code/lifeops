import pg from "pg";
import { config } from "./config.js";

export interface MemoryStore {
  recall(query: string): Promise<string[]>;
  remember(text: string): Promise<void>;
}

export class InMemoryStore implements MemoryStore {
  items: string[] = [];
  async recall() {
    return this.items.slice(-5);
  }
  async remember(text: string) {
    this.items.push(text);
  }
}

/** Long-term memory in PostgreSQL: full-text matches first, then most recent. */
export class PgMemoryStore implements MemoryStore {
  constructor(private pool = new pg.Pool({ connectionString: config.databaseUrl })) {}

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
  }

  async recall(query: string) {
    const { rows } = await this.pool.query(
      `SELECT content FROM memories
       ORDER BY (to_tsvector('english', content) @@ plainto_tsquery('english', $1)) DESC,
                created_at DESC
       LIMIT 5`,
      [query],
    );
    return rows.map((r) => r.content as string);
  }

  async remember(text: string) {
    await this.pool.query("INSERT INTO memories (content) VALUES ($1)", [text]);
  }

  async close() {
    await this.pool.end();
  }
}
