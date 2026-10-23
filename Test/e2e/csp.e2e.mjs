import { BASE_URL, check, launch } from "./support.mjs";

const browser = await launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(BASE_URL, { waitUntil: "networkidle" });
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";
  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
  check("production CSP requires an unpredictable nonce", Boolean(nonce && nonce.length >= 32 && csp.includes("'strict-dynamic'")));
  check("production CSP has no eval or inline-script exceptions", !/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp));
  check("nonce HTML cannot be shared-cached", /no-store/.test(headers["cache-control"] ?? ""));
  const next = await fetch(BASE_URL, { headers: { "x-nonce": "attacker-nonce", "content-security-policy": "script-src 'unsafe-inline'" } });
  const secondNonce = /'nonce-([^']+)'/.exec(next.headers.get("content-security-policy") ?? "")?.[1];
  check("nonces change across requests and overwrite caller input", Boolean(secondNonce && secondNonce !== nonce && secondNonce !== "attacker-nonce"));
  check("framework and root scripts carry the rendering nonce", await page.evaluate((expected) => [...document.scripts].filter((script) => !script.type || ["module", "text/javascript"].includes(script.type)).every((script) => script.nonce === expected), nonce));
  check("root bootstrap script executes under CSP", await page.locator("html.js").count() === 1);
  await page.locator("#contact").getByRole("button", { name: /Start a Conversation/ }).click();
  check("client hydration and form validation work", await page.locator("#contact .contact-field__error, #contact [role=alert], #contact [aria-invalid=true]").count() > 0);
  check("no runtime errors with production CSP", errors.length === 0);
  // Inject into the actual HTML response. DevTools evaluation itself bypasses document CSP.
  const probe = await context.newPage();
  await probe.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => window.__cspViolations.push(event.effectiveDirective));
  });
  await probe.route(BASE_URL + "/", async (route) => {
    const original = await route.fetch();
    const html = (await original.text()).replace("</body>", '<script>window.__cspProbe = true</script><img src="data:image/png;base64,AAAA" onerror="window.__cspProbe = true"></body>');
    await route.fulfill({ response: original, body: html });
  });
  await probe.goto(BASE_URL, { waitUntil: "networkidle" });
  check("browser blocks injected scripts and event handlers", await probe.evaluate(() => window.__cspProbe !== true && window.__cspViolations.some((directive) => directive.startsWith("script-src"))));
} finally { await browser.close(); }
