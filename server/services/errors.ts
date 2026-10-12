/**
 * An expected failure whose message is safe to show to the user.
 * Routes turn it into a JSON response with the given status.
 */
export class ServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

interface PgError {
  code: string;
  constraint?: string;
}

// Drizzle wraps driver errors; the pg error (with its code) is on .cause.
function findPgError(error: unknown, code: string): PgError | undefined {
  let e: unknown = error;
  while (e && typeof e === "object") {
    if ((e as { code?: unknown }).code === code) return e as PgError;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

const hasPgCode = (error: unknown, code: string) => findPgError(error, code) !== undefined;

/** The name of the unique constraint a write broke, if it broke one. */
export const violatedUniqueConstraint = (error: unknown) => findPgError(error, "23505")?.constraint;

export const isUniqueViolation = (error: unknown) => hasPgCode(error, "23505");

// Raised when deleting a row that other rows still point at.
export const isForeignKeyViolation = (error: unknown) => hasPgCode(error, "23503");

/**
 * Runs a write and turns constraint violations into messages staff can act on.
 * A foreign key violation means a referenced row is missing (on insert/update)
 * or the row is still referenced (on delete), so the caller words it.
 */
export async function write<T>(
  fn: () => Promise<T>,
  messages: { unique?: string | ((constraint: string | undefined) => string); foreignKey?: string },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (messages.unique && isUniqueViolation(error)) {
      const { unique } = messages;
      throw new ServiceError(409, typeof unique === "string" ? unique : unique(violatedUniqueConstraint(error)));
    }
    if (messages.foreignKey && isForeignKeyViolation(error)) throw new ServiceError(409, messages.foreignKey);
    throw error;
  }
}

export function notFound(row: unknown, what: string): asserts row {
  if (!row) throw new ServiceError(404, `${what} not found`);
}
