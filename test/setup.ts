import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { vi } from "vitest";

/**
 * Each test file gets its own in-memory Postgres (PGlite) with the real
 * migrations applied, so tests run the same constraints and triggers as Neon
 * without Docker or a network connection.
 *
 * server/db builds its client with drizzle-orm/node-postgres; this swaps that
 * one function so the rest of server/db (withActor included) runs unchanged.
 */
const client = await PGlite.create();
await migrate(drizzle(client), { migrationsFolder: path.resolve(import.meta.dirname, "../migrations") });

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: (_pool: unknown, config: object) => drizzle(client, config),
}));
