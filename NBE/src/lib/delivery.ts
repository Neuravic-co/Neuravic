/** Safe error classification. Never persist a provider body, URL, key or recipient. */
export class DeliveryError extends Error {
  constructor(public readonly code: string, public readonly retryable = true) { super(code); }
}

export function requireDeliverySuccess(response: Response, provider: string): void {
  if (!response.ok) {
    const retryable = [408, 409, 429].includes(response.status) || response.status >= 500;
    throw new DeliveryError(`${provider}_http_${response.status}`, retryable);
  }
}
