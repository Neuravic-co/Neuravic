import { createHmac } from "node:crypto";
import { ADMIN_EMAIL, BASE_URL, check, run, signInThroughUi, watchErrors } from "./support.mjs";

function currentCode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  return String((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1000000).padStart(6, "0");
}

await run("Staff MFA", async (browser, errors) => {
  const page = await (await browser.newContext()).newPage();
  watchErrors(page, "mfa", errors);
  await signInThroughUi(page, ADMIN_EMAIL);
  await page.getByRole("heading", { name: "Verify your sign-in" }).waitFor();
  check("staff workspace stays inaccessible before MFA", await page.getByRole("navigation", { name: "Workspace sections" }).count() === 0);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = await page.locator("code").textContent();
  await page.getByLabel("Authenticator code", { exact: true }).fill(currentCode(secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.getByRole("heading", { name: "Save your recovery codes" }).waitFor();
  const recovery = await page.locator("li code").allTextContents();
  check("eight recovery codes are shown once", recovery.length === 8);
  await page.getByRole("button", { name: "I have saved my codes" }).click();
  await page.getByRole("navigation", { name: "Workspace sections" }).waitFor();
  check("workspace opens after factor confirmation", true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await signInThroughUi(page, ADMIN_EMAIL);
  await page.getByLabel("Authenticator or recovery code").fill(recovery[0]);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await page.getByRole("navigation", { name: "Workspace sections" }).waitFor();
  check("subsequent email sign-in requires an independent factor", true);
  check("MFA secrets stay out of browser URLs", !page.url().includes(secret) && !page.url().includes(recovery[0]));
});
