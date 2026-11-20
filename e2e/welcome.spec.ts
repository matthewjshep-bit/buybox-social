// Getting started, a question a screen (/welcome): what someone is (an
// agent, an investor, a lender, or shopping for a home), then a little about
// them. What they are is the chip beside their name, and what their homes
// are called: an investor's are deals; an agent's (and a lender's), listings.
import { expect, test } from "@playwright/test";
import { enterCode, enterListingYourself, throughWelcome } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);

test("an investor joins a step at a time, wears an Investor chip, and their listings are deals everywhere", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`ivy.investor.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await page.waitForURL("**/welcome**");

  // One question a screen: the first, what they are, with no step count yet.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What brings you to Porchcard?");
  const choices = page.getByRole("group", { name: "What brings you to Porchcard?" }).getByRole("button");
  await expect(choices).toHaveCount(4);
  await page.getByRole("button", { name: /^I'm an investor/ }).click();
  // Then their name, with how far along they are; Back goes back a step.
  await expect(page.getByText("Step 2 of 5")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's your full name?");
  const name = page.getByRole("form", { name: "What's your full name?" });
  // (A name is needed: Continue says so, and stays.)
  await name.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's your full name?");
  await name.getByLabel("Full name").fill("Ivy Investor");
  await name.getByRole("button", { name: "Continue" }).click();
  // An investor's company, no MLS ID.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's your company called?");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("form", { name: "What's your full name?" }).getByLabel("Full name")).toHaveValue("Ivy Investor");
  await page.getByRole("form", { name: "What's your full name?" }).getByRole("button", { name: "Continue" }).click();
  const company = page.getByRole("form", { name: "What's your company called?" });
  await company.getByLabel("Company").fill("Ivy Capital");
  await company.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a photo of you");
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("Step 5 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Plum" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL("**/dashboard");

  // Their own homes are deals: in the menu, on the page for them, and adding one.
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("link", { name: "Deals" }).click();
  await page.waitForURL("**/dashboard/listings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Deals");
  await page.getByRole("link", { name: "Add a deal" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Add a deal");
  const form = await enterListingYourself(page);
  await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
  await form.getByLabel("Street address").fill("9 Flip St");
  await form.getByLabel("City").fill("Tacoma");
  await form.getByLabel("ZIP").fill("98402");
  await form.getByLabel("Price", { exact: true }).fill("300000");
  await form.getByLabel("Beds").fill("3");
  await form.getByLabel("Baths").fill("1");
  await form.getByLabel("Sq ft", { exact: true }).fill("1200");
  await form.getByRole("button", { name: "Add deal" }).click();
  await page.waitForURL(/\/dashboard\/listings$/);

  // Their profile: an Investor chip, their company under their name, and Deals.
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(page.url()).pathname;
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(profile);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Ivy Investor");
  await expect(visitor.getByText("Investor", { exact: true })).toBeVisible();
  await expect(visitor.getByText("Ivy Capital")).toBeVisible();
  await expect(visitor.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /^Deals/ })).toBeVisible();
  await visitor.getByRole("list", { name: "Deals" }).getByRole("link").first().click();
  await visitor.waitForURL(/\/reel\?from=listings/);
  await expect(visitor.getByText(/Ivy's deals/).filter({ visible: true }).first()).toBeVisible();

  // Now a lender, on Edit profile: the chip changes, and deals are listings again.
  await page.goto("/people/me/edit");
  const you = page.getByRole("radiogroup", { name: "You are" });
  await expect(you.getByRole("radio", { name: "Investor" })).toHaveAttribute("aria-checked", "true");
  await you.getByRole("radio", { name: "Lender" }).click();
  await expect(you.getByRole("radio", { name: "Lender" })).toHaveAttribute("aria-checked", "true");
  await visitor.goto(profile);
  await expect(visitor.getByText("Lender", { exact: true })).toBeVisible();
  await expect(visitor.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /^Listings/ })).toBeVisible();
});

test("someone shopping for a home says so and their first name, and has no chip; a lender's is Lender", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(`sam.shopper.${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await page.waitForURL("**/welcome**");
  await page.getByRole("button", { name: /^I'm shopping for a home/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's your first name?");
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  const name = page.getByRole("form", { name: "What's your first name?" });
  await name.getByLabel("First name").fill("Sam");
  await name.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/people/me");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sam");
  for (const chip of ["Agent", "Investor", "Lender"]) await expect(page.getByText(chip, { exact: true })).toHaveCount(0);
  // Signing in again asks nothing.
  await page.goto("/login");
  await page.waitForURL((url) => url.pathname === "/");

  // A lender, from For agents: the pros first.
  const lender = await (await browser.newContext()).newPage();
  await lender.goto("/login?as=agent");
  await lender.getByLabel("Email").fill(`lee.lender.${Date.now()}@example.com`);
  await lender.getByRole("button", { name: "Continue" }).click();
  await enterCode(lender);
  await lender.waitForURL("**/welcome**");
  await expect(lender.getByRole("group", { name: "What brings you to Porchcard?" }).getByRole("button").first()).toHaveText(/^I'm an agent/);
  await throughWelcome(lender, "lender", { name: "Lee Lender", company: "Harbor Home Loans" });
  await lender.waitForURL("**/dashboard");
  await lender.goto("/people/me");
  await expect(lender.getByText("Lender", { exact: true })).toBeVisible();
});
