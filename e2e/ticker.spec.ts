import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Listing } from "../lib/listings/types";
import { signedIn, toFirstHome, createShare, heartOf, homeIn, joinAs, openComments, openMore, pick, settle, signInAgent, tapPhoto } from "./helpers";

// The line at the photo's foot: what people did on the photo on screen, one
// at a time, each with a hotspot on the spot where they did it. Timers run on
// the page's own clock here, moved on by hand, so nothing waits on the real one.

const WEXFORD = "3518 Wexford Ave N";
const FERNHOLLOW = "96 Fernhollow Ln";
const SALTMARSH = "719 Saltmarsh Ln";
const COTTAGE = "Blue cottage behind a white picket fence";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
// Wexford's photos, for where the things in them are.
const LISTING = (JSON.parse(readFileSync("supabase/seed/listings.json", "utf8")) as Listing[]).find(
  (listing) => listing.ListingKey === "SAMPLE-1007",
)!;

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

test("it holds on the newest, then goes round what's on the photo, a hotspot right on the spot, anchored at the photo's foot", async ({
  browser,
}) => {
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  // The newest first, and it stays put for a few seconds.
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry\. .+\. Show it on the photo\.$/);
  await expect(activityOf(home).getByRole("button", { name: "Pause activity" })).toBeVisible();
  const slot = (await activityOf(home).boundingBox())!;
  await tick(page, 2500);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  // Then what else was done on the photo on screen (not what was done on
  // another photo: Al's big windows wait for theirs).
  await tick(page, 1500);
  await expect(lineOf(home)).toHaveAccessibleName(/^Al liked the wall sconces/);

  // A hotspot on the photo, right where the sconces are, and nothing else
  // drawn on it (only to look at: a tap goes to the photo under it).
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  const spot = home.locator("[data-spot-highlight]");
  await expect(spot).toHaveCount(1);
  await expect(spot).toHaveAttribute("aria-hidden", "true");
  const frame = (await home.locator("[data-photo-frame]").filter({ has: page.locator("[data-spot-highlight]") }).boundingBox())!;
  const sconces = LISTING.Media[0].Spots!.find((it) => it.tag === "Wall sconces")!;
  const at = (await spot.boundingBox())!;
  expect(Math.abs(at.x - (frame.x + frame.width * sconces.x))).toBeLessThanOrEqual(3);
  expect(Math.abs(at.y - (frame.y + frame.height * sconces.y))).toBeLessThanOrEqual(3);

  // Round it goes, one at a time, the caption's foot never moving, nor the price.
  const price = (await home.getByRole("button", { name: /^\$[\d,]+/ }).boundingBox())!;
  const lines = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const was = (await lineOf(home).getAttribute("aria-label"))!;
    lines.add(was);
    await tick(page, 4000);
    await expect(lineOf(home)).not.toHaveAttribute("aria-label", was);
    const now = (await activityOf(home).boundingBox())!;
    expect(Math.abs(now.y + now.height - (slot.y + slot.height))).toBeLessThanOrEqual(1);
    expect((await home.getByRole("button", { name: /^\$[\d,]+/ }).boundingBox())!.y).toBe(price.y);
  }
  expect(lines.size).toBeGreaterThanOrEqual(2);
  // Only the one showing is on the page.
  await expect(activityOf(home).getByRole("button", { name: /liked|commented|sent/ })).toHaveCount(1);
});

test("Pause, from the keyboard, stops it for the rest of the visit, on every home, until the tab closes", async ({ browser }) => {
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  const before = await lineOf(home).getAttribute("aria-label");
  // Pause and Play are only for the keyboard: nothing to see until it's on
  // them. Coming in stops the line on this home (so Play shows); Play, then
  // Pause, pauses it for the visit.
  const control = activityOf(home).getByRole("button", { name: /^(Pause|Play) activity$/ });
  expect((await control.boundingBox())!.width).toBeLessThanOrEqual(1);
  await control.focus();
  await expect(control).toHaveAccessibleName("Play activity");
  expect((await control.boundingBox())!.width).toBeGreaterThan(30);
  await page.keyboard.press("Enter");
  await expect(control).toHaveAccessibleName("Pause activity");
  await page.keyboard.press("Enter");
  await expect(control).toHaveAccessibleName("Play activity");
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
  await activityOf(other).getByRole("button", { name: "Play activity" }).focus();
  await page.keyboard.press("Enter");
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

test("it keeps to the photo on screen: on another photo, what was done there, and a tap opens its spot", async ({ browser, page }) => {
  await likeThings(browser, "SAMPLE-1004", FERNHOLLOW, "Cy", [
    [0, ["the evergreens"]],
    [2, ["the natural light"]],
  ]);
  await page.goto("/homes/SAMPLE-1004");
  const home = homeIn(page, FERNHOLLOW);
  await settled(home);
  await expect(home.getByText("Photo 1 of 3")).toBeAttached();
  // On the first photo, nothing about the third.
  await expect(activityOf(home)).not.toContainText("natural light");
  await home.getByRole("button", { name: "Next photo" }).click();
  await home.getByRole("button", { name: "Next photo" }).click();
  await expect(home.getByText("Photo 3 of 3")).toBeAttached();
  await expect(lineOf(home)).toHaveAccessibleName(/^Cy liked the natural light\. .+\. Show it on the photo\.$/);
  await lineOf(home).click();
  const card = home.getByRole("group", { name: "Natural light" });
  await expect(card).toBeVisible();
  // The line steps aside for the card, and is back on it once it's closed.
  await expect(home.locator("[data-photo-caption]")).toBeHidden();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(lineOf(home)).toHaveAccessibleName(/^Cy liked the natural light\./);
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
  await expect(lineOf(home)).toHaveAccessibleName(/liked this\. See the Porchcard\.$/);
  await expect(activityOf(home).getByRole("button", { name: "Play activity" })).toBeVisible();
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(0);

  // On to the second photo, where Al liked the big windows: to that, and
  // nothing from the first photo while this one's on screen.
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
  for (let i = 0; i < 6; i++) {
    await tick(page, 4000);
    expect(await lineOf(home).getAttribute("aria-label")).not.toMatch(/front entry|wall sconces/);
  }
});

test("side by side too, after its rounds it rests on who liked the home", async ({ browser }) => {
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
  await expect(activityOf(home)).toContainText("liked this");
  await expect(lineOf(home)).toHaveAccessibleName(/liked this\. See the Porchcard\.$/);
});

test("a pointer on the line holds it; a card open on the photo holds it, and once it's gone, it goes on", async ({ browser }) => {
  const page = await stillPage(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  await lineOf(home).hover();
  await tick(page, 9000);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  await page.mouse.move(700, 20);
  // A card about a spot, opened on the photo: it waits while it's open.
  // (Out of the card's way meanwhile, and just where it was once it's closed.)
  const card = await pick(home, "the front entry");
  await tick(page, 9000);
  await expect(home.locator("[data-photo-caption]")).toBeHidden();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  await page.mouse.move(700, 20);
  await tick(page, 4000);
  await expect(lineOf(home)).not.toHaveAccessibleName(/^Bo liked the front entry/);

  // A tap on the line opens its spot; after that, it stays put on this home.
  const shown = (await lineOf(home).getAttribute("aria-label"))!;
  await lineOf(home).click();
  const opened = home.locator("[data-spot-card]");
  await expect(opened).toBeVisible();
  await settle(opened);
  await opened.getByRole("button", { name: "Close" }).click();
  await expect(opened).toBeHidden();
  await page.mouse.move(700, 20);
  await expect(activityOf(home).getByRole("button", { name: "Play activity" })).toBeVisible();
  await tick(page, 9000);
  await expect(lineOf(home)).toHaveAttribute("aria-label", shown);
});

test("opened over another page (from someone's profile), it still goes round", async ({ browser }) => {
  // Bo's page: the front entry Bo liked shares its photo with Al's sconces,
  // so there's more than one thing to go round.
  const look = await (await browser.newContext()).newPage();
  await look.goto("/homes/SAMPLE-1007");
  const comments = await openComments(look, homeIn(look, WEXFORD));
  const profile = await comments.getByRole("link", { name: "Bo", exact: true }).first().getAttribute("href");
  expect(profile).toMatch(/^\/people\/[0-9a-f-]{36}$/);
  await look.context().close();
  const page = await (await browser.newContext()).newPage();
  await page.clock.install();
  await page.goto(profile!);
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

test("on a link, what you said is \"You\", and the agent's own words are theirs", async ({ browser }) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "vera@example.com", "Vera Agent");
  const { url, dashboardUrl } = await createShare(agent, ["719 Saltmarsh"], ["Kit"]);
  const kit = await signedIn(browser);
  await kit.goto(url);
  await toFirstHome(kit);
  const home = homeIn(kit, SALTMARSH);
  await settled(home);
  const chat = await openComments(kit, home);
  await chat.getByLabel("Add a comment").fill("Is the roof new?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText("Is the roof new?")).toBeVisible();
  await kit.keyboard.press("Escape");
  // Hers, as her likes are: "You". (Her face starts it, but on a link it's
  // nobody's way to a profile, hers included.)
  await expect(lineOf(home)).toHaveAccessibleName(/^You commented: Is the roof new\? /);
  await expect(activityOf(home).getByRole("link")).toHaveCount(0);

  // The agent answers from their dashboard, and on their own link it's
  // theirs: "You".
  await agent.goto(dashboardUrl);
  const panel = agent.getByRole("region", { name: SALTMARSH });
  await panel.getByLabel("Reply to your client").fill("New in 2021.");
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText("New in 2021.")).toBeVisible();
  await agent.goto(url);
  const own = homeIn(agent, SALTMARSH);
  await own.scrollIntoViewIfNeeded();
  await settled(own);
  await expect(lineOf(own)).toHaveAccessibleName(/^You commented: New in 2021\. /);

  // To Kit, the same words are her agent's.
  await kit.reload();
  await toFirstHome(kit);
  await settled(home);
  await expect(lineOf(home)).toHaveAccessibleName(/^Vera \(your agent\) commented: New in 2021\. /);
  await expect(activityOf(home).getByRole("link")).toHaveCount(0);
});

test("the line starts with the face of whoever did it, and that face opens their profile", async ({ browser }) => {
  const page = await stillPage(browser);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  await settled(home);
  await expect(lineOf(home)).toHaveAccessibleName(/^Bo liked the front entry/);
  // Like a profile picture: Bo's, just before the words, on the caption.
  const face = activityOf(home).getByRole("link", { name: "Bo's profile" });
  await expect(face).toHaveText("B");
  const [faceBox, lineBox] = await Promise.all([face.boundingBox(), lineOf(home).boundingBox()]);
  expect(faceBox!.x + faceBox!.width).toBeLessThanOrEqual(lineBox!.x);
  expect(faceBox!.width).toBeGreaterThanOrEqual(32);
  // No Pause or Play to see (they're for the keyboard).
  expect((await activityOf(home).getByRole("button", { name: /activity$/ }).boundingBox())!.width).toBeLessThanOrEqual(1);
  await face.click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(page.locator("h1").first()).toContainText("Bo");
});

test("isolation: what's private on an agent's link never reaches the public line, by words, name, pass or spot", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const SECRET = "Offer 30k under, they sound desperate.";
  const SPOT_SECRET = "That corner needs a total redo.";
  const agent = await signInAgent(browser, "tilly@example.com", "Tilly Agent");
  const { url } = await createShare(agent, ["719 Saltmarsh"], ["Yara"]);
  const yara = await signedIn(browser);
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
  // Where it was left, exactly ("@80,45"), as the link has it: on her card
  // in the link's comments.
  const chat = await openComments(yara, yaraHome);
  const spot = chat.getByRole("listitem").filter({ hasText: SPOT_SECRET }).locator('[data-spot-tag^="@"]');
  await expect(spot).toHaveCount(1);
  const spotTag = (await spot.getAttribute("data-spot-tag"))!;
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
    for (const hotspot of await home.locator("[data-spot-highlight]").all()) {
      const drawn = (await hotspot.boundingBox())!;
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
  const zoe = await signedIn(browser);
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
  const zoeChat = await openComments(zoe, zoeHome);
  const spot = zoeChat.getByRole("listitem").filter({ hasText: WORDS }).locator('[data-spot-tag^="@"]');
  await expect(spot).toHaveCount(1);
  const spotTag = (await spot.getAttribute("data-spot-tag"))!;
  await zoe.keyboard.press("Escape");

  // In public: what she said, by "A buyer", on no spot at all.
  const page = await (await browser.newContext()).newPage();
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, SALTMARSH);
  await settled(home);
  await expect(activityOf(home)).toContainText(`A buyer commented\u201c${WORDS}\u201d`);
  expect(await lineOf(home).getAttribute("aria-label")).toMatch(/^A buyer commented: Love how the light falls on this side\. .+\. See it in the comments\.$/);
  await expect(home.locator(`[data-spot-tag="${spotTag}"]`)).toHaveCount(0);
  const sheet = await openComments(page, home);
  await expect(sheet.getByText(WORDS)).toBeVisible();
  await expect(sheet.getByRole("button", { name: /: show it$/ })).toHaveCount(0);
  await expect(sheet.getByRole("listitem").filter({ hasText: WORDS }).locator("[data-spot-tag]")).toHaveCount(0);
  const html = await (await page.request.get("/homes/SAMPLE-1008")).text();
  expect(html).toContain(WORDS);
  expect(html).not.toContain(spotTag);
});
