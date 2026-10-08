import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDatabase } from "../../test/db";
import { db } from "../db";
import { auditEvents, userSessions, users } from "../db/schema";
import { ServiceError } from "./errors";
import {
  authenticate,
  changeOwnPassword,
  createUser,
  findActiveUser,
  resetPassword,
  updateUser,
} from "./users";

const PASSWORD = "correct horse battery";

function newUser(email: string, actorId: number | null = null) {
  return createUser(actorId, { email, firstName: "Test", lastName: email, password: PASSWORD });
}

async function addSession(sid: string, userId: number) {
  await db.insert(userSessions).values({
    sid,
    sess: { cookie: {}, passport: { user: userId } },
    expire: new Date(Date.now() + 60_000),
  });
}

async function sessionIds() {
  const rows = await db.select({ sid: userSessions.sid }).from(userSessions);
  return rows.map((r) => r.sid).sort();
}

async function expectServiceError(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (e) => e,
  );
  expect(error).toBeInstanceOf(ServiceError);
  expect(error.status).toBe(status);
}

beforeEach(resetDatabase);

describe("createUser", () => {
  it("stores an argon2 hash, never the password, and returns no hash", async () => {
    const user = await newUser("a@example.com");
    expect(user).not.toHaveProperty("passwordHash");

    const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row!.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects a duplicate email with 409", async () => {
    await newUser("a@example.com");
    await expectServiceError(newUser("a@example.com"), 409);
  });

  it("attributes the audit event to the acting user", async () => {
    const admin = await newUser("admin@example.com");
    const created = await newUser("b@example.com", admin.id);

    const event = await db.query.auditEvents.findFirst({
      where: eq(auditEvents.entityId, created.id),
    });
    expect(event).toMatchObject({ action: "insert", entityType: "users", userId: admin.id });
    expect(JSON.stringify(event!.changes)).not.toContain("argon2");
  });
});

describe("authenticate", () => {
  it("accepts the right password", async () => {
    const user = await newUser("a@example.com");
    expect(await authenticate("a@example.com", PASSWORD)).toEqual(user);
  });

  it("rejects a wrong password or unknown email", async () => {
    await newUser("a@example.com");
    expect(await authenticate("a@example.com", "wrong password!")).toBeNull();
    expect(await authenticate("nobody@example.com", PASSWORD)).toBeNull();
  });

  it("rejects a deactivated user", async () => {
    const admin = await newUser("admin@example.com");
    const user = await newUser("a@example.com");
    await updateUser(admin.id, user.id, { isActive: false });

    expect(await authenticate("a@example.com", PASSWORD)).toBeNull();
    expect(await findActiveUser(user.id)).toBeNull();
  });
});

describe("updateUser", () => {
  it("won't let you deactivate yourself", async () => {
    const admin = await newUser("admin@example.com");
    await expectServiceError(updateUser(admin.id, admin.id, { isActive: false }), 400);
  });

  it("logs a deactivated user out everywhere and leaves others alone", async () => {
    const admin = await newUser("admin@example.com");
    const user = await newUser("a@example.com");
    await addSession("admin-1", admin.id);
    await addSession("user-1", user.id);
    await addSession("user-2", user.id);

    await updateUser(admin.id, user.id, { isActive: false });
    expect(await sessionIds()).toEqual(["admin-1"]);
  });

  it("returns 404 for a missing user and 409 for a taken email", async () => {
    const admin = await newUser("admin@example.com");
    await newUser("a@example.com");
    await expectServiceError(updateUser(admin.id, 999, { firstName: "X" }), 404);
    await expectServiceError(updateUser(admin.id, admin.id, { email: "a@example.com" }), 409);
  });
});

describe("resetPassword", () => {
  it("sets the new password and logs the user out everywhere", async () => {
    const admin = await newUser("admin@example.com");
    const user = await newUser("a@example.com");
    await addSession("user-1", user.id);

    await resetPassword(admin.id, user.id, "a brand new passphrase");

    expect(await authenticate("a@example.com", PASSWORD)).toBeNull();
    expect(await authenticate("a@example.com", "a brand new passphrase")).not.toBeNull();
    expect(await sessionIds()).toEqual([]);
  });
});

describe("changeOwnPassword", () => {
  it("requires the current password", async () => {
    const user = await newUser("a@example.com");
    await expectServiceError(
      changeOwnPassword(user.id, "s1", { currentPassword: "nope", newPassword: "another passphrase" }),
      400,
    );
  });

  it("keeps the current session and ends the others", async () => {
    const user = await newUser("a@example.com");
    await addSession("current", user.id);
    await addSession("other-device", user.id);

    await changeOwnPassword(user.id, "current", {
      currentPassword: PASSWORD,
      newPassword: "another passphrase",
    });

    expect(await sessionIds()).toEqual(["current"]);
    expect(await authenticate("a@example.com", "another passphrase")).not.toBeNull();
  });
});
