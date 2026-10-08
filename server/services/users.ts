import { hash, verify } from "@node-rs/argon2";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type {
  ChangePasswordInput,
  CreateUserInput,
  PublicUser,
  UpdateUserInput,
} from "@shared/users";
import { db, withActor } from "../db";
import { users, userSessions } from "../db/schema";
import { isUniqueViolation, ServiceError } from "./errors";

type UserRow = typeof users.$inferSelect;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

// The library defaults are argon2id with OWASP-recommended cost settings.
export const hashPassword = (password: string) => hash(password);

// Checked against when the email doesn't exist, so a wrong email takes as long
// as a wrong password and response times don't reveal which accounts exist.
let dummyHash: Promise<string> | undefined;

/** Returns the user if the email and password match an active account. */
export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!row) {
    dummyHash ??= hashPassword("not-a-real-password");
    await verify(await dummyHash, password);
    return null;
  }
  const ok = await verify(row.passwordHash, password);
  return ok && row.isActive ? toPublicUser(row) : null;
}

/** Loads the user behind a session. Inactive users count as logged out. */
export async function findActiveUser(id: number): Promise<PublicUser | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, id) });
  return row?.isActive ? toPublicUser(row) : null;
}

export async function listUsers(): Promise<PublicUser[]> {
  const rows = await db.query.users.findMany({
    orderBy: [asc(users.firstName), asc(users.lastName)],
  });
  return rows.map(toPublicUser);
}

export async function createUser(actorId: number | null, input: CreateUserInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await withActor(actorId, async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
        })
        .returning();
      return toPublicUser(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ServiceError(409, "A staff member with that email already exists");
    }
    throw error;
  }
}

export async function updateUser(
  actorId: number,
  userId: number,
  input: UpdateUserInput,
): Promise<PublicUser> {
  if (userId === actorId && input.isActive === false) {
    // Also guarantees there is always at least one active user.
    throw new ServiceError(400, "You can't deactivate your own account");
  }

  try {
    return await withActor(actorId, async (tx) => {
      const [row] = await tx.update(users).set(input).where(eq(users.id, userId)).returning();
      if (!row) throw new ServiceError(404, "Staff member not found");
      if (input.isActive === false) await revokeSessions(tx, userId);
      return toPublicUser(row);
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ServiceError(409, "A staff member with that email already exists");
    }
    throw error;
  }
}

/** Sets a new password for another staff member and logs them out everywhere. */
export async function resetPassword(actorId: number, userId: number, password: string) {
  const passwordHash = await hashPassword(password);
  await withActor(actorId, async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    if (!row) throw new ServiceError(404, "Staff member not found");
    await revokeSessions(tx, userId);
  });
}

/** Changes the caller's own password and logs out their other sessions. */
export async function changeOwnPassword(
  userId: number,
  currentSessionId: string,
  input: ChangePasswordInput,
) {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row || !(await verify(row.passwordHash, input.currentPassword))) {
    throw new ServiceError(400, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await withActor(userId, async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await revokeSessions(tx, userId, currentSessionId);
  });
}

type Executor = Pick<typeof db, "delete">;

// Passport stores the user id at sess.passport.user.
async function revokeSessions(tx: Executor, userId: number, keepSessionId?: string) {
  const ownedByUser = sql`${userSessions.sess}->'passport'->>'user' = ${String(userId)}`;
  await tx
    .delete(userSessions)
    .where(keepSessionId ? and(ownedByUser, ne(userSessions.sid, keepSessionId)) : ownedByUser);
}
