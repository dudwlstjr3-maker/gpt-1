import { Pool, type PoolClient } from "pg";

const g = globalThis as unknown as { __btPool?: Pool };

export const pool =
  g.__btPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX || 10) });
g.__btPool = pool;

export type Db = Pool | PoolClient;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export async function q<T = Row>(text: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const r = await db.query(text, params);
  return r.rows as T[];
}

export async function q1<T = Row>(text: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const r = await db.query(text, params);
  return (r.rows[0] as T) ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
