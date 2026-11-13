import "./env.mjs";
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  if (process.argv.includes("--reset")) {
    if (process.env.NODE_ENV === "production") throw new Error("운영 환경에서는 --reset 금지");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    console.log("schema reset");
  }
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const name of readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(`db/migrations/${name}`, "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      console.log("applied", name);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await client.end();
}
