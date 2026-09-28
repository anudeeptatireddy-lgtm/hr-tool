// Applies db/*.sql in order. Uses the direct (unpooled) connection, as Neon advises for schema changes.
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set");
const pool = new Pool({ connectionString: url });
const dir = join(import.meta.dirname, "..", "db");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
  await pool.query(readFileSync(join(dir, f), "utf8"));
  console.log(`applied ${f}`);
}
const { rows } = await pool.query("select column_name, data_type from information_schema.columns where table_name = 'screenings' order by ordinal_position");
console.log("screenings:", rows.map((r) => `${r.column_name} ${r.data_type}`).join(", "));
await pool.end();
