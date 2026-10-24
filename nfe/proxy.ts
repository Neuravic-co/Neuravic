import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "./lib/csp";

export function proxy(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", process.env.NEXT_PUBLIC_API_BASE_URL);
  const headers = new Headers(request.headers);
  // Overwrite caller-supplied values; the rendering nonce belongs to this request.
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  // A nonce-bearing HTML document must not be reused by a shared cache or another visitor.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/((?!api/|_next/|assets/|favicon.ico).*)"] };
