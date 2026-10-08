import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

// Applies pending migrations from ./migrations. Runs before the server on every
// deploy (see the start script), and locally via `npm run db:migrate`.
async function main() {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "migrations") });
  console.log("Migrations applied");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
