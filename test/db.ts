import { sql } from "drizzle-orm";
import { db } from "../server/db";

/** Empties every table so each test starts from a clean database. */
export async function resetDatabase() {
  const { rows } = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}
