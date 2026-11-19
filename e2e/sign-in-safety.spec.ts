import { expect, test, type Page } from "@playwright/test";
import { createShare, enterCode, pastNameStep, signInAgent, signUpBuyer } from "./helpers";

// Signing in, kept safe and kept simple: typing someone else's email on the
// agents' form changes nothing of theirs; a page that takes an account brings
// you back to it once you're in; and a new account from the sign-in page is
// asked a first name, once.

const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const HALVARD = "10421 Halvard Way NE"; // SAMPLE-1005

// The sign-in page's two steps: an email, then the code.
async function emailAndCode(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
}

test("someone else typing your email on the agents' form never makes your account an agent's", async ({ browser }) => {
  const stamp = Date.now();
  const email = `vic.${stamp}@example.com`;
  await (await signUpBuyer(browser, email, "Vic")).context().close();

  // A stranger, in a browser of their own: "Start free" with Vic's email. The
  // code goes to Vic, so that's as far as they get.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto("/login?as=agent");
  await stranger.getByLabel("Email").fill(email);
  await stranger.getByRole("button", { name: "Continue" }).click();
  await expect(stranger.getByLabel("Code", { exact: true })).toBeVisible();
  // The same, with the email of someone who hasn't signed up yet.
  const newcomer = `nia.${stamp}@example.com`;
  await stranger.getByRole("button", { name: "Use a different email" }).click();
  await stranger.getByLabel("Email").fill(newcomer);
  await stranger.getByRole("button", { name: "Continue" }).click();
  await expect(stranger.getByLabel("Code", { exact: true })).toBeVisible();
  await stranger.context().close();

  // Vic signs in the ordinary way: still a buyer. No Dashboard, and its
  // address sends him home.
  const vic = await (await browser.newContext(DESKTOP)).newPage();
  await vic.goto("/login");
  await emailAndCode(vic, email);
  await vic.waitForURL((url) => url.pathname === "/");
  await expect(vic.getByRole("banner").getByRole("button", { name: "Account menu" })).toBeVisible();
  await expect(vic.getByRole("banner").getByRole("link", { name: "Clients", exact: true })).toHaveCount(0);
  await vic.goto("/dashboard");
  await expect(vic).toHaveURL(/localhost:\d+\/$/);

  // Nia signs up minutes later, on the ordinary form: a buyer too. What the
  // stranger typed for her counted for nothing.
  const nia = await (await browser.newContext(DESKTOP)).newPage();
  await nia.goto("/login");
  await emailAndCode(nia, newcomer);
  await pastNameStep(nia, "Nia");
  await nia.waitForURL((url) => url.pathname === "/");
  await expect(nia.getByRole("banner").getByRole("link", { name: "Clients", exact: true })).toHaveCount(0);
  await nia.goto("/dashboard");
  await expect(nia).toHaveURL(/localhost:\d+\/$/);

  // Vic himself, on the agents' form with his own code: that is his to choose.
  await vic.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
  await vic.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await vic.waitForURL("**/login");
  await vic.goto("/login?as=agent");
  await emailAndCode(vic, email);
  await vic.waitForURL(/\/dashboard/);
});

test("signed out at a page that takes an account, signing in lands on that page", async ({ browser }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  // An agent with a client, whose page she's kept the address of.
  const agentEmail = `tess.${stamp}@example.com`;
  const agent = await signInAgent(browser, agentEmail, "Tess Marlow");
  await createShare(agent, [HALVARD], ["Jamie"]);
  await agent.goto("/dashboard");
  const clientPage = (await agent.locator('a[href^="/dashboard/clients/"]').first().getAttribute("href"))!;
  await agent.context().close();

  // Signed out, it asks her to sign in, and remembers where she was going.
  const tess = await (await browser.newContext()).newPage();
  await tess.goto(clientPage);
  await expect(tess).toHaveURL(`/login?next=${encodeURIComponent(clientPage)}`);
  await emailAndCode(tess, agentEmail);
  await tess.waitForURL((url) => url.pathname === clientPage);
  await expect(tess.getByRole("heading", { level: 1 })).toContainText("Jamie");

  // A home someone was about to send, by someone new: sign in, their first
  // name, and the home is still there, picked.
  const sender = await (await browser.newContext()).newPage();
  await sender.goto("/send?home=SAMPLE-1005");
  await expect(sender).toHaveURL(`/login?next=${encodeURIComponent("/send?home=SAMPLE-1005")}`);
  await emailAndCode(sender, `sol.${stamp}@example.com`);
  await pastNameStep(sender, "Sol");
  await expect(sender).toHaveURL("/send?home=SAMPLE-1005");
  await expect(sender.getByRole("heading", { level: 1 })).toHaveText("Send this home");
  await expect(sender.getByRole("main")).toContainText(HALVARD);

  // Your own profile's short address, and the admin: the same.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/people/me?show=saved");
  await expect(anon).toHaveURL(`/login?next=${encodeURIComponent("/people/me?show=saved")}`);
  await anon.goto("/admin/people");
  await expect(anon).toHaveURL(`/login?next=${encodeURIComponent("/admin/people")}`);
  // Never to anywhere a browser claims it was going: the address is the one asked for.
  const forged = await anon.request.get("/dashboard", {
    maxRedirects: 0,
    headers: { "x-path": "/admin?from=elsewhere" },
  });
  expect(forged.status()).toBe(307);
  expect(forged.headers().location).toBe("/login?next=%2Fdashboard");
});

test("signing up on the sign-in page with only an email asks a first name, once", async ({ browser }) => {
  const email = `nora.${Date.now()}@example.com`;
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/login");
  await emailAndCode(page, email);

  // One thing on the page: the name, Continue, and a quiet way past it.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What's your first name?");
  const step = page.getByRole("form", { name: "Your name" });
  const name = step.getByLabel("First name");
  await expect(name).toBeFocused();
  await expect(step.getByRole("textbox")).toHaveCount(1);
  const skip = (await step.getByRole("link", { name: "Skip" }).boundingBox())!;
  expect(skip.height).toBeGreaterThanOrEqual(44);
  // [P] Never an email for a name.
  await name.fill(email);
  await step.getByRole("button", { name: "Continue" }).click();
  await expect(step.getByRole("alert")).toHaveText("Type a first name, not an email");
  await name.fill("Nora");
  await step.getByRole("button", { name: "Continue" }).click();

  // Home, and her card says who she is.
  await page.waitForURL((url) => url.pathname === "/");
  const card = page.getByRole("region", { name: "You", exact: true });
  await expect(card.getByRole("link", { name: "Nora", exact: true })).toBeVisible();
  await expect(card).not.toContainText(email);

  // Asked once: the next time she signs in, it's straight home.
  await page.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await emailAndCode(page, email);
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByRole("form", { name: "Your name" })).toHaveCount(0);

  // Someone who'd rather not say goes on without one, and is asked the next
  // time they sign in, not on every page in between.
  const quiet = await (await browser.newContext(DESKTOP)).newPage();
  await quiet.goto("/login?next=%2Fsearch");
  await emailAndCode(quiet, `quiet.${Date.now()}@example.com`);
  await quiet.getByRole("form", { name: "Your name" }).getByRole("link", { name: "Skip" }).click();
  await quiet.waitForURL((url) => url.pathname === "/search");
  await quiet.goto("/");
  await expect(quiet).toHaveURL(/localhost:\d+\/$/);
  await expect(quiet.getByRole("form", { name: "Your name" })).toHaveCount(0);
});
