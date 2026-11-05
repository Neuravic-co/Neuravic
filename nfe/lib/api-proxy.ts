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
  "x-client-ip",
  "x-proxy-secret",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "authorization",
];

const DECODED_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection"];

function problem(status: number, code: string, title: string): Response {
  return Response.json({ type: "about:blank", title, status, code }, { status, headers: {
    "content-type": "application/problem+json", "cache-control": "no-store",
  } });
}

function visitorAddress(request: Request): string | undefined {
  if (process.env.TRUST_PROXY_HEADERS === "true") return request.headers.get("x-real-ip")?.trim() || undefined;
  return undefined;
}

export async function proxyToApi(request: Request): Promise<Response> {
  const origin = process.env.API_ORIGIN?.replace(/\/$/, "");
  if (!origin) return problem(503, "api_unavailable", "The API is not configured");
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_INSECURE_API_ORIGIN === "true")))) {
      return problem(503, "api_unavailable", "The API configuration is invalid");
    }
  } catch { return problem(503, "api_unavailable", "The API configuration is invalid"); }

  const incoming = new URL(request.url);
  const target = `${origin}${incoming.pathname}${incoming.search}`;

  const headers = new Headers(request.headers);
  for (const name of (request.headers.get("connection") ?? "").split(",")) {
    if (/^[a-z0-9-]+$/i.test(name.trim())) headers.delete(name.trim());
  }
  for (const name of HOP_BY_HOP) headers.delete(name);
  for (const name of ["origin", "referer"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
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
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(25_000),
    } as RequestInit);
  } catch {
    return problem(502, "api_unreachable", "Could not reach the API");
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const name of DECODED_RESPONSE_HEADERS) responseHeaders.delete(name);
  if (!upstream.ok || responseHeaders.has("set-cookie") || !responseHeaders.has("cache-control")) responseHeaders.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
