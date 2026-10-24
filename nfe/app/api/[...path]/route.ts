import { proxyToApi } from "@/lib/api-proxy";

// Always run on request: these are live API calls and must never be cached or prerendered.
export const dynamic = "force-dynamic";

export const GET = proxyToApi;
export const HEAD = proxyToApi;
export const POST = proxyToApi;
export const PUT = proxyToApi;
export const PATCH = proxyToApi;
export const DELETE = proxyToApi;
export const OPTIONS = proxyToApi;
