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

// Drizzle wraps driver errors; the pg error (with its code) is on .cause.
function hasPgCode(error: unknown, code: string): boolean {
  let e: unknown = error;
  while (e && typeof e === "object") {
    if ((e as { code?: unknown }).code === code) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export const isUniqueViolation = (error: unknown) => hasPgCode(error, "23505");

// Raised when deleting a row that other rows still point at.
export const isForeignKeyViolation = (error: unknown) => hasPgCode(error, "23503");
