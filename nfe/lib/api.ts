/**
 * Browser client for the Neuravic API (Server).
 * Sends the session cookie, parses problem+json errors and returns typed JSON.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** First message for a field, if the API reported one. */
  fieldMessage(path: string): string | undefined {
    return this.fieldErrors.find((error) => error.path === path)?.message;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body. Ignored when `rawBody` is set. */
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const isAbsolute = /^https?:\/\//.test(API_BASE);
  const target = isAbsolute ? url.toString() : `${url.pathname}${url.search}`;

  const headers: Record<string, string> = { accept: "application/json", ...options.headers };
  let body: BodyInit | undefined = options.rawBody;
  if (body === undefined && options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(target, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Could not reach the server. Check your connection and try again.");
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? safeJson(text) : undefined;

  if (!response.ok) {
    const problem = (data ?? {}) as { code?: string; title?: string; errors?: FieldError[] };
    throw new ApiError(
      response.status,
      problem.code ?? "error",
      problem.title ?? "Something went wrong",
      Array.isArray(problem.errors) ? problem.errors : [],
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
