import { Client, Query } from "pg";

export type DbEnv = Pick<Env, "AGENT_DB" | "AGENT_WRITER_DB">;

function jsonSafe(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return btoa(String.fromCharCode(...value));
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  }
  return value;
}

export async function withDb<T>(binding: Hyperdrive, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: binding.connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function readQuery(binding: Hyperdrive, text: string, values: unknown[] = []) {
  return withDb(binding, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await client.query(text, values);
      await client.query("COMMIT");
      return result.rows.map((row) => jsonSafe(row));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

export async function writeQuery(binding: Hyperdrive, text: string, values: unknown[] = []) {
  return withDb(binding, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await client.query(text, values);
      await client.query("COMMIT");
      return result.rows.map((row) => jsonSafe(row));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

// Prepared statements let PostgreSQL reject multiple commands without a regex
// rejecting ordinary comments, quoted values, or a trailing semicolon.
export function assertDemoSql(sql: string): string {
  const normalized = sql.trim();
  if (!normalized || normalized.length > 16000) throw new Error("SQL must be 1–16000 characters");
  const command = normalized.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/, "");
  if (!/^(select|with|insert|update|delete|explain)\b/i.test(command)) {
    throw new Error("Use SELECT, WITH, INSERT, UPDATE, DELETE, or EXPLAIN");
  }
  return normalized;
}

export async function demoQuery(binding: Hyperdrive, sql: string, limit = 50) {
  const text = assertDemoSql(sql);
  return withDb(binding, async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SET LOCAL lock_timeout = '3s'");
      const result = await new Promise<{ command: string; rowCount: number; rows: unknown[]; truncated: boolean }>((resolve, reject) => {
        const rows: unknown[] = [];
        const query = new Query({ name: "demo-query", text, values: [] });
        query.on("row", (row) => { if (rows.length < limit) rows.push(jsonSafe(row)); });
        query.on("error", reject);
        query.on("end", (result) => resolve({ command: result.command, rowCount: result.rowCount ?? 0, rows, truncated: (result.rowCount ?? 0) > limit }));
        client.query(query);
      });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}
