/** An error that maps directly to an HTTP problem response. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);
export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this resource") =>
  new AppError(403, "forbidden", message);
export const notFound = (message = "Resource not found") =>
  new AppError(404, "not_found", message);
export const conflict = (message: string) => new AppError(409, "conflict", message);
export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, "unprocessable", message, details);
/** True when a database error (or the error that caused it) is a UNIQUE constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (/UNIQUE constraint failed/i.test(String((current as Error).message ?? current))) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export const tooManyRequests = (message = "Too many requests, try again later") =>
  new AppError(429, "rate_limited", message);
