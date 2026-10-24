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
/** Inspect the underlying database error, not a wrapper that may embed user-supplied query parameters. */
function databaseMessage(error: unknown): string {
  let current = error;
  for (let depth = 0; current && depth < 8; depth += 1) {
    const cause = (current as { cause?: unknown }).cause;
    if (!cause) break;
    current = cause;
  }
  return String((current as Error | null)?.message ?? "");
}

export function isDatabaseGuard(error: unknown, marker: string): boolean {
  return databaseMessage(error).includes(marker);
}

export function isUniqueViolation(error: unknown): boolean {
  return /Duplicate entry/i.test(databaseMessage(error));
}

export const tooManyRequests = (message = "Too many requests, try again later") =>
  new AppError(429, "rate_limited", message);
