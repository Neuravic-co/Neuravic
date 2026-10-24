export type ServiceName = "auth" | "portal" | "leads" | "admin" | "files" | "worker";

/** First matching rule wins, so the specific paths come before the general ones. */
const routes: [RegExp, ServiceName][] = [
  [/^\/\.well-known\//, "auth"],
  [/^\/api\/v1\/(auth|me|token)(\/|$)/, "auth"],
  [/^\/api\/v1\/admin\/privacy-requests(\/|$)/, "auth"],
  [/^\/api\/v1\/admin(\/|$)/, "admin"],
  [/^\/api\/v1\/(leads|content)(\/|$)/, "leads"],
  [/^\/api\/v1\/requests\/[^/]+\/files(\/|$)/, "files"],
  [/^\/api\/v1\/files(\/|$)/, "files"],
  [/^\/api\/v1\/(orgs|projects|requests)(\/|$)/, "portal"],
  [/^\/api\/v1\/dev(\/|$)/, "worker"],
];

/** The service that owns a path, or undefined when no service does. */
export function resolveService(pathname: string): ServiceName | undefined {
  return routes.find(([pattern]) => pattern.test(pathname))?.[1];
}
