import { app, maintenance } from "../src/vercel";

export default {
  fetch(request: Request): Response | Promise<Response> {
    if (new URL(request.url).pathname === "/internal/maintenance") return maintenance(request);
    return app.fetch(request);
  },
};
