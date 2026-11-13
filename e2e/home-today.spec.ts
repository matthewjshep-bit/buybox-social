import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer } from "./helpers";

test("an agent's home is calm: what's waiting for them right under the header on a phone, nothing of a buyer's home on a desktop, and Done puts a row away for good", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "tess-today@example.com", "Tess Today");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Kit"]);

  // Kit likes a home on her link and asks something about it.
  const kit = await (await browser.newContext()).newPage();
  await kit.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await kit.goto(url);
  const quillan = homeIn(kit, "1204 Quillan St SE");
  await heartOf(quillan).click();
  await joinAs(kit, "Kit", "kit.today@example.com");
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
  const chat = await openComments(kit, quillan);
  await chat.getByLabel("Add a comment").fill("Does it get afternoon sun?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // On a phone: her face and what she's waiting for, right under the header,
  // with no bar to send homes (the Send face does that), and nothing wider
  // than the screen.
  await agent.setViewportSize({ width: 390, height: 844 });
  await agent.goto("/");
  const needs = agent.getByRole("region", { name: "Needs you" });
  const row = needs.getByRole("listitem").filter({ hasText: "Does it get afternoon sun?" });
  await expect(row).toBeVisible();
  const face = agent.getByRole("navigation", { name: "Your clients" }).getByRole("link", { name: /^Kit\b/ });
  await expect(face).toBeVisible();
  const top = Math.min((await row.boundingBox())!.y, (await face.boundingBox())!.y);
  expect(top).toBeLessThan(300);
  await expect(agent.getByRole("link", { name: "Send homes to a client" })).toBeHidden();
  await expect(agent.getByRole("link", { name: "Send homes", exact: true })).toBeVisible();
  expect(await agent.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // The one filled button: the first row's.
  await expect(row.getByRole("button", { name: "Reply to Kit" })).toHaveClass(/bg-brand/);

  // On a desktop: the bar to send homes, and none of a buyer's home: no
  // Browse homes, no Map, nothing picked for them.
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.reload();
  const main = agent.getByRole("main");
  for (const name of ["Browse homes", "Map"]) {
    await expect(main.getByRole("link", { name, exact: true })).toHaveCount(0);
    await expect(main.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(agent.getByRole("region", { name: "More homes for you" })).toHaveCount(0);
  await expect(agent.getByRole("link", { name: "Send homes to a client" })).toHaveAttribute(
    "href",
    "/dashboard/new?focus=to",
  );
  // Beside it, their clients counted as the Clients page counts them, each
  // count opening just those clients.
  const counts = agent.getByRole("region", { name: "Your clients" });
  await expect(counts.getByRole("link", { name: /^1 liked a home/ })).toHaveAttribute("href", "/dashboard?show=liked");
  await expect(counts.getByRole("link", { name: /^1 commented/ })).toHaveAttribute("href", "/dashboard?show=commented");
  // Kit's day ends the Clients stream, and then it stops.
  await expect(agent.getByRole("note", { name: "You're all caught up" })).toBeVisible();

  // Following, a tap away, kept in the address and remembered on this device.
  const lenses = agent.getByRole("group", { name: "Show" });
  await expect(lenses.getByRole("button", { name: "Clients" })).toHaveAttribute("aria-pressed", "true");
  await lenses.getByRole("button", { name: "Following" }).click();
  await expect(lenses.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
  await expect(agent).toHaveURL(/\?lens=following$/);
  await agent.goto("/");
  await expect(lenses.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
  await lenses.getByRole("button", { name: "Clients" }).click();

  // Done: answered some other way, the row goes, and stays gone.
  await row.getByRole("button", { name: "Mark done" }).click();
  await expect(row).toHaveCount(0);
  await agent.reload();
  await expect(needs.getByText("Does it get afternoon sun?")).toHaveCount(0);
  await expect(needs).toContainText("You're all caught up");
});

test("someone who follows nobody yet starts on homes picked for them, and Following waits a tap away", async ({ browser }) => {
  const page = await signUpBuyer(browser, "una-today@example.com", "Una Today");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, Una");
  const lenses = page.getByRole("group", { name: "Show" });
  await expect(lenses.getByRole("button", { name: "For you" })).toHaveAttribute("aria-pressed", "true");
  await expect(lenses.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "false");
  const picks = page.getByRole("region", { name: "More homes for you" });
  await expect(picks.getByRole("listitem").first().getByRole("link")).toHaveAttribute(
    "href",
    /^\/reel\?from=picks&home=SAMPLE-\d+$/,
  );
  await expect(picks.getByRole("link", { name: "Browse homes" })).toHaveAttribute("href", "/reel");
  // Following: nobody yet, and what to do about it.
  await lenses.getByRole("button", { name: "Following" }).click();
  await expect(page.getByText("Follow people with your taste, and what they like shows up here.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412);
});
