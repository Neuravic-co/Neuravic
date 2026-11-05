import { safeEqual } from "../../../src/core/crypto";
import { createApp } from "../../../src/app";
import { createContainer, type Container } from "../../../src/container";

export interface BackendOptions {
  waitUntil: (promise: Promise<unknown>) => void;
  env?: Record<string, string | undefined>;
  container?: Container;
}

const unavailable = () =>
  Response.json(
    { type: "about:blank", title: "This service is not available right now", status: 503, code: "service_unavailable" },
    { status: 503, headers: { "content-type": "application/problem+json", "cache-control": "no-store", "retry-after": "5" } },
  );

export function createBackend({ waitUntil, env = process.env, container }: BackendOptions) {
  let built: ReturnType<typeof createApp> | undefined;

  const app = () => (built ??= createApp(container ?? createContainer({ env, defer: waitUntil })));

  function withVisitorAddress(request: Request): Request {
    const secret = env.PROXY_SECRET ?? "";
    if (secret && safeEqual(request.headers.get("x-proxy-secret") ?? "", secret)) return request;
    const headers = new Headers(request.headers);
    headers.delete("x-client-ip");
    headers.delete("x-proxy-secret");
    const platformAddress = request.headers.get("x-real-ip")?.trim();
    if (secret && platformAddress) {
      headers.set("x-client-ip", platformAddress);
      headers.set("x-proxy-secret", secret);
    }
    return new Request(request, { headers });
  }

  async function fetch(request: Request): Promise<Response> {
    try {
      return await app().fetch(withVisitorAddress(request), env);
    } catch {
      return unavailable();
    }
  }

  return { fetch };
}
