// Automated WCAG 2.1 A/AA scan (axe-core) of the home page, the contact form's error state, the mobile menu
// and the main portal screens. Fails on any violation.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BASE_URL, apiSession, check, run, watchErrors } from "./support.mjs";

const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function scan(page, name) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(() =>
    // eslint-disable-next-line no-undef
    axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] }),
  );
  const summary = result.violations
    .map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length}] e.g. ${v.nodes[0].target.join(" ")}`)
    .join("\n    ");
  check(`${name}: no accessibility violations`, result.violations.length === 0, `\n    ${summary}`);
}

await run("Accessibility", async (browser, errors) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  watchErrors(page, "a11y", errors);

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  // Scroll-reveal animations fade content in; measure the settled state.
  await page.addStyleTag({ content: "[data-reveal]{opacity:1!important;transform:none!important;transition:none!important}" });
  await page.waitForTimeout(1200);
  await scan(page, "home page");

  await page.locator("#contact").getByRole("button", { name: /Start a Conversation/ }).click();
  await scan(page, "contact form with errors");

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 800 });
  await mobile.goto(BASE_URL, { waitUntil: "networkidle" });
  await mobile.getByRole("button", { name: "Open navigation" }).click();
  await mobile.waitForTimeout(600);
  await scan(mobile, "mobile menu");

  await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  await scan(page, "portal sign-in");

  const cookie = await apiSession();
  await context.addCookies([cookie]);
  await page.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sign out" }).waitFor();
  await scan(page, "portal workspace (home)");
  for (const section of ["pims", "calendar", "support", "tools"]) {
    await page.goto(`${BASE_URL}/portal/${section}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor();
    const tabs = await page.getByRole("tab").allTextContents();
    if (tabs.length === 0) await scan(page, `portal ${section}`);
    for (const label of tabs) {
      await page.getByRole("tab", { name: label, exact: true }).click();
      await scan(page, `portal ${section} / ${label}`);
    }
  }
  await page.goto(`${BASE_URL}/portal/clients`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Enquiries" }).waitFor();
  await scan(page, "portal (staff view)");

  await page.getByRole("button", { name: "Enquiries" }).click();
  await page.locator(".portal-row").first().waitFor();
  await page.locator(".portal-row").first().click();
  await page.waitForTimeout(600);
  await scan(page, "portal enquiries");
});
