import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer } from "./helpers";

test("an agent's home is calm: their clients as people, what each did as big cards, Reply right on the card, and nothing to tick off", async ({
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

  // On a phone: the box to send homes, then her, with what she said, near
  // the top; nothing wider than the screen; and no list of things to do.
  await agent.setViewportSize({ width: 390, height: 844 });
  await agent.goto("/");
  await expect(agent.getByRole("link", { name: "Send homes to a client" })).toHaveAttribute("href", "/dashboard/new?focus=to");
  const clients = agent.getByRole("region", { name: "Your clients" });
  const kitThere = clients.getByRole("link", { name: /^Kit\b/ });
  await expect(kitThere).toContainText("“Does it get afternoon sun?”");
  expect((await kitThere.boundingBox())!.y).toBeLessThan(400);
  expect(await agent.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(agent.getByRole("region", { name: "Needs you" })).toHaveCount(0);
  await expect(agent.getByRole("button", { name: "Mark done" })).toHaveCount(0);

  // Her day is a card with the home's photo large, what she said, and Reply.
  const card = agent.getByRole("listitem").filter({ hasText: "Only you see this" }).filter({ hasText: "Does it get afternoon sun?" });
  await expect(card).toContainText("Kit");
  await expect(card.getByRole("img").first()).toBeVisible();
  expect((await card.getByRole("img").first().boundingBox())!.width).toBeGreaterThan(300);

  // On a desktop: them down the left, their clients down the right, and none
  // of a buyer's home: nothing picked for them.
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.reload();
  const you = agent.getByRole("complementary", { name: "Your profile" });
  await expect(you.getByRole("link", { name: "Tess Today" })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
  await expect(you.getByRole("link", { name: /^Clients/ }).first()).toHaveAttribute("href", "/dashboard");
  await expect(you.getByRole("link", { name: "Your brand" })).toHaveAttribute("href", "/dashboard/profile");
  await expect(agent.getByRole("region", { name: "More homes for you" })).toHaveCount(0);
  await expect(clients.getByRole("link", { name: "See all clients" })).toHaveAttribute("href", "/dashboard");
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

  // Reply, right on the card: once answered, Kit isn't waiting any more.
  await card.getByRole("button", { name: "Reply to Kit" }).click();
  await card.getByRole("textbox", { name: "Reply to Kit" }).fill("Plenty: it faces west.");
  await card.getByRole("button", { name: "Send", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("Sent to Kit");
  await agent.reload();
  await expect(card.getByRole("button", { name: "Reply to Kit" })).toHaveCount(0);
  await expect(kitThere).toContainText("Liked 1 of 2 homes");
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
