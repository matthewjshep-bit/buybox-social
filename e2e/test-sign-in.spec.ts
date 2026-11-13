import { expect, test, type Page } from "@playwright/test";
import { signInAgent } from "./helpers";

// While sign-in emails aren't set up, the test password (TEST_SIGN_IN_PASSWORD,
// set for these tests in playwright.config.ts) signs in as any email, no code:
// the account already there for it, or a new one.
const PASSWORD = "e2e-test-password";

async function testSignIn(page: Page, email: string, password = PASSWORD) {
  await page.getByRole("button", { name: "Testing? Sign in with the test password" }).click();
  const form = page.getByRole("form", { name: "Test sign-in" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Test password").fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
  return form;
}

test("the test password signs in as an account already there, or a new one, and Sign out switches", async ({
  browser,
}) => {
  const stamp = Date.now();
  // An agent who signed up the usual way, with a code.
  const agentEmail = `robin.${stamp}@example.com`;
  await (await signInAgent(browser, agentEmail, "Robin Vale")).context().close();

  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  // Out of the way until it's asked for.
  await expect(page.getByRole("form", { name: "Test sign-in" })).toHaveCount(0);

  // Not the password: not signed in.
  const form = await testSignIn(page, agentEmail, "not-the-password");
  await expect(form.getByRole("alert")).toHaveText("That isn't the test password.");
  await expect(page).toHaveURL(/\/login$/);

  // The password: the agent's own account, straight to their dashboard.
  await form.getByLabel("Test password").fill(PASSWORD);
  await form.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  // (Robin's face is the photo she added on signing up.)
  const me = page.getByRole("banner").getByRole("button", { name: "Your profile" });
  await expect(me.locator("img")).toBeVisible();

  // Sign out, then in as someone new: a new buyer's account, home.
  await me.click();
  await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await testSignIn(page, `casey.${stamp}@example.com`);
  await page.waitForURL((url) => url.pathname === "/");
  await me.click();
  await expect(page.getByRole("banner").getByText(`casey.${stamp}@example.com`)).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Dashboard" })).toHaveCount(0);
});
