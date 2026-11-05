export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "/api/v1").replace(/\/$/, "");

export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function api<T>(path: string, { method = "GET", body, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Could not reach the server. Check your connection and try again.");
  }

  const text = await response.text();
  const data = text ? parseJson(text) : undefined;
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
