// Home page and contact form: content renders, validation works, an enquiry is stored and mobile layout holds.
import { BASE_URL, SCREENSHOTS, check, run, watchErrors } from "./support.mjs";

await run("Contact form", async (browser, errors) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  watchErrors(page, "home", errors);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  check("page title", (await page.title()).startsWith("Neuravic"));
  check("service list renders", (await page.locator(".service-row h3").count()) === 4);

  const form = page.locator("#contact");
  await form.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  await form.getByRole("button", { name: /Start a Conversation/ }).click();
  check("empty submit shows 5 field errors", (await page.locator(".contact-form__error").count()) === 5);
  const nameField = form.getByLabel("Name", { exact: true });
  check("error text is not part of the field label", (await nameField.count()) === 1);

  await nameField.fill("E2E");
  check("an error clears as soon as the field is edited", (await page.locator(".contact-form__error").count()) === 4);
  await form.getByLabel("Last name", { exact: true }).fill("Tester");

  const stamp = Date.now();
  await form.getByLabel("Email").fill(`e2e-${stamp}@example.com`);
  await form.getByLabel("Company").fill("Acme");
  await form.getByText("Software", { exact: true }).click();
  await form.getByLabel("Where does the operation break down?").fill(`Approvals take days and nobody sees status (${stamp}).`);
  await form.getByLabel(/I agree/).check();

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/leads") && r.request().method() === "POST"),
    form.getByRole("button", { name: /Start a Conversation/ }).click(),
  ]);
  check("first and last name are sent as one full name", JSON.parse(response.request().postData() ?? "{}").name === "E2E Tester");
  check("POST /leads is accepted", response.status() === 202, `status ${response.status()} (429 means the rate limit: restart the backend)`);
  await page.waitForSelector(".contact-form--sent");
  check("confirmation shown", /Message received/.test(await page.textContent(".contact-form--sent")));
  await page.screenshot({ path: `${SCREENSHOTS}/contact-sent.png` });

  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  watchErrors(mobile, "mobile", errors);
  await mobile.goto(BASE_URL, { waitUntil: "networkidle" });
  await mobile.locator("#contact").scrollIntoViewIfNeeded();
  await mobile.screenshot({ path: `${SCREENSHOTS}/contact-mobile.png` });
  check("no horizontal scrolling on mobile", !(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
});
