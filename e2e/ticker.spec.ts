import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, openMore, pick, settle, signInAgent, tapPhoto } from "./helpers";

// The line above the price: what people did lately, one at a time, each
// pointing at the spot on the photo where they did it. Timers run on the
// page's own clock here, moved on by hand, so nothing waits on the real one.

const WEXFORD = "3518 Wexford Ave N";
const FERNHOLLOW = "96 Fernhollow Ln";
const SALTMARSH = "719 Saltmarsh Ln";
const COTTAGE = "Blue cottage behind a white picket fence";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

// Waits until a home has snapped all the way into place.
const settled = async (home: Locator) => {
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
};

const activityOf = (home: Locator) => home.getByRole("group", { name: "Recent activity" });
// The line itself: the last button in the slot (Pause, or Play, comes first).
const lineOf = (home: Locator) => activityOf(home).getByRole("button").last();

// A page whose timers wait to be moved on.
async function stillPage(browser: Browser, options = {}) {
  const page = await (await browser.newContext(options)).newPage();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  return page;
}

// Moves the page's clock on, then lets it draw what that did.
async function tick(page: Page, ms: number) {
  await page.clock.runFor(ms);
  await page.waitForTimeout(150);
}

// Someone who likes things in a home's photos, from its public page: on
// each photo (counted from 0), the things named.
async function likeThings(browser: Browser, key: string, address: string, name: string, photos: [number, string[]][]) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`/homes/${key}`);
  const home = homeIn(page, address);
  await settled(home);
  let at = 0;
  let joined = false;
  for (const [photo, things] of photos) {
    for (; at < photo; at++) {
      await home.getByRole("button", { name: "Next photo" }).click();
      await expect(home.getByText(new RegExp(`^Photo ${at + 2} of \\d+$`))).toBeAttached();
    }
    for (const thing of things) {
      const card = await pick(home, thing);
      const like = card.getByRole("button", { name: new RegExp(`^Like ${thing}(,|$)`) });
      await like.click();
      if (!joined) await joinAs(page, name);
      joined = true;
      await expect(like).toHaveAttribute("aria-pressed", "true");
      await card.getByRole("button", { name: "Close" }).click();
    }
  }
  await page.context().close();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  // Al likes the wall sconces, then the big windows on the second photo; Bo,
  // last, the front entry.
  await likeThings(browser, "SAMPLE-1007", WEXFORD, "Al", [
    [0, ["the wall sconces"]],
    [1, ["the big windows"]],
  ]);
  await likeThings(browser, "SAMPLE-1007", WEXFORD, "Bo", [[0, ["the front entry"]]]);
  // Another home with a few things going round, to move on to.
  await likeThings(browser, "SAMPLE-1006", "2205 Brackenfield Ct NW", "Di", [[0, ["the brick front", "the lawn"]]]);
});

test("it holds on the newest, then goes round what's on the photo, its face right on the spot, in a slot that never changes size", async ({
  browser,
}) => {
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  // The newest first, and it stays put for a while.
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry\. .+\. Show it on the photo\.$/);
  await expect(activityOf(home).getByRole("button", { name: "Pause activity" })).toBeVisible();
  const slot = (await activityOf(home).boundingBox())!;
  expect(Math.round(slot.height)).toBe(48);
  await tick(page, 5000);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  // Then what else was done on the photo on screen.
  await tick(page, 1500);
  await expect(lineOf(home)).toHaveAccessibleName(/^Al liked the wall sconces/);

  // Their face, on the photo, right on the spot (only to look at: the spot's
  // own button is still there, by the same name).
  const pin = home.getByRole("button", { name: /^Wall sconces: \d+ likes?$/ });
  await expect(pin).toBeVisible();
  const face = home.locator("[data-spot-highlight] [data-face]");
  await expect(face).toHaveCount(1);
  await expect(home.locator("[data-spot-highlight]")).toHaveAttribute("aria-hidden", "true");
  const at = (await pin.boundingBox())!;
  const drawn = (await face.boundingBox())!;
  expect(Math.abs(drawn.x + drawn.width / 2 - (at.x + at.width / 2))).toBeLessThanOrEqual(3);
  expect(Math.abs(drawn.y + drawn.height / 2 - (at.y + at.height / 2))).toBeLessThanOrEqual(3);

  // Round it goes, one at a time, never changing the slot's size or moving
  // the price.
  const price = (await home.getByRole("button", { name: /^\$[\d,]+/ }).boundingBox())!;
  const lines = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const was = (await lineOf(home).getAttribute("aria-label"))!;
    lines.add(was);
    await tick(page, 8000);
    await expect(lineOf(home)).not.toHaveAttribute("aria-label", was);
    expect(await activityOf(home).boundingBox()).toEqual(slot);
    expect((await home.getByRole("button", { name: /^\$[\d,]+/ }).boundingBox())!.y).toBe(price.y);
  }
  expect(lines.size).toBeGreaterThan(2);
  // Only the one showing is on the page.
  await expect(activityOf(home).getByRole("button", { name: /liked|commented|sent/ })).toHaveCount(1);
});

test("Pause stops it for the rest of the visit, on every home, until the tab closes", async ({ browser }) => {
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  const before = await lineOf(home).getAttribute("aria-label");
  await activityOf(home).getByRole("button", { name: "Pause activity" }).click();
  await expect(activityOf(home).getByRole("button", { name: "Play activity" })).toBeVisible();
  for (let i = 0; i < 5; i++) await tick(page, 2000);
  await expect(lineOf(home)).toHaveAttribute("aria-label", before!);

  // Still paused on the next page in this tab, and after a reload.
  await page.goto("/homes/SAMPLE-1006");
  const other = homeIn(page, "2205 Brackenfield Ct NW");
  await settled(other);
  await expect(activityOf(other).getByRole("button", { name: "Play activity" })).toBeVisible();
  await page.reload();
  await settled(other);
  await expect(activityOf(other).getByRole("button", { name: "Play activity" })).toBeVisible();

  // A new tab starts afresh.
  const tab = await page.context().newPage();
  await tab.goto("/homes/SAMPLE-1007");
  await settled(homeIn(tab, WEXFORD));
  await expect(activityOf(homeIn(tab, WEXFORD)).getByRole("button", { name: "Pause activity" })).toBeVisible();

  // Play goes on again.
  await activityOf(other).getByRole("button", { name: "Play activity" }).click();
  await expect(activityOf(other).getByRole("button", { name: "Pause activity" })).toBeVisible();
});

test("with reduced motion, nothing moves on its own: it steps by hand", async ({ browser }) => {
  const page = await stillPage(browser, { reducedMotion: "reduce" });
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  const first = await lineOf(home).getAttribute("aria-label");
  for (let i = 0; i < 5; i++) await tick(page, 2000);
  await expect(lineOf(home)).toHaveAttribute("aria-label", first!);
  await expect(activityOf(home).getByRole("button", { name: /^(Pause|Play) activity$/ })).toHaveCount(0);
  await activityOf(home).getByRole("button", { name: "Show the next activity" }).click();
  await expect(lineOf(home)).not.toHaveAttribute("aria-label", first!);
  // Still, it's said when it changes.
  await expect(activityOf(home).locator("[aria-live]")).toHaveAttribute("aria-live", "polite");
});

test("a tap on something done in another photo turns to that photo and opens its spot", async ({ browser, page }) => {
  await likeThings(browser, "SAMPLE-1004", FERNHOLLOW, "Cy", [
    [0, ["the evergreens"]],
    [2, ["the natural light"]],
  ]);
  await page.goto("/homes/SAMPLE-1004");
  const home = homeIn(page, FERNHOLLOW);
  await settled(home);
  await expect(home.getByText("Photo 1 of 3")).toBeAttached();
  await expect(lineOf(home)).toHaveAccessibleName(/^Cy liked the natural light, in photo 3\. .+\. Show it in photo 3\.$/);
  await expect(activityOf(home)).toContainText("Living room · photo 3");
  await lineOf(home).click();
  await expect(home.getByText("Photo 3 of 3")).toBeAttached();
  const card = home.getByRole("group", { name: "Natural light" });
  await expect(card).toBeVisible();
  // It stays put on this home now.
  await expect(activityOf(home).getByRole("button", { name: "Play activity" })).toBeVisible();
});

test("after three rounds it rests on who liked the home; a photo with more on it runs one more round", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  await expect
    .poll(
      async () => {
        await tick(page, 8000);
        return activityOf(home).textContent();
      },
      { timeout: 60_000, intervals: [0] },
    )
    .toMatch(/liked this$/);
  await expect(lineOf(home)).toHaveAccessibleName(/liked this\. See the scorecard\.$/);
  await expect(activityOf(home).getByRole("button", { name: "Play activity" })).toBeVisible();
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(0);

  // On to the second photo, where Al liked the big windows: to that, and round once more.
  await home.getByRole("button", { name: "Next photo" }).click();
  await expect
    .poll(
      async () => {
        await tick(page, 500);
        return lineOf(home).getAttribute("aria-label");
      },
      { timeout: 30_000, intervals: [0] },
    )
    .toMatch(/^Al liked the big windows/);
  await expect(activityOf(home).getByRole("button", { name: "Pause activity" })).toBeVisible();
  await expect
    .poll(
      async () => {
        await tick(page, 8000);
        return activityOf(home).textContent();
      },
      { timeout: 60_000, intervals: [0] },
    )
    .toMatch(/liked this$/);
});

test("side by side, where who liked it is said just below, it rests on the newest instead", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await stillPage(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  await expect
    .poll(
      async () => {
        await tick(page, 8000);
        return activityOf(home).getByRole("button", { name: "Play activity" }).count();
      },
      { timeout: 60_000, intervals: [0] },
    )
    .toBe(1);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  await expect(activityOf(home)).not.toContainText("liked this");
});

test("a pointer on its spot holds it; once that spot's card has come and gone, it goes on", async ({ browser }) => {
  const page = await stillPage(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  const pin = home.getByRole("button", { name: /^Front entry: /i });
  await expect(pin).toBeInViewport();
  // (Once it has popped in.)
  await page.waitForTimeout(500);
  await pin.hover();
  await expect(activityOf(home).locator(".underline")).toHaveCount(1);
  await tick(page, 9000);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  // Its card opens over the spot, and closes.
  await pin.click();
  const card = home.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  await page.mouse.move(700, 20);
  await tick(page, 8000);
  await expect(activityOf(home).locator(".underline")).toHaveCount(0);
  await expect(lineOf(home)).not.toHaveAccessibleName(/^Bo liked the front entry/);
});

test("opened over another page (from someone's profile), it still goes round", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.clock.install();
  const html = await (await page.request.get("/homes/SAMPLE-1007")).text();
  const profile = /profileId\\?":\\?"([0-9a-f-]{36})/.exec(html)?.[1];
  expect(profile).toBeTruthy();
  await page.goto(`/people/${profile}`);
  // (A card opens on the photo it's about: `?photo=`.)
  await page.locator('a[href^="/homes/SAMPLE-1007"]').first().click();
  const home = page.locator("dialog[open]").getByRole("article", { name: WEXFORD });
  await expect(home).toBeVisible();
  await expect(activityOf(home).getByRole("button", { name: "Pause activity" })).toBeVisible();
  const before = (await lineOf(home).getAttribute("aria-label"))!;
  await page.clock.runFor(8000);
  await expect(lineOf(home)).not.toHaveAttribute("aria-label", before);
});

test("beside the map it's only to read: the newest, still, not a button", async ({ browser }) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.clock.install();
  await page.goto("/search?home=SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await expect(home).toBeVisible();
  const activity = activityOf(home);
  await expect(activity).toContainText("Bo liked the front entry");
  await expect(activity.getByRole("button")).toHaveCount(0);
  await page.clock.runFor(20_000);
  await page.waitForTimeout(300);
  await expect(activity).toContainText("Bo liked the front entry");
});

test("isolation: what's private on an agent's link never reaches the public line, by words, name, pass or spot", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const SECRET = "Offer 30k under, they sound desperate.";
  const SPOT_SECRET = "That corner needs a total redo.";
  const agent = await signInAgent(browser, "tilly@example.com", "Tilly Agent");
  const { url } = await createShare(agent, ["719 Saltmarsh"], ["Yara"]);
  const yara = await (await browser.newContext()).newPage();
  await yara.goto(url);
  const yaraHome = homeIn(yara, SALTMARSH);
  await yaraHome.scrollIntoViewIfNeeded();
  await settled(yaraHome);

  // A dislike on a spot, a comment on a spot, a comment, and a pass: all private.
  const chimney = await pick(yaraHome, "the chimney");
  await chimney.getByRole("button", { name: /^Dislike the chimney/ }).click();
  await expect(chimney.getByRole("button", { name: /^Dislike the chimney/ })).toHaveAttribute("aria-pressed", "true");
  await chimney.getByRole("button", { name: "Close" }).click();
  // (Right on a spot nobody else has used; on a touchscreen, said in the sheet below.)
  const SPOT = { x: 0.8, y: 0.45 };
  await tapPhoto(yaraHome, COTTAGE, SPOT.x, SPOT.y);
  const card = yaraHome.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Comment on/ }).click();
  const about = yara.getByRole("dialog", { name: "Comments" });
  await expect(about.getByRole("heading", { name: "On a spot in photo 1" })).toBeVisible();
  await about.getByRole("textbox").fill(SPOT_SECRET);
  await about.getByRole("button", { name: "Post", exact: true }).click();
  await expect(about).toBeHidden();
  // Where it was left, exactly ("@80,45"), as the link has it.
  const spot = yaraHome.locator('[data-pin^="@"]');
  await expect(spot).toHaveCount(1);
  const spotTag = (await spot.getAttribute("data-pin"))!;
  const chat = await openComments(yara, yaraHome);
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(SECRET)).toBeVisible();
  await yara.keyboard.press("Escape");
  const more = await openMore(yara, yaraHome);
  await more.getByRole("button", { name: "Not for me" }).click();
  await more.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }).click();
  await expect(
    more.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }),
  ).toHaveAttribute("aria-pressed", "true");

  // The public page: a buyer commented privately, and nothing more, all the way round.
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, SALTMARSH);
  await settled(home);
  await expect(activityOf(home)).toContainText("A buyer commented privately");
  const photo = (await home.getByRole("img", { name: COTTAGE }).boundingBox())!;
  const spotAt = { x: photo.x + photo.width * SPOT.x, y: photo.y + photo.height * SPOT.y };
  for (let i = 0; i < 8; i++) {
    const text = (await home.textContent())!;
    for (const never of ["didn't like", "passed", SECRET, SPOT_SECRET, "Yara"]) expect(text).not.toContain(never);
    // Nor what the line says aloud: never a comment "on" anything here.
    const said = (await lineOf(home).getAttribute("aria-label")) ?? "";
    for (const never of ["didn't like", "passed", "commented on", SECRET, SPOT_SECRET, "Yara"]) expect(said).not.toContain(never);
    expect(await activityOf(home).textContent()).not.toMatch(/, on /);
    for (const face of await home.locator("[data-spot-highlight] [data-face]").all()) {
      const drawn = (await face.boundingBox())!;
      const [x, y] = [drawn.x + drawn.width / 2, drawn.y + drawn.height / 2];
      expect(Math.hypot(x - spotAt.x, y - spotAt.y)).toBeGreaterThan(10);
    }
    await tick(page, 8000);
  }
  for (const path of ["/", "/homes/SAMPLE-1008"]) {
    const html = await (await page.request.get(path)).text();
    for (const never of [SECRET, SPOT_SECRET, "Yara", spotTag]) expect(html).not.toContain(never);
  }
});

test("isolation: a comment on a spot shared from a link shows its words in public, never where it was left", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const WORDS = "Love how the light falls on this side.";
  const agent = await signInAgent(browser, "tess@example.com", "Tess Agent");
  const { url } = await createShare(agent, ["719 Saltmarsh"], ["Zoe"]);
  const zoe = await (await browser.newContext()).newPage();
  await zoe.goto(url);
  const zoeHome = homeIn(zoe, SALTMARSH);
  await zoeHome.scrollIntoViewIfNeeded();
  await settled(zoeHome);
  // Sharing is offered once you like the home.
  await heartOf(zoeHome).click();
  await expect(heartOf(zoeHome)).toHaveAttribute("aria-pressed", "true");
  const SPOT = { x: 0.8, y: 0.45 };
  await tapPhoto(zoeHome, COTTAGE, SPOT.x, SPOT.y);
  const card = zoeHome.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Comment on/ }).click();
  const about = zoe.getByRole("dialog", { name: "Comments" });
  await expect(about.getByRole("heading", { name: "On a spot in photo 1" })).toBeVisible();
  await about.getByLabel(/share this anonymously/).check();
  await about.getByRole("textbox").fill(WORDS);
  await about.getByRole("button", { name: "Post", exact: true }).click();
  await expect(about).toBeHidden();
  const spot = zoeHome.locator('[data-pin^="@"]');
  await expect(spot).toHaveCount(1);
  const spotTag = (await spot.getAttribute("data-pin"))!;

  // In public: what she said, by "A buyer", on no spot at all.
  const page = await (await browser.newContext()).newPage();
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, SALTMARSH);
  await settled(home);
  await expect(activityOf(home)).toContainText(`A buyer commented\u201c${WORDS}\u201d`);
  expect(await lineOf(home).getAttribute("aria-label")).toMatch(/^A buyer commented: Love how the light falls on this side\. .+\. See it in the comments\.$/);
  await expect(home.locator(`[data-pin="${spotTag}"]`)).toHaveCount(0);
  const sheet = await openComments(page, home);
  await expect(sheet.getByText(WORDS)).toBeVisible();
  await expect(sheet.getByRole("button", { name: /: show it$/ })).toHaveCount(0);
  const html = await (await page.request.get("/homes/SAMPLE-1008")).text();
  expect(html).toContain(WORDS);
  expect(html).not.toContain(spotTag);
});
