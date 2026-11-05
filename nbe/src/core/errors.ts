export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string) => new AppError(400, "bad_request", message);
export const unprocessable = (message: string) => new AppError(422, "unprocessable", message);
export const tooManyRequests = () => new AppError(429, "rate_limited", "Too many requests, try again later");
export const unavailable = (code: string, message: string) => new AppError(503, code, message);

export class DeliveryError extends Error {
  constructor(readonly code: string, readonly retryable = true) {
    super(code);
  }
}

export function requireDeliverySuccess(response: Response, provider: string): void {
  if (response.ok) return;
  const retryable = [408, 409, 429].includes(response.status) || response.status >= 500;
  throw new DeliveryError(`${provider}_http_${response.status}`, retryable);
}
