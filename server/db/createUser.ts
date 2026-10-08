/**
 * Creates a staff account from the command line. Use it for the first account;
 * after that, add staff from the admin portal.
 *
 *   npm run user:create -- email@example.com First Last
 *
 * Prints a random temporary password. Log in and change it on the Account page.
 */
import { randomBytes } from "node:crypto";
import { createUserSchema } from "@shared/users";
import { pool } from "./index";
import { createUser } from "../services/users";

const [email, firstName, lastName] = process.argv.slice(2);
if (!email || !firstName || !lastName) {
  console.error("Usage: npm run user:create -- email@example.com First Last");
  process.exit(1);
}

async function main() {
  const password = randomBytes(12).toString("base64url");
  const input = createUserSchema.parse({ email, firstName, lastName, password });
  const user = await createUser(null, input);
  console.log(`Created ${user.firstName} ${user.lastName} <${user.email}> (id ${user.id}).`);
  console.log(`Temporary password: ${password}`);
  console.log("Log in at /admin and change it on the Account page.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
