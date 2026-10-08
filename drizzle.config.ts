import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't read .env on its own.
try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the real environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
