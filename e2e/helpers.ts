import { expect, type Browser, type Page } from "@playwright/test";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";

export async function signInAgent(browser: Browser, email: string, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/welcome");
  await page.getByRole("radio", { name: /I'm an agent/ }).check();
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/dashboard/profile");
  await expect(page.getByLabel("Full name")).toHaveValue(name);
  await page.getByLabel("Brokerage").fill("Harbor & Pine Realty");
  await page.getByRole("button", { name: "Merlot" }).click();
  await page.getByLabel("Your photo").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from(PNG_1PX, "base64"),
  });
  await expect(page.getByRole("img", { name })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

export async function createShare(page: Page, addresses: string[]) {
  await page.goto("/dashboard/new");
  for (const address of addresses) {
    await page.getByRole("button", { name: new RegExp(address) }).click();
  }
  await page.getByLabel(/Client's first name/).fill("Jamie");
  await page.getByLabel(/Personal note/).fill("This one has the yard you mentioned.");
  await page.getByRole("button", { name: /Create link/ }).click();
  await page.waitForURL("**/dashboard/shares/*");
  const url = await page.getByLabel("Your link is ready").inputValue();
  return { url, dashboardUrl: page.url() };
}

export async function signUpBuyer(browser: Browser, email: string, name: string) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/welcome");
  await page.getByRole("radio", { name: /I'm buying a home/ }).check();
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  return page;
}
