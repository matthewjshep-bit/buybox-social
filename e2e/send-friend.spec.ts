// Anyone, not only an agent, can send homes: the same three steps (which
// home, who it's for, their own feedback or none), then the link. Whoever
// opens it sees who it's from by name, never as "your agent"; and what they
// say on it reaches the sender's Activity, going back to their link's page.
import { expect, test } from "@playwright/test";
import { homeIn, joinAs, openComments, pickHome, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";

test("someone who isn't an agent sends a home in three steps, and hears back in Activity", async ({ browser }) => {
  test.setTimeout(120_000);
  const maya = await signUpBuyer(browser, `maya.sends.${Date.now()}@example.com`, "Maya");

  // From their home: Send homes, and the first step.
  await maya.goto("/");
  await maya.getByRole("link", { name: "Send homes to someone" }).click();
  await maya.waitForURL(/\/send$/);
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Send homes");
  await expect(maya.getByText("Step 1 of 3")).toBeVisible();
  await pickHome(maya, QUILLAN);
  await maya.getByRole("button", { name: "Next", exact: true }).click();

  // Who it's for: a first name, with nothing about clients.
  const who = maya.getByRole("combobox", { name: "Who's it for?" });
  await expect(who).toHaveAttribute("placeholder", "A first name");
  await who.fill("Sam");
  await who.press("Enter");
  await expect(maya.getByText("This link will be called Sam.")).toBeVisible();
  await maya.getByRole("button", { name: "Next", exact: true }).click();

  // Their feedback, or none: skipped here, straight to the link.
  await maya.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  await expect(maya.getByRole("heading", { level: 1, name: "Add your feedback" })).toBeInViewport();
  await expect(maya.getByText("so Sam sees what you think")).toBeVisible();
  await maya.getByRole("link", { name: "Skip this step" }).click();
  await maya.waitForURL(/\/send\/[\w-]+$/);
  const ownPage = new URL(maya.url()).pathname;
  await expect(maya.getByRole("heading", { level: 1 })).toHaveText("Your link is ready");
  await expect(maya.getByRole("main")).toContainText(QUILLAN);
  const link = await maya.getByLabel("Sam's link").inputValue();
  expect(link).toMatch(/\/s\/[\w-]{32}$/);
  await expect(maya.getByRole("link", { name: "Send another" })).toHaveAttribute("href", "/send");

  // Sam opens it: from Maya, by name, and nowhere "your agent".
  const sam = await (await browser.newContext()).newPage();
  await sam.goto(link);
  await expect(sam.getByRole("region", { name: "Welcome" })).toBeVisible();
  await expect(sam.getByRole("banner")).toContainText("Maya");
  await expect(sam.locator("body")).not.toContainText(/your agent/i);
  await toFirstHome(sam);
  const chat = await openComments(sam, homeIn(sam, QUILLAN));
  await chat.getByRole("textbox").first().fill("The porch is lovely.");
  await chat.getByRole("textbox").first().press("Enter");
  await joinAs(sam, "Sam");
  await expect(chat.getByText("The porch is lovely.")).toBeVisible();

  // Maya hears of it in Activity: Sam, not "Your client", and back to her link's page.
  const line = maya.getByRole("main").getByRole("listitem").filter({ hasText: "Sam" }).first();
  // (Once what Sam said has been saved.)
  await expect(async () => {
    await maya.goto("/activity");
    await expect(line).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(maya.getByRole("main")).not.toContainText("Your client");
  await expect(line.locator(`a[href^="${ownPage}"]`).first()).toBeAttached();
  // From her link's page, into the link itself, where what Sam said is.
  await maya.goto(ownPage);
  await maya.getByRole("link", { name: "See what they said" }).click();
  await maya.waitForURL(/\/s\/[\w-]+$/);
  await expect(maya.getByText("The porch is lovely.").first()).toBeAttached();

  // Nobody else's to open; an agent's Send homes is on their dashboard.
  await sam.goto(ownPage);
  await expect(sam.getByText("Your link is ready")).toHaveCount(0);
  await expect(sam.locator("body")).not.toContainText(link.split("/s/")[1]);
  const agent = await signInAgent(browser, `ag.sends.${Date.now()}@example.com`, "Ag Sends");
  await agent.goto("/send");
  await agent.waitForURL(/\/dashboard\/new$/);
});
