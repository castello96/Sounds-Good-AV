import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import config from "../config";
import * as schema from "./schema";

const connectionString = config.get("database.url");
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to .env (see .env.example).");
}

export const pool = new pg.Pool({ connectionString });

// Neon drops idle connections when it scales to zero. Without a listener, that
// error on an idle client would crash the process; the pool replaces it anyway.
pool.on("error", (error) => console.error("Idle database connection error:", error.message));

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs fn in a transaction attributed to a staff user. The audit trigger reads
 * app.user_id, so every row written inside fn is logged against userId.
 * Pass null for writes that don't come from a logged-in user (public site, scripts).
 */
export function withActor<T>(userId: number | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    if (userId !== null) {
      // The third argument (true) scopes the setting to this transaction only.
      await tx.execute(sql`select set_config('app.user_id', ${String(userId)}, true)`);
    }
    return fn(tx);
  });
}
