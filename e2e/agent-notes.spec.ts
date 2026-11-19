import { expect, test, type Page } from "@playwright/test";
import { toFirstHome, createShare, heartOf, homeIn, openComments, settle, signedIn, signInAgent } from "./helpers";

// The tour stays out of the way of scripted browsers unless they ask for it.
const withTour = async (page: Page) => {
  await page.context().addInitScript(() => localStorage.setItem("buybox:tour:test", "1"));
};

test("an agent's take before they send: a note and a like on the price, a dislike on the bedrooms, which their client reads as theirs, first", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "take@example.com", "Nell Ortiz");
  const { url, dashboardUrl } = await createShare(agent, ["1204 Quillan"], ["Wren"]);

  // Asked for on the link's page, before it's sent.
  const ask = agent.locator("[data-your-take]");
  // (One button, and no more words than its name.)
  await expect(ask).toHaveText("Add your feedback");
  await ask.getByRole("link", { name: "Add your feedback" }).click();
  await agent.waitForURL("**/s/*");
  await toFirstHome(agent);
  const home = homeIn(agent, "1204 Quillan St SE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(agent.getByRole("banner")).toContainText("your feedback for Wren");

  // The price: a note, then a like. (A dislike is there too, as for anyone.)
  const price = home.locator('[data-fact="Price"]');
  await price.click();
  const card = home.getByRole("group", { name: "Price" });
  await expect(card).toBeVisible();
  await settle(card);
  await expect(card.getByRole("button", { name: /^Dislike the price/ })).toBeVisible();
  await card.getByRole("button", { name: /^Add a note on the price/ }).click();
  const sheet = agent.getByRole("dialog", { name: "Comments" });
  await expect(sheet.getByText("Everyone on this link sees your feedback.")).toBeVisible();
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
  await agent.keyboard.press("Escape");

  // And what isn't right, with a dislike: the bedrooms.
  const beds = home.locator('[data-fact="Bedrooms"]');
  await beds.click();
  const bedsCard = home.getByRole("group", { name: "Bedrooms" });
  await settle(bedsCard);
  const dislike = bedsCard.getByRole("button", { name: /^Dislike the bedrooms/ });
  await dislike.click();
  await expect(dislike).toHaveAttribute("aria-pressed", "true");
  await expect(dislike).toHaveAccessibleName("Dislike the bedrooms, 1 dislike");

  // Done: back to the link's page, which says the take is on it.
  await agent.keyboard.press("Escape");
  await agent.getByRole("banner").getByRole("link", { name: "Done" }).click();
  await agent.waitForURL(dashboardUrl);
  await expect(agent.getByText("1 note, 1 like and 1 dislike", { exact: true })).toBeVisible();
  await expect(agent.locator("[data-your-take]")).toHaveCount(0);
  // In the thread, the note wears the agent's own photo, as on the link.
  await agent.goto(`${dashboardUrl}?tab=homes`);
  const note = agent
    .getByRole("region", { name: "1204 Quillan St SE" })
    .getByRole("list", { name: "Comments" })
    .getByRole("listitem")
    .filter({ hasText: "Priced under the last two sales on this street." });
  await expect(note.locator('img[src^="/people/"]')).toBeVisible();

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
  // The bedrooms: the agent doesn't like them, said as theirs, and Wren's
  // own dislike is still hers to give.
  await hers.locator('[data-fact="Bedrooms"]').click();
  const herBeds = hers.getByRole("group", { name: "Bedrooms" });
  await expect(herBeds.locator("[data-agent-take]")).toContainText("Doesn't like this");
  await expect(herBeds.getByRole("button", { name: /^Dislike the bedrooms/ })).toHaveAccessibleName("Dislike the bedrooms");
  await expect(herBeds.getByRole("button", { name: /^Dislike the bedrooms/ })).toHaveAttribute("aria-pressed", "false");
  await wren.keyboard.press("Escape");
  await expect(heartOf(hers)).toHaveAttribute("aria-pressed", "false");
  await expect(heartOf(hers)).toHaveAccessibleName(/^Like 1204 Quillan St SE$/);

  // Wren asks something on the link, and the agent answers her there.
  const ASKED = "Is the roof on this one new?";
  const ANSWER = "Replaced two summers ago, with the permit on file.";
  // (Signed in, so what she says goes through at once.)
  const asker = await signedIn(browser);
  await asker.goto(url);
  const theirs = homeIn(asker, "1204 Quillan St SE");
  await theirs.scrollIntoViewIfNeeded();
  await expect(theirs).toBeInViewport({ ratio: 0.9 });
  const chat = await openComments(asker, theirs);
  await chat.getByLabel("Add a comment").fill(ASKED);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(ASKED)).toBeVisible();
  // (Once it's saved, the agent has it.)
  const panel = agent.getByRole("region", { name: "1204 Quillan St SE" });
  await expect(async () => {
    await agent.goto(`${dashboardUrl}?tab=homes`);
    await expect(panel.getByText(ASKED)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await panel.getByLabel("Reply to your client").fill(ANSWER);
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText(ANSWER)).toBeVisible();

  // The agent's page, to anyone: the home is there for what they marked and
  // noted on their link, and the line at its foot says so under their name.
  // Never what they didn't like, what their client said, or their answer.
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const address = `/reel?from=${new URL(agent.url()).pathname.split("/").pop()}&home=SAMPLE-1009`;
  const guest = await (await browser.newContext()).newPage();
  await guest.clock.install();
  await guest.goto(address);
  const activity = homeIn(guest, "1204 Quillan St SE").getByRole("group", { name: "Recent activity" });
  const said: string[] = [];
  for (let i = 0; i < 6; i++) {
    await expect(activity).toContainText("Nell");
    said.push((await activity.textContent()) ?? "");
    await guest.clock.runFor(5000);
    await guest.waitForTimeout(150);
  }
  expect(said).toContainEqual(expect.stringContaining("Nell liked the price"));
  // (Their note on the price is the same place as their like, so the line says it once.)
  for (const line of said) expect(line).not.toMatch(/bedrooms|A buyer|Wren|roof|Replaced|privately/);
  const html = await (await guest.request.get(address)).text();
  for (const never of [ASKED, ANSWER]) expect(html).not.toContain(never);
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
  await expect(steps).toContainText("Like it, or say something.");
  // A tap anywhere is the next step too.
  await page.mouse.click(20, 200);
  await expect(steps).toContainText("Love the home?");
  await expect(steps).toContainText("Tap the heart.");
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

  // Browse homes, signed out: the same, on the first home (which is where it
  // opens: no form comes first), and Skip ends it.
  const guest = await (await browser.newContext()).newPage();
  await withTour(guest);
  await guest.goto("/reel");
  await expect(guest.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
  const intro = guest.locator("[data-tour-open]");
  await expect(intro).toContainText("Tap any detail");
  await intro.getByRole("button", { name: "Skip" }).click();
  await expect(intro).toHaveCount(0);
  await guest.reload();
  await expect(guest.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
  await guest.waitForTimeout(2000);
  await expect(guest.locator("[data-tour-open]")).toHaveCount(0);

  // The agent's own link: how to add their feedback, ending on Done.
  await withTour(agent);
  await agent.goto(url);
  await agent.getByRole("button", { name: "See the 2 homes" }).click();
  const theirs = agent.locator("[data-tour-open]");
  await expect(theirs).toContainText("Add your feedback");
  await theirs.getByRole("button", { name: "Next", exact: true }).click();
  await expect(theirs).toContainText("Point things out");
  await theirs.getByRole("button", { name: "Next", exact: true }).click();
  await expect(theirs).toContainText("Rue sees your feedback");
  await agent.keyboard.press("Escape");
  await expect(theirs).toHaveCount(0);
});
