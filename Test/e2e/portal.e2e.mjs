// Client portal, end to end with two people: a staff admin creates an organisation, the invited owner submits a
// request, the admin approves it. Also covers sign-in validation, bad links, enquiries inbox and sign-out.
import { writeFileSync } from "node:fs";
import {
  ADMIN_EMAIL, API_URL, BASE_URL, SCREENSHOTS, check, logSize, run, signInThroughUi, waitForLoginToken, watchErrors,
} from "./support.mjs";

await run("Client portal", async (browser, errors) => {
  const stamp = Date.now();
  const ownerEmail = `owner-${stamp}@e2e.dev`;
  const orgName = `E2E Corp ${stamp}`;
  const enquirer = `E2E Enquirer ${stamp}`;

  // An enquiry for the inbox part of the test. Sent from a unique address so the per-address rate limit never interferes.
  const lead = await fetch(`${API_URL}/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": `10.${stamp % 250}.${(stamp >> 8) % 250}.7` },
    body: JSON.stringify({ name: enquirer, email: `enq-${stamp}@example.com`, message: `Please help us with access approvals ${stamp}.`, consent: true }),
  });
  check("test enquiry accepted by the API", lead.status === 202, `status ${lead.status}`);

  const admin = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  watchErrors(admin, "admin", errors);

  // Signed out
  await admin.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  await admin.screenshot({ path: `${SCREENSHOTS}/portal-signin.png` });
  await admin.getByLabel("Email").fill("not-an-email");
  await admin.getByRole("button", { name: /Email me a link/ }).click();
  check("sign-in validates the email", (await admin.locator(".portal-field__error").textContent()).includes("valid email"));
  await admin.goto(`${BASE_URL}/portal/verify?token=bogus-token-bogus-token-bogus`);
  await admin.getByRole("heading", { name: /no longer works/ }).waitFor();
  check("an invalid sign-in link is explained", true);

  // Staff admin signs in
  await signInThroughUi(admin, ADMIN_EMAIL);

  // Staff land on the workspace: four cards, each a link to a full page
  const cards = await admin.getByRole("navigation", { name: "Workspace sections" }).getByRole("link").allTextContents();
  check("staff land on the four workspace cards", cards.length === 4 && /PIMS/.test(cards[0]) && /Calendar/.test(cards[1]) && /Tools/.test(cards[2]) && /IT & Support/.test(cards[3]), cards.join(" | "));

  await admin.getByRole("link", { name: /PIMS/ }).click();
  await admin.waitForURL(/\/portal\/pims$/);
  const pimsTabs = await admin.getByRole("tab").allTextContents();
  check("PIMS has five tabs on the left", pimsTabs.join(",") === "Personal info,Team,Papers,HR,Contract", pimsTabs.join(", "));
  check("PIMS shows the signed-in email", await admin.getByRole("tabpanel").getByText(ADMIN_EMAIL).first().isVisible());
  await admin.getByRole("tab", { name: "Papers" }).click();
  await admin.getByRole("heading", { name: "Papers" }).waitFor();
  check("PIMS papers tab opens", true);

  await admin.goto(`${BASE_URL}/portal/calendar`, { waitUntil: "networkidle" });
  const calendarTabs = await admin.getByRole("tab").allTextContents();
  check("calendar has holidays and four leave tabs", calendarTabs.join(",") === "Public holidays,Annual leave,Sick leave,Maternity leave,Forced leave", calendarTabs.join(", "));
  check("calendar shows a month grid", (await admin.getByRole("cell").count()) >= 28);
  await admin.getByRole("tab", { name: "Annual leave" }).click();
  await admin.getByText(/days left/).waitFor();
  check("annual leave shows a balance", true);

  await admin.goto(`${BASE_URL}/portal/support`, { waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Create ticket by email" }).click();
  check("support form asks for a subject and details", (await admin.locator(".portal-field__error").count()) === 2);

  await admin.goto(`${BASE_URL}/portal/tools`, { waitUntil: "networkidle" });
  const allTools = await admin.locator(".ws-tool").count();
  await admin.getByRole("button", { name: "Open source" }).click();
  const openTools = await admin.locator(".ws-tool").count();
  check("the open source filter narrows the tools", openTools > 0 && openTools < allTools, `${openTools} of ${allTools}`);
  await admin.getByRole("button", { name: "All", exact: true }).click();
  await admin.getByLabel("Search tools").fill("grafana");
  check("search finds a tool", (await admin.locator(".ws-tool").count()) === 1);
  await admin.getByLabel("Search tools").fill("");
  await admin.screenshot({ path: `${SCREENSHOTS}/portal-workspace-tools.png` });
  await admin.getByRole("link", { name: /^Client portal/ }).click();
  await admin.waitForURL(/\/portal\/clients/);
  await admin.getByRole("button", { name: "Organisations" }).waitFor();
  const tabs = await admin.locator(".portal-tabs button").allTextContents();
  check("staff admin sees staff tabs", tabs.includes("Organisations") && tabs.includes("Enquiries"), tabs.join(", "));

  // Organisation with an invited owner
  await admin.getByRole("button", { name: "Organisations" }).click();
  await admin.getByRole("button", { name: "New organisation" }).click();
  await admin.getByLabel("Organisation name").fill(orgName);
  await admin.getByLabel(/First owner/).fill(ownerEmail);
  const afterOrg = logSize();
  await admin.getByRole("button", { name: "Create organisation" }).click();
  await admin.locator(".portal-list").getByText(orgName).waitFor();
  check("organisation created", true);
  await admin.screenshot({ path: `${SCREENSHOTS}/portal-organisations.png` });
  await admin.locator(".portal-list").getByRole("button", { name: new RegExp(orgName) }).click();

  // Project
  await admin.getByRole("button", { name: "New project" }).click();
  await admin.getByLabel("Project name").fill("Dubai access");
  await admin.getByLabel(/Description/).fill("Badge and door access for contractors.");
  await admin.getByRole("button", { name: "Create project" }).click();
  await admin.getByRole("button", { name: /Dubai access/ }).click();
  await admin.getByRole("heading", { name: "Dubai access" }).waitFor();
  await admin.getByText("No requests here").waitFor();
  check("new project has no requests", true);

  // The invited owner signs in from the invitation email and submits a request
  const owner = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  watchErrors(owner, "owner", errors);
  await owner.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  await owner.getByLabel("Email").fill(ownerEmail);
  await owner.getByRole("button", { name: /Email me a link/ }).click();
  await owner.getByRole("heading", { name: /Check your inbox/ }).waitFor();
  const token = await waitForLoginToken(ownerEmail, afterOrg);
  await owner.goto(`${BASE_URL}/portal/verify?token=${encodeURIComponent(token)}`);
  await owner.getByRole("button", { name: "Sign out" }).waitFor({ timeout: 15000 });
  const ownerTabs = await owner.locator(".portal-tabs button").allTextContents();
  check("a client owner sees only the organisation tabs", ownerTabs.join(",") === "Projects,Requests,Activity,Members", ownerTabs.join(", "));

  await owner.getByRole("button", { name: /Dubai access/ }).click();
  await owner.getByRole("button", { name: "New request" }).click();
  await owner.getByLabel("Title").fill("Badge for contractor");
  await owner.getByLabel("Details").fill("Needs level 2 access to the site for two weeks.");
  await owner.getByRole("button", { name: "Submit request" }).click();
  await owner.getByRole("heading", { name: "Badge for contractor" }).waitFor();
  await owner.getByText(/someone else needs to approve/).waitFor();
  check("requester cannot approve their own request", true);

  await owner.getByLabel("Add a comment").fill("Please prioritise this one.");
  await owner.getByRole("button", { name: "Post comment" }).click();
  await owner.getByText("Please prioritise this one.").waitFor();
  check("comment posted", true);

  writeFileSync(`${SCREENSHOTS}/note.txt`, "hello portal");
  await owner.locator('input[type="file"]').setInputFiles(`${SCREENSHOTS}/note.txt`);
  await owner.waitForFunction(() => document.querySelector('[role="alert"]') || document.querySelector(".portal-files li"));
  const uploaded = (await owner.locator(".portal-files li").count()) === 1;
  const unavailable = /not configured/.test((await owner.getByRole("alert").first().textContent().catch(() => "")) ?? "");
  check("file upload works, or reports clearly that storage is not configured", uploaded || unavailable);
  await owner.screenshot({ path: `${SCREENSHOTS}/portal-request-owner.png`, fullPage: true });

  // The admin approves from the queue
  await admin.getByRole("button", { name: "Requests" }).click();
  await admin.getByRole("button", { name: /Badge for contractor/ }).click();
  await admin.getByLabel(/Your decision/).fill("Approved for two weeks.");
  await admin.getByRole("button", { name: "Approve" }).click();
  await admin.getByRole("button", { name: "Mark as completed" }).waitFor();
  check("request approved and ready to complete", true);
  await admin.screenshot({ path: `${SCREENSHOTS}/portal-request-admin.png`, fullPage: true });

  await admin.getByRole("button", { name: "Activity" }).click();
  await admin.getByText(/approved a request/).first().waitFor();
  check("activity feed records the approval", true);
  await admin.getByRole("button", { name: "Members" }).click();
  await admin.locator(".portal-list").getByText(ownerEmail).waitFor();
  check("members list shows the invited owner", true);

  // Enquiries inbox
  await admin.getByRole("button", { name: "Enquiries" }).click();
  await admin.getByRole("button", { name: new RegExp(enquirer) }).click();
  await admin.getByLabel("Internal note").fill("Called and booked a discovery call.");
  await admin.getByRole("button", { name: "Add note" }).click();
  await admin.getByText("Called and booked a discovery call.").waitFor();
  check("enquiry note saved", true);
  await admin.screenshot({ path: `${SCREENSHOTS}/portal-enquiries.png`, fullPage: true });

  await admin.getByRole("button", { name: "Sign out" }).click();
  await admin.getByRole("heading", { name: /Sign in to your portal/ }).waitFor();
  check("sign out returns to the sign-in screen", true);

  const mobile = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  await mobile.goto(`${BASE_URL}/portal`, { waitUntil: "networkidle" });
  check("no horizontal scrolling on mobile", !(await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
});
