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
