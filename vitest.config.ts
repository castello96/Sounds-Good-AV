import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    include: ["server/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Never used: test/setup.ts replaces the database driver with in-memory
    // PGlite. Set so server/db's startup check passes.
    env: { DATABASE_URL: "postgresql://unused@localhost/test" },
  },
});
