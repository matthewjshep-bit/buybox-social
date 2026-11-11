import { expect, test, type Page } from "@playwright/test";
import { toFirstHome, createShare, heartOf, homeIn, settle, signInAgent } from "./helpers";

// The tour stays out of the way of scripted browsers unless they ask for it.
const withTour = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem("buybox:tour:test", "1"));
};

test("an agent's take before they send: a note and a like on the price, which their client reads as theirs, first", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "take@example.com", "Nell Ortiz");
  const { url, dashboardUrl } = await createShare(agent, ["1204 Quillan"], ["Wren"]);

  // Asked for on the link's page, before it's sent: optional, and said so.
  const ask = agent.locator("[data-your-take]");
  await expect(ask).toContainText("Add your take before you send");
  await expect(ask).toContainText("Recommended");
  await expect(ask).toContainText("Wren sees them on the link");
  await ask.getByRole("link", { name: "Add your notes" }).click();
  await agent.waitForURL("**/s/*");
  await toFirstHome(agent);
  const home = homeIn(agent, "1204 Quillan St SE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(agent.getByRole("banner")).toContainText("Your notes for Wren");

  // The price: a note, then a like. No dislike: what isn't right goes in a note.
  const price = home.locator('[data-fact="Price"]');
  await price.click();
  const card = home.getByRole("group", { name: "Price" });
  await expect(card).toBeVisible();
  await settle(card);
  await expect(card.getByRole("button", { name: /^Dislike/ })).toHaveCount(0);
  await card.getByRole("button", { name: /^Add a note on the price/ }).click();
  const sheet = agent.getByRole("dialog", { name: "Comments" });
  await expect(sheet.getByText("Wren sees your notes, and anyone on this link.")).toBeVisible();
  await sheet.getByLabel("Add a note on the price").fill("Priced under the last two sales on this street.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();
  // (The card goes with the comments, as it always does, then opens again.)
  await expect(card).toBeHidden();
  await price.click();
  await settle(card);
  await expect(card.locator("[data-agent-take]")).toContainText("Your note");
  await expect(card.locator("[data-agent-take]")).toContainText("Priced under the last two sales on this street.");
  const like = card.getByRole("button", { name: /^Like the price/ });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  // Their face is on it now, for them too.
  await expect(price).toHaveAccessibleName(/, your note, 1 like$/);

  // Done: back to the link's page, which says the take is on it.
  await agent.keyboard.press("Escape");
  await agent.getByRole("banner").getByRole("link", { name: "Done" }).click();
  await agent.waitForURL(dashboardUrl);
  await expect(agent.getByText("1 note and 1 like, for Wren to see.")).toBeVisible();
  await expect(agent.locator("[data-your-take]")).toHaveCount(0);

  // Wren opens it: the agent's words lead the line on the photo, with their
  // face on the price, and their note and like on its card.
  const wren = await (await browser.newContext()).newPage();
  const errors: string[] = [];
  wren.on("pageerror", (error) => errors.push(error.message));
  await wren.goto(url);
  await toFirstHome(wren);
  const hers = homeIn(wren, "1204 Quillan St SE");
  await expect(hers.locator("[data-photo-caption]")).toContainText("Nell (your agent)");
  await expect(hers.locator("[data-photo-caption]")).toContainText("Priced under the last two sales");
  const herPrice = hers.locator('[data-fact="Price"]');
  await expect(herPrice).toHaveAccessibleName(/, with a note from Nell, your agent$/);
  await herPrice.click();
  const herCard = hers.getByRole("group", { name: "Price" });
  await expect(herCard).toBeVisible();
  const take = herCard.locator("[data-agent-take]");
  await expect(take).toContainText("Nell, your agent");
  await expect(take).toContainText("Likes this");
  await expect(take).toContainText("Priced under the last two sales on this street.");
  // [P] The agent's like is theirs, not one of the link's own: no count on
  // the price, none on the home, and Wren's own heart is still hers to give.
  await expect(herCard.getByRole("button", { name: /^Like the price/ })).toHaveAccessibleName("Like the price");
  await expect(herCard.getByRole("button", { name: /^Like the price/ })).toHaveAttribute("aria-pressed", "false");
  await wren.keyboard.press("Escape");
  await expect(heartOf(hers)).toHaveAttribute("aria-pressed", "false");
  await expect(heartOf(hers)).toHaveAccessibleName(/^Like 1204 Quillan St SE$/);
  expect(errors).toEqual([]);
});

test("the first time, a quick tour shows what to tap, step by step, and then gets out of the way for good", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "tour@example.com", "Ivo Marsh");
  const { url } = await createShare(agent, ["10421 Halvard", "4127 Larkmoor"], ["Rue"]);

  const page = await (await browser.newContext()).newPage();
  await withTour(page);
  await page.goto(url);
  // Nothing over the agent's welcome: it starts on the first home.
  await page.waitForTimeout(1500);
  await expect(page.locator("[data-tour-open]")).toHaveCount(0);
  await page.getByRole("button", { name: "See the 2 homes" }).click();
  const first = homeIn(page, "10421 Halvard Way NE");
  await expect(first).toBeInViewport({ ratio: 0.9 });

  const steps = page.locator("[data-tour-open]");
  await expect(steps).toBeVisible();
  await expect(steps).toContainText("Tap any detail");
  await expect(steps.getByLabel("Step 1 of 3")).toBeVisible();
  await expect(steps.getByRole("button", { name: "Next", exact: true })).toBeFocused();
  await steps.getByRole("button", { name: "Next", exact: true }).click();
  await expect(steps).toContainText("Tap anything in a photo");
  await expect(steps).toContainText("tell Ivo what you think");
  // A tap anywhere is the next step too.
  await page.mouse.click(20, 200);
  await expect(steps).toContainText("Love the home?");
  await expect(steps).toContainText("Then swipe up for the next one.");
  await steps.getByRole("button", { name: "Got it" }).click();
  await expect(steps).toHaveCount(0);
  // Then the nudges, as before.
  await expect(first.getByText("Swipe for more photos")).toBeVisible({ timeout: 5000 });

  // Once, on this device.
  await page.reload();
  await page.getByRole("button", { name: "See the 2 homes" }).click();
  await expect(homeIn(page, "10421 Halvard Way NE")).toBeInViewport({ ratio: 0.9 });
  await page.waitForTimeout(2000);
  await expect(page.locator("[data-tour-open]")).toHaveCount(0);

  // The home page, signed out: the same, once they're on the first home, and Skip ends it.
  const guest = await (await browser.newContext()).newPage();
  await withTour(guest);
  await guest.goto("/");
  await guest.waitForTimeout(1500);
  await expect(guest.locator("[data-tour-open]")).toHaveCount(0);
  await guest.locator("[data-reel]").evaluate((reel) => reel.scrollTo({ top: reel.clientHeight }));
  const intro = guest.locator("[data-tour-open]");
  await expect(intro).toContainText("Tap any detail");
  await intro.getByRole("button", { name: "Skip" }).click();
  await expect(intro).toHaveCount(0);
  await guest.reload();
  await guest.locator("[data-reel]").evaluate((reel) => reel.scrollTo({ top: reel.clientHeight }));
  await guest.waitForTimeout(2000);
  await expect(guest.locator("[data-tour-open]")).toHaveCount(0);

  // The agent's own link: how to add their take, ending on Done.
  await withTour(agent);
  await agent.goto(url);
  await agent.getByRole("button", { name: "See the 2 homes" }).click();
  const theirs = agent.locator("[data-tour-open]");
  await expect(theirs).toContainText("Add your take");
  await theirs.getByRole("button", { name: "Next", exact: true }).click();
  await expect(theirs).toContainText("Point things out");
  await theirs.getByRole("button", { name: "Next", exact: true }).click();
  await expect(theirs).toContainText("Rue sees your notes");
  await agent.keyboard.press("Escape");
  await expect(theirs).toHaveCount(0);
});
