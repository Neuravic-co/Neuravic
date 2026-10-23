/** Nonce policy shared by the Next and Vinext request pipeline. */
export function contentSecurityPolicy(nonce: string, development: boolean, apiBase?: string): string {
  const connect = ["'self'", "https://challenges.cloudflare.com", "https://use.typekit.net", "https://p.typekit.net"];
  if (apiBase && /^https?:\/\//.test(apiBase)) {
    const url = new URL(apiBase);
    if (url.protocol !== "https:" && !development) throw new Error("Public API must use HTTPS");
    connect.push(url.origin);
  }
  if (development) connect.push("ws:", "http://localhost:*", "http://127.0.0.1:*");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${development ? " 'unsafe-eval'" : ""}`,
    // The UI uses inline style properties; scripts remain nonce-only in production.
    "style-src 'self' 'unsafe-inline' https://use.typekit.net https://p.typekit.net",
    "font-src 'self' data: https://use.typekit.net https://p.typekit.net",
    "img-src 'self' data: blob: https://p.typekit.net",
    `connect-src ${connect.join(" ")}`,
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
