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

// Postgres error code for a unique constraint violation.
export function isUniqueViolation(error: unknown): boolean {
  let e: unknown = error;
  // Drizzle wraps driver errors; the pg error is on .cause.
  while (e && typeof e === "object") {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
