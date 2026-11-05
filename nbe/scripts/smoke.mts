const BASE = process.env.API_URL ?? "http://127.0.0.1:8787";
const API = `${BASE}/api/v1`;
const ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:5173";
const run = Date.now().toString(36);

let failed = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failed += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
}

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const isJson = (response.headers.get("content-type") ?? "").includes("json");
  return { status: response.status, data: (isJson ? await response.json() : await response.text()) as any };
}

const enquiry = (overrides: Record<string, unknown> = {}) => ({
  name: "Smoke Test",
  email: `smoke+${run}@example.com`,
  message: `Smoke test enquiry ${run}, please ignore this message.`,
  serviceInterest: ["software"],
  consent: true,
  ...overrides,
});

console.log(`Smoke test against ${API}`);

const health = await call("GET", "/health");
check("health is ok", health.status === 200 && health.data.status === "ok", health);

const version = await call("GET", "/version");
check("version is reported", version.status === 200 && typeof version.data.version === "string", version);

const first = await call("POST", "/leads", enquiry());
check("an enquiry is accepted", first.status === 202 && first.data.status === "received", first);

const again = await call("POST", "/leads", enquiry());
check("the same enquiry is not stored twice", again.status === 202 && again.data.id === first.data.id, again);

const invalid = await call("POST", "/leads", enquiry({ consent: false }));
check("missing consent is refused", invalid.status === 400, invalid);

const foreign = await fetch(`${API}/leads`, {
  method: "POST",
  headers: { origin: "https://evil.example", "content-type": "application/json" },
  body: JSON.stringify(enquiry()),
});
check("a foreign origin is refused", foreign.status === 403, foreign.status);

const mailbox = await fetch(`${API}/dev/mailbox`);
if (mailbox.ok) {
  await new Promise((done) => setTimeout(done, 1500));
  const { messages } = (await (await fetch(`${API}/dev/mailbox`)).json()) as { messages: { to: string }[] };
  check("the acknowledgement email is delivered", messages.some((message) => message.to === `smoke+${run}@example.com`));
}

console.log(failed === 0 ? "All checks passed" : `${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
