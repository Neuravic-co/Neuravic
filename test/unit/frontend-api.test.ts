import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { it } from "node:test";

const clientUrl = new URL("../../nfe/lib/api.ts", import.meta.url).href;
for (const [setting, target] of [
  [undefined, "/api/v1/leads"],
  ["", "/api/v1/leads"],
  ["  ", "/api/v1/leads"],
  ["https://api.example.com/api/v1/", "https://api.example.com/api/v1/leads"],
] as const) {
  it(`routes browser requests correctly with API base ${JSON.stringify(setting) ?? "unset"}`, () => {
    const env = { ...process.env };
    if (setting === undefined) delete env.NEXT_PUBLIC_API_BASE_URL;
    else env.NEXT_PUBLIC_API_BASE_URL = setting;
    // Each process imports the client with a fresh environment, just as a new build does.
    const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      const { api } = await import(${JSON.stringify(clientUrl)});
      globalThis.fetch = async (url) => {
        process.stdout.write(String(url));
        return Response.json({ id: 'test-id', status: 'received' });
      };
      await api('/leads', { method: 'POST', body: {} });
    `], { env, encoding: "utf8", windowsHide: true });
    assert.equal(output, target);
  });
}
