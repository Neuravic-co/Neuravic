/**
 * Server-side proxy from the website to the Neuravic API (NBE).
 *
 * The browser only ever talks to its own domain, so the login cookie stays first-party.
 * The proxy also forwards the visitor's real address, signed with a shared secret, because the API
 * would otherwise see this server's address for every visitor and rate-limit them all together.
 */

/** Headers that describe one connection and must not be copied to the next one. */
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  // Set by this proxy, never by the caller.
  "x-client-ip",
  "x-proxy-secret",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
];

/** Headers fetch() has already decoded, so they no longer describe the body. */
const DECODED_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection"];

function problem(status: number, code: string, title: string): Response {
  return Response.json({ type: "about:blank", title, status, code }, { status, headers: { "content-type": "application/problem+json" } });
}

function visitorAddress(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || undefined;
}

export async function proxyToApi(request: Request): Promise<Response> {
  const origin = process.env.API_ORIGIN?.replace(/\/$/, "");
  if (!origin) return problem(503, "api_unavailable", "The API is not configured");

  const incoming = new URL(request.url);
  const target = `${origin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  const visitor = visitorAddress(request);
  if (visitor) headers.set("x-client-ip", visitor);
  if (process.env.API_PROXY_SECRET) headers.set("x-proxy-secret", process.env.API_PROXY_SECRET);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Required by Node when streaming a request body.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    } as RequestInit);
  } catch {
    return problem(502, "api_unreachable", "Could not reach the API");
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of DECODED_RESPONSE_HEADERS) responseHeaders.delete(name);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
