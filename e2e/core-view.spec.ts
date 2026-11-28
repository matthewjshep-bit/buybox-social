import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { atRest, signedIn,
  commentIn,
  commentsOf,
  createShare,
  heartOf,
  homeIn,
  joinAs,
  likeInPhoto,
  openMore,
  pick,
  settle,
  signInAgent,
  tapPhoto,
} from "./helpers";
import { takeBackAll } from "./own-page";

// The phone sizes the core view is drawn for (the project's own is a Pixel 7).
const IPHONE = { viewport: { width: 393, height: 660 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SMALL = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ON_ITS_SIDE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SMALL_ON_ITS_SIDE = { viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const HEADER = 56;
// Where the chrome over the top ends: the header, and a little under it.
const CHROME_FOOT = 60;
// From a tablet up, the head, the photo and the words are one column in the
// middle of the frame, this wide (44rem).
const COLUMN = 704;
// The facts row of the head; above it, when there's anything to say (whose
// take, who sent it, why it was picked, or who listed it), a row of 56.
const FACTS_ROW = 64;
const WHY_ROW = 56;

const phone = async (browser: Browser, options?: typeof IPHONE) => (await browser.newContext(options)).newPage();

// Waits until a home has snapped all the way into place.
const settled = async (home: Locator) => {
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
};

const photoOf = (home: Locator) => home.locator("[data-photo-frame] img").first();
const box = async (locator: Locator) => (await locator.boundingBox())!;

// A real touch swipe, sideways across the screen at height `y`.
async function swipeLeft(page: Page, y: number) {
  const { width } = page.viewportSize()!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", x?: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: x === undefined ? [] : [{ x, y }] });
  await touch("touchStart", width * 0.8);
  for (let i = 1; i <= 10; i++) await touch("touchMove", width * 0.8 - i * width * 0.06);
  await touch("touchEnd");
}

// The price, the size and the address: plain words, never buttons.
const priceOf = (home: Locator) => home.locator('[data-fact="Price"]');
const sizeOf = (home: Locator) => home.locator('[data-fact="Size"] [aria-hidden]');
// The row of things to do with the home, under its photo.
const actionsOf = (home: Locator) => home.locator("[data-actions]");
// How tall the head is: the facts row, and the "Why it's here" row above it
// when the home has one.
const headHeightOf = async (home: Locator) =>
  FACTS_ROW + ((await home.locator("[data-home-head]").getByRole("region", { name: "Why it's here" }).count()) ? WHY_ROW : 0);
// On a wide frame: no wider than the column, in the middle of the frame.
const inTheColumn = (at: { x: number; width: number }, frameWidth: number) => {
  expect(at.width).toBeLessThanOrEqual(COLUMN + 1);
  expect(Math.abs(at.x + at.width / 2 - frameWidth / 2)).toBeLessThanOrEqual(1);
};

test("on a phone, the photo has most of the screen, whole, in the middle of its room; under it the row of things to do and a few lines of plain words, the same on every home", async ({ browser }) => {
  // (Now the way a post reads: who and why, then the price, the size and the
  // address in a head above the photo, the photo whole under it, then the
  // X, the heart, Comments, Share, Save and More in one row, and the latest
  // comments under that, down to the comment bar.)
  for (const options of [undefined, IPHONE, SMALL]) {
    const page = await phone(browser, options);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/homes/SAMPLE-1009");
    const homes = page.getByRole("article");
    const tops: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < 3; i++) {
      const home = homes.nth(i);
      if (i > 0) await page.keyboard.press("ArrowDown");
      await settled(home);
      const head = await box(home.locator("[data-home-head]"));
      const photo = await box(photoOf(home));
      const words = await box(home.locator("[data-words]"));
      tops.push(words.y);
      heights.push(words.height);
      const { width, height } = page.viewportSize()!;
      // The head right under the chrome: its facts row always the same
      // height (with a row of who and why above it, when there's anything to
      // say), and the photo right under the head: never under either.
      expect(Math.abs(head.y - CHROME_FOOT)).toBeLessThanOrEqual(1);
      expect(Math.abs(head.height - (await headHeightOf(home)))).toBeLessThanOrEqual(1);
      const facts = await box(home.getByRole("button", { name: "About this home" }));
      expect(Math.abs(facts.height - FACTS_ROW)).toBeLessThanOrEqual(1);
      expect(Math.abs(facts.y + facts.height - (head.y + head.height))).toBeLessThanOrEqual(1);
      expect(Math.abs(photo.y - (head.y + head.height))).toBeLessThanOrEqual(1);
      // As wide as the screen, and whole, never cropped: nothing of it past
      // the screen's sides (a flyer's words run to its edges). (The sample
      // homes' first photos are four by three.)
      expect(photo.width).toBeGreaterThanOrEqual(width - 1);
      expect(photo.height).toBeGreaterThanOrEqual(220);
      expect(Math.abs(photo.height - width * 0.75)).toBeLessThanOrEqual(2);
      expect(photo.x).toBeGreaterThanOrEqual(-1);
      expect(photo.x + photo.width).toBeLessThanOrEqual(width + 1);
      // The words start at the photo's foot, none of them on it, and run to
      // the bottom of the screen.
      const foot = photo.y + photo.height;
      expect(Math.abs(words.y - foot)).toBeLessThanOrEqual(1);
      expect(Math.abs(words.y + words.height - height)).toBeLessThanOrEqual(1);
      // First under the photo, the X and the heart, in one row with the rest
      // of what there is to do, whole on the screen: nothing sits on the photo.
      const row = await box(actionsOf(home));
      expect(row.y).toBeGreaterThanOrEqual(foot - 1);
      expect(row.y - foot).toBeLessThanOrEqual(12);
      for (const button of [home.getByRole("button", { name: "Pass on this home" }), heartOf(home)]) {
        await expect(button).toBeInViewport({ ratio: 1 });
        expect((await box(button)).y).toBeGreaterThanOrEqual(foot - 1);
      }
      // What people said about the home is in that room, under the row,
      // never on the photo: no line going round over the photo's foot any more.
      const latest = await box(home.getByRole("group", { name: "Latest comments" }));
      expect(latest.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
      expect(latest.y + latest.height).toBeLessThanOrEqual(words.y + words.height + 1);
      await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
      await expect(home.locator("[data-photo-caption]")).toHaveCount(0);
      await expect(home.getByText("Tap the photo to like or comment")).toHaveCount(0);
      // No column of round buttons on the photo: what there is to do is in the row under it.
      await expect(home.locator("[data-rail]")).toBeHidden();
      // Plain words, not chips to tap: the price, then "4 bd · 3 ba · 2,780 sq
      // ft" (a lot has no "0 bd"), the address, all in the head above the
      // photo. Who listed it waits in About this home, closed until asked.
      await expect(priceOf(home)).toHaveText(/^\$[\d,]+$/);
      await expect(sizeOf(home)).toHaveText(/^(\d+ bd · )?(\d+ ba · )?[\d,]+ sq ft$/);
      await expect(home.getByRole("button", { name: /^\$[\d,]+/ })).toHaveCount(0);
      await expect(home.getByRole("button", { name: /^\d+ (bd|beds?)\b/ })).toHaveCount(0);
      await expect(home.locator("[data-fact]").filter({ has: page.locator("button") })).toHaveCount(0);
      // (With nothing else to say about why it's here, the row above the
      // facts says who listed it: one line, plain words. The rest waits.)
      const why = home.locator("[data-home-head]").getByRole("region", { name: "Why it's here" });
      if (await why.count()) {
        const at = await box(why);
        expect(Math.abs(at.height - WHY_ROW)).toBeLessThanOrEqual(1);
        expect(at.y + at.height).toBeLessThanOrEqual(facts.y + 1);
      }
      await expect(home.getByRole("region", { name: "About this home" }).getByText(/^Listed by/)).toBeHidden();
      await expect(home.getByRole("region", { name: "About this home" })).toBeHidden();
      await expect(home.getByRole("button", { name: "About this home" })).toHaveAttribute("aria-expanded", "false");
      for (const fact of [priceOf(home), sizeOf(home), home.locator('[data-fact="Address"]')]) {
        const at = await box(fact);
        expect(at.y).toBeGreaterThanOrEqual(head.y - 1);
        expect(at.y + at.height).toBeLessThanOrEqual(photo.y + 1);
        expect(await fact.evaluate((el) => el.closest("button"))).toBeNull();
      }
      // The comment bar is the last thing, at the bottom.
      const bar = await box(home.getByRole("button", { name: "Add a comment…" }));
      expect(bar.y + bar.height).toBeGreaterThan(height - 20);
    }
    // No jump from home to home.
    for (const top of tops) expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(1);
    for (const height of heights) expect(Math.abs(height - heights[0])).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
    await page.context().close();
  }
});

test("under the photo, one row: the X, the heart, Comments with its count, then Share, Save and More; under the words, the comment bar alone; nothing on the photo", async ({
  page,
}) => {
  await page.goto("/homes/SAMPLE-1013");
  const home = homeIn(page, "5902 Lakeview Terrace SE");
  await settled(home);
  const row = actionsOf(home);
  const names = [
    "Pass on this home",
    /^Like 5902 Lakeview Terrace SE/,
    /^Comments/,
    "Share 5902 Lakeview Terrace SE",
    "Save 5902 Lakeview Terrace SE",
    "More options",
  ];
  await expect(row.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(row.getByRole("button").nth(i)).toHaveAccessibleName(name);
  // (The Porchcard is an agent's, in a client's homes: not here.)
  await expect(home.getByRole("button", { name: "Feedback" })).toHaveCount(0);
  // One row, left to right, each a fingertip tall; the X first, the heart
  // beside it, the rest to the right.
  const buttons = await Promise.all(names.map((_, i) => box(row.getByRole("button").nth(i))));
  for (const [i, button] of buttons.entries()) {
    expect(Math.abs(button.y + button.height / 2 - (buttons[0].y + buttons[0].height / 2))).toBeLessThanOrEqual(1);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.width).toBeGreaterThanOrEqual(44);
    if (i > 0) expect(button.x).toBeGreaterThan(buttons[i - 1].x + buttons[i - 1].width - 1);
  }
  // Right under the photo: no empty band between them, and none of them on it.
  const frame = (await home.locator("[data-photo-frame]").first().boundingBox())!;
  expect(buttons[0].y).toBeGreaterThanOrEqual(frame.y + frame.height - 1);
  expect(buttons[0].y - (frame.y + frame.height)).toBeLessThanOrEqual(12);
  for (const name of ["Pass on this home", "Share 5902 Lakeview Terrace SE"]) {
    await expect(home.getByRole("button", { name })).toHaveCount(1);
  }
  await expect(heartOf(home)).toHaveCount(1);
  await expect(home.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  // Then the latest comments, and at the foot the comment bar: one button,
  // the whole row, and nothing else in it.
  const bar = home.locator("[data-bar-row]");
  await expect(bar.getByRole("button")).toHaveCount(1);
  await expect(bar.getByRole("button")).toHaveAccessibleName("Add a comment…");
  const latest = await box(home.getByRole("group", { name: "Latest comments" }));
  const barBox = await box(bar);
  expect(latest.y).toBeGreaterThanOrEqual(buttons[0].y + buttons[0].height - 1);
  expect(barBox.y).toBeGreaterThanOrEqual(latest.y + latest.height - 1);
  expect(barBox.height).toBeGreaterThanOrEqual(44);
  // The count reads the comments, for anyone; while they're open the row
  // steps aside, and Escape brings it back.
  await row.getByRole("button", { name: /^Comments/ }).click();
  await expect(commentsOf(home)).toBeVisible();
  await expect(row).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(commentsOf(home)).toBeHidden();
  await expect(row).toBeVisible();
});

test("photos say which room and which of how many, in place of dots", async ({ page }) => {
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await settled(home);
  await expect(home.getByText("Exterior · 1 of 4", { exact: true })).toBeVisible();
  const photo = await box(photoOf(home));
  await swipeLeft(page, photo.y + photo.height / 2);
  await expect(home.getByText("Living room · 2 of 4", { exact: true })).toBeVisible();
  await expect(home.getByText("Photo 2 of 4")).toBeAttached();
  // No dots.
  await expect(home.locator(".h-1.rounded-full")).toHaveCount(0);
  // The arrows are a fingertip wide, on the photo (with no buttons down the
  // side on an upright phone, nothing pushes them up off it), and they turn it.
  const arrow = home.getByRole("button", { name: "Next photo" });
  const next = await box(arrow);
  expect(next.width).toBeGreaterThanOrEqual(44);
  const shown = await box(photoOf(home));
  expect(next.y).toBeGreaterThanOrEqual(shown.y);
  expect(next.y + next.height).toBeLessThanOrEqual(shown.y + shown.height);
  await expect(arrow).toBeInViewport({ ratio: 1 });
  await arrow.click();
  await expect(home.getByText("Photo 3 of 4")).toBeAttached();
});

test("a tap near the top of the photo on an iPhone opens a card below the header, and it closes", async ({ browser }) => {
  const page = await phone(browser, IPHONE);
  await page.goto("/homes/SAMPLE-1010");
  const home = homeIn(page, "88 Heron Bluff Rd");
  await settled(home);
  // Signed out, the tap asks them to sign up first; then the card opens.
  await tapPhoto(home, "Small red cabin on a grassy meadow", 0.3, 0.12);
  await joinAs(page, "Hollis");
  const card = home.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  const header = await box(page.getByRole("navigation", { name: "Main" }));
  expect((await box(card)).y).toBeGreaterThanOrEqual(header.y + header.height);
  const close = card.getByRole("button", { name: "Close" });
  expect((await box(close)).width).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(card).toBeHidden();
});

test("a phone on its side keeps the words over the photo, the description to one line", async ({ browser }) => {
  const page = await phone(browser, ON_ITS_SIDE);
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, "719 Saltmarsh Ln");
  await settled(home);
  const photo = await box(photoOf(home));
  // The photo fills the height; the words go over it (no head above it here).
  expect(photo.height).toBeGreaterThan(385);
  await expect(home.locator("[data-home-head]")).toBeHidden();
  const words = home.locator("[data-words]");
  expect((await box(words)).y).toBeLessThan(photo.y + photo.height);
  // (The box it's clamped in: the words run on, unseen, past it.)
  const caption = await box(words.getByText(/^A blue cottage behind a white picket fence/).locator("xpath=.."));
  expect(caption.height).toBeLessThanOrEqual(25);
  // No room for labels on the photo here, and the arrows stay off the words
  // (a swipe turns the photos).
  await expect(home.getByText("Exterior · 1 of 2", { exact: true })).toBeHidden();
  await expect(home.getByRole("button", { name: "Next photo" })).toHaveCSS("opacity", "0");
  await expect(home.getByRole("button", { name: "Next photo" })).toHaveCSS("pointer-events", "none");
  // The buttons stay clear of the header.
  expect((await box(heartOf(home))).y).toBeGreaterThanOrEqual(HEADER);

  // The price is just words here too.
  await expect(priceOf(home)).toBeVisible();
  await expect(home.getByRole("button", { name: /^\$[\d,]+/ })).toHaveCount(0);

  // "more", right after the line, opens the rest of what the home is over
  // the photo, from under the chrome (no head to hang it from here); Escape
  // puts it away.
  const more = words.getByRole("button", { name: "more", exact: true });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  expect(await more.getAttribute("aria-haspopup")).toBeNull();
  const about = home.getByRole("region", { name: "About this home" });
  await expect(about).toBeHidden();
  await more.click();
  await expect(about).toBeVisible();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await settle(about);
  expect(Math.round((await box(about)).y)).toBe(CHROME_FOOT);
  await expect(about.getByText(/^A blue cottage behind a white picket fence.+\.$/)).toBeVisible();
  await expect(about.getByText(/^Listed by/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();

  // On its side there's no head: the comments unfurl from just under the
  // chrome to the foot, the comment box and who sees it wholly on screen.
  await home.getByRole("button", { name: /^Comments/ }).click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(CHROME_FOOT);
  await expect(sheet.getByRole("button", { name: /^(Expand|Shrink) comments$/ })).toHaveCount(0);
  {
    const at = await box(sheet.getByLabel("Add a comment"));
    expect(at.y + at.height).toBeLessThanOrEqual(390);
  }
  expect((await box(sheet.locator("[data-thread-scroll]"))).height).toBeGreaterThanOrEqual(100);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // A smaller phone on its side: the buttons go in two columns, under the header.
  const small = await phone(browser, SMALL_ON_ITS_SIDE);
  await small.goto("/homes/SAMPLE-1008");
  const smallHome = homeIn(small, "719 Saltmarsh Ln");
  await settled(smallHome);
  expect((await box(heartOf(smallHome))).y).toBeGreaterThanOrEqual(HEADER);
  expect((await box(smallHome.getByRole("button", { name: "More options" }))).y).toBeGreaterThan(
    (await box(heartOf(smallHome))).y,
  );
});

test("the head above the photo opens all of what the home is, over the photo: the description whole, every detail and who listed it; More no longer has it", async ({
  browser,
}) => {
  const page = await phone(browser, IPHONE);
  await page.goto("/homes/SAMPLE-1001");
  const home = homeIn(page, "4127 Larkmoor Ave NE");
  await settled(home);
  const { width, height } = page.viewportSize()!;
  // The head is one button, the whole row, that says what it opens; no
  // "more" after a line of the description any more, and no sheet from it.
  const head = home.locator("[data-home-head]");
  const open = head.getByRole("button", { name: "About this home" });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  expect(await open.getAttribute("aria-haspopup")).toBeNull();
  await expect(home.getByRole("button", { name: "more", exact: true })).toHaveCount(0);
  const row = await box(open);
  expect(row.height).toBeGreaterThanOrEqual(44);
  expect(row.width).toBeGreaterThanOrEqual(width - 1);
  // Closed, the words wait, out of sight: the description, who listed it.
  // (With nothing else to say about why it's here, who listed it is the one
  // line above the facts: plain words there, the rest in About this home.)
  const about = home.getByRole("region", { name: "About this home" });
  await expect(about).toBeHidden();
  await expect(home.getByText(/^A warm Ravenna-area Craftsman/)).toBeHidden();
  await expect(about.getByText(/^Listed by/)).toBeHidden();
  const why = head.getByRole("region", { name: "Why it's here" });
  await expect(why).toHaveText(/^Listed by .+ · .+$/);
  await expect(why.getByRole("button")).toHaveCount(0);
  expect((await box(why)).y + (await box(why)).height).toBeLessThanOrEqual(row.y + 1);
  // A tap opens it right under the head, over the photo (which stays put),
  // never more than most of the screen.
  const photo = await box(photoOf(home));
  await open.click();
  await expect(about).toBeVisible();
  await expect(open).toHaveAttribute("aria-expanded", "true");
  // (Once it has come to rest.)
  await settle(about);
  const card = await box(about);
  expect(Math.abs(card.y - (row.y + row.height))).toBeLessThanOrEqual(1);
  expect(card.y).toBeLessThan(photo.y + photo.height);
  expect(card.height).toBeLessThanOrEqual(height * 0.6 + 1);
  expect(Math.abs((await box(photoOf(home))).y - photo.y)).toBeLessThan(1);
  // The description whole, who listed it, every fact.
  await expect(about.getByText(/^A warm Ravenna-area Craftsman.+a short walk away\.$/)).toBeVisible();
  await expect(about.getByText(/^Listed by .+ · .+$/)).toBeVisible();
  for (const label of ["Price", "Bedrooms", "Bathrooms", "Square feet", "Price per sq ft"]) {
    await expect(about.getByText(label, { exact: true })).toBeVisible();
  }
  // Escape puts it away, the keyboard back on the head; a tap on the head
  // again opens and closes it; moving on to another home closes it too.
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await expect(about).toBeVisible();
  await open.click();
  await expect(about).toBeHidden();
  await open.click();
  await expect(about).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await settled(page.getByRole("article").nth(1));
  await expect(about).toBeHidden();
  await page.keyboard.press("ArrowUp");
  await settled(home);
  await expect(about).toBeHidden();
  // More has what there is to do with the home, not what it is: no
  // description, no "Listed by", no Porchcard.
  const sheet = await openMore(page, home);
  await expect(sheet.getByText(/^A warm Ravenna-area Craftsman/)).toHaveCount(0);
  await expect(sheet.getByText(/^Listed by/)).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Photo only" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Feedback" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.context().close();
});

test("a signed-out visitor tapping the photo is asked to sign up, with no card to like or comment first; after, the card opens", async ({
  page,
}) => {
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await settled(home);
  // The line under the photo never says a tap likes or comments, for them.
  await expect(home.getByText("Tap the photo to like or comment")).toHaveCount(0);
  const photo = await box(photoOf(home));
  await page.touchscreen.tap(photo.x + photo.width * 0.6, photo.y + photo.height * 0.5);
  const join = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(join).toBeVisible();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "This spot" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Like this spot/ })).toHaveCount(0);
  // The whole sheet shows, above the foot of the screen, keyboard down.
  // (Once it has risen into place.)
  await settle(join);
  const sheet = await box(join);
  expect(sheet.y).toBeGreaterThanOrEqual(0);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await expect(join.getByRole("button", { name: "Continue" })).toBeInViewport({ ratio: 1 });
  // Not now: nothing opens.
  await join.getByRole("button", { name: "Not now" }).click();
  await expect(join).toBeHidden();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // The comment bar asks the same, before anything else.
  await home.getByRole("button", { name: "Add a comment…" }).click();
  await expect(join).toBeVisible();
  await expect(commentsOf(home)).toBeHidden();
  await join.getByRole("button", { name: "Not now" }).click();
  // Signed up from a tap on the photo, the card for that spot opens.
  await page.touchscreen.tap(photo.x + photo.width * 0.6, photo.y + photo.height * 0.5);
  await joinAs(page, "Tamsin");
  await expect(home.locator("[data-spot-card]")).toBeVisible();
});

test("signed out, a quick second tap doesn't shut the sign-up sheet that the first opened; Save asks there too, then saves", async ({
  page,
}) => {
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await settled(home);
  const join = page.getByRole("dialog", { name: "Sign up to like and comment" });
  const heart = await box(heartOf(home));
  const photo = await box(photoOf(home));
  // The heart, then straight away a tap above the sheet it opened: it stays.
  await page.touchscreen.tap(heart.x + heart.width / 2, heart.y + heart.height / 2);
  await page.touchscreen.tap(photo.x + photo.width / 2, photo.y + 20);
  await page.waitForTimeout(600);
  await expect(join).toBeVisible();
  // A moment later, a tap above it puts it away, and nothing is liked.
  await page.touchscreen.tap(photo.x + photo.width / 2, photo.y + 20);
  await expect(join).toBeHidden();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "false");
  // Save asks to sign up right here (not off to another page), then saves.
  await home.getByRole("button", { name: "Save 1880 Tamsen Ridge Pl SE" }).click();
  await expect(join).toBeVisible();
  await expect(page).toHaveURL(/\/homes\/SAMPLE-1002/);
  await joinAs(page, "Sully");
  const saved = home.getByRole("button", { name: "Saved 1880 Tamsen Ridge Pl SE" });
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  // (Taken back.)
  await saved.click();
  await expect(home.getByRole("button", { name: "Save 1880 Tamsen Ridge Pl SE" })).toHaveAttribute("aria-pressed", "false");
});

test("a signed-out double-tap asks to sign up once, then the home is liked, and the page carries on", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await settled(home);
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "false");
  const photo = await box(photoOf(home));
  await photoOf(home).dblclick({ position: { x: photo.width * 0.6, y: photo.height * 0.3 } });
  const join = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(join).toBeVisible();
  await joinAs(page, "Dora");
  // Liked, and not asked again (once in, the like goes through, once).
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  await expect(join).toBeHidden();
  // Still answering: nothing left going round and round.
  expect(await Promise.race([page.evaluate(() => "ok"), new Promise((done) => setTimeout(() => done("stuck"), 5000))])).toBe("ok");
  await home.getByRole("button", { name: /^Comments/ }).click();
  await expect(commentsOf(home)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("signed out, a comment's spot shows its photo and asks to sign up, with no card to like or comment first", async ({
  page,
  browser,
}) => {
  // Someone signed in says something about a spot on the porch.
  const sayer = await signedIn(browser, `sage.${Date.now()}@example.com`, "Sage");
  await sayer.goto("/homes/SAMPLE-1001");
  const theirs = homeIn(sayer, "4127 Larkmoor Ave NE");
  await settled(theirs);
  const porch = await pick(theirs, "the covered porch");
  await porch.getByRole("button", { name: /^Comment on the covered porch/ }).click();
  const box = commentsOf(theirs).getByLabel("Comment on the covered porch");
  await box.fill("Room for a swing out there.");
  await commentsOf(theirs).getByRole("button", { name: "Post", exact: true }).click();
  await expect(commentsOf(theirs)).toBeHidden();

  await page.goto("/homes/SAMPLE-1001");
  const home = homeIn(page, "4127 Larkmoor Ave NE");
  await settled(home);
  // Anyone can read the comments.
  await home.getByRole("button", { name: /^Comments/ }).click();
  const comments = commentsOf(home);
  await expect(comments).toBeVisible();
  // (A comment on a spot names it: a button that shows it on the photo.)
  const chip = comments.getByRole("button", { name: /^About .+: show it$/ }).first();
  await chip.click();
  // The photo, and signing up: never the spot's card first.
  const join = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(join).toBeVisible();
  await expect(comments).toBeHidden();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Like this spot/ })).toHaveCount(0);
  // Not now: just the photo.
  await join.getByRole("button", { name: "Not now" }).click();
  await expect(join).toBeHidden();
  await page.waitForTimeout(400);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // Signed up from there, the spot's card opens.
  await home.getByRole("button", { name: /^Comments/ }).click();
  await chip.click();
  await joinAs(page, "Rowan");
  await expect(home.locator("[data-spot-card]")).toBeVisible();
  // (Taken back, so no later spec counts it.)
  await takeBackAll(sayer, "4127 Larkmoor Ave NE");
  await sayer.context().close();
});

test("Photo only, from More, hides everything on the home until you ask or move on", async ({ page }) => {
  await page.goto("/homes/SAMPLE-1011");
  const home = homeIn(page, "16420 NE Alder Crest Way");
  await settled(home);
  const before = await box(photoOf(home));
  const price = priceOf(home);

  let more = await openMore(page, home);
  await more.getByRole("button", { name: "Photo only" }).click();
  await expect(more).toBeHidden();
  await expect(price).toBeHidden();
  await expect(home.getByRole("button", { name: /^Comments/ })).toBeHidden();
  await expect(home.getByRole("button", { name: "Add a comment…" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Porchcard" })).toBeHidden();
  // One way back, at the foot of the photo, where the keyboard now is.
  const back = home.getByRole("button", { name: "Show everything" });
  await expect(back).toBeFocused();
  // The photo, whole, in the middle of the screen (not over an empty band
  // where the words were).
  const { height } = page.viewportSize()!;
  await expect.poll(async () => Math.abs((await box(photoOf(home))).y + (await box(photoOf(home))).height / 2 - height / 2)).toBeLessThanOrEqual(2);
  const during = await box(photoOf(home));
  const pill = await box(back);
  expect(during.y + during.height - (pill.y + pill.height)).toBeGreaterThanOrEqual(0);
  expect(during.y + during.height - (pill.y + pill.height)).toBeLessThanOrEqual(16);
  // A tap on the photo is just a look: no card now, and none waiting.
  await page.mouse.click(during.x + during.width * 0.3, during.y + during.height * 0.4);
  await page.waitForTimeout(600);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await back.press("Enter");
  await expect(price).toBeVisible();
  await expect(back).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // The keyboard goes back to More, and the photo back to its place.
  await expect(home.getByRole("button", { name: "More options" })).toBeFocused();
  await expect.poll(async () => Math.abs((await box(photoOf(home))).y - before.y)).toBeLessThan(1);

  // Moving on to another home brings everything back.
  more = await openMore(page, home);
  await more.getByRole("button", { name: "Photo only" }).click();
  await expect(price).toBeHidden();
  await page.keyboard.press("ArrowDown");
  const next = page.getByRole("article").nth(1);
  await settled(next);
  await expect(priceOf(next)).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await settled(home);
  await expect(price).toBeVisible();
});

test("a sheet with nothing under it stays clear of an iPhone's home bar, and its link takes a fingertip", async ({
  browser,
}) => {
  const page = await phone(browser, { ...IPHONE, viewport: { width: 393, height: 852 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, bottom: 34, left: 0, right: 0 } });
  await page.goto("/homes/SAMPLE-1001");
  const home = homeIn(page, "4127 Larkmoor Ave NE");
  await settled(home);
  const more = await openMore(page, home);
  await settle(more);
  // (About the home comes first: the last of it scrolls up clear of the home
  // bar, scrolled all the way down, as a thumb would.)
  const map = more.getByRole("link", { name: "See it on the map" });
  await map.evaluate((el) => {
    const scroller = el.closest<HTMLElement>(".overflow-y-auto")!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  const last = await box(map);
  expect(last.y + last.height).toBeLessThanOrEqual(852 - 34 + 1);
  expect(last.height).toBeGreaterThanOrEqual(44);
});

test("one person tapping three things doesn't make a home trending", async ({ page }) => {
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, "3518 Wexford Ave N");
  await settled(home);
  await heartOf(home).click();
  await joinAs(page, "Tess");
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  const garage = await likeInPhoto(home, "the garage");
  await garage.getByRole("button", { name: "Close" }).click();
  await likeInPhoto(home, "the wall sconces");
  await page.reload();
  await settled(home);
  await expect(home.getByRole("button", { name: "Like 3518 Wexford Ave N, 1 like" })).toBeVisible();
  await expect(home.getByText("Trending")).toHaveCount(0);
});

test("nothing anyone liked is drawn on the photo: the line at its foot says who and what, with a hotspot right there", async ({
  page,
  browser,
}) => {
  const PHOTO = "Dark modern home with wood accents and an open courtyard";
  await page.goto("/homes/SAMPLE-1013");
  const home = homeIn(page, "5902 Lakeview Terrace SE");
  await settled(home);
  const photo = await box(home.getByRole("img", { name: PHOTO }));
  // (Signed out: signing up comes first, then the card for where she tapped.)
  await tapPhoto(home, PHOTO, 0.3, 0.5);
  await joinAs(page, "Ines");
  const card = home.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Like / }).click();
  await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  // Kept: back from the server, her home counts the like, under the photo
  // and on its heart. (Saved, so, before anyone else looks.)
  await page.reload();
  await settled(home);
  await expect(heartOf(home)).toHaveAccessibleName("Like 5902 Lakeview Terrace SE, 1 like");
  await expect(home.getByRole("group", { name: "Latest comments" })).toContainText("1 like");
  // No heart, pin or count stays on the photo, even for her.
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  await expect(home.getByRole("button", { name: /: 1 like$/ })).toHaveCount(0);

  // Someone else: just the photo, nothing drawn on it or going round over its
  // foot. Under it, the home counts her like, and so do the comments: how
  // many, never a row of who liked what.
  const other = await phone(browser);
  await other.goto("/homes/SAMPLE-1013");
  const theirs = homeIn(other, "5902 Lakeview Terrace SE");
  await settled(theirs);
  await expect(theirs.locator("[data-pin], [data-pins-toggle], [data-spot-highlight]")).toHaveCount(0);
  await expect(theirs.getByRole("button", { name: /: 1 like$/ })).toHaveCount(0);
  await expect(theirs.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  await expect(theirs.locator("[data-photo-caption]")).toHaveCount(0);
  const theirPhoto = await box(theirs.getByRole("img", { name: PHOTO }));
  const latest = theirs.getByRole("group", { name: "Latest comments" });
  await expect(latest).toContainText("1 like");
  expect((await box(latest)).y).toBeGreaterThanOrEqual(theirPhoto.y + theirPhoto.height - 1);
  await theirs.getByRole("button", { name: /^Comments/ }).click();
  const comments = commentsOf(theirs);
  await expect(comments).toBeVisible();
  await expect(comments.getByText(/^1 like$/)).toBeVisible();
  await expect(comments.getByRole("listitem").filter({ hasText: /Ines/ })).toHaveCount(0);
  await expect(comments.locator("[data-spot-tag]")).toHaveCount(0);
  expect(photo.width).toBeGreaterThan(0);
});

test("on a desktop, the home reads as on a phone, in one column down the middle: the head, the photo whole, the row of things to do and the comments under it", async ({
  browser,
}) => {
  const page = await phone(browser, DESKTOP);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await settled(home);
  const { width, height } = page.viewportSize()!;

  // No panel beside the photo any more: the head, the photo and the words
  // are one column, no wider than a phone's would be stretched, in the
  // middle of the window, the head right under the chrome.
  await expect(home.locator("[data-split]")).toHaveCount(0);
  const head = await box(home.locator("[data-home-head]"));
  const photo = await box(photoOf(home));
  const words = await box(home.locator("[data-words]"));
  for (const part of [head, photo, words]) inTheColumn(part, width);
  expect(Math.abs(head.y - CHROME_FOOT)).toBeLessThanOrEqual(1);
  expect(Math.abs(head.height - (await headHeightOf(home)))).toBeLessThanOrEqual(1);
  // The photo whole, four by three, right under the head; the words from
  // its foot to the foot of the window.
  expect(Math.abs(photo.y - (head.y + head.height))).toBeLessThanOrEqual(1);
  expect(Math.abs(photo.height - photo.width * 0.75)).toBeLessThanOrEqual(2);
  const foot = photo.y + photo.height;
  expect(Math.abs(words.y - foot)).toBeLessThanOrEqual(1);
  expect(Math.abs(words.y + words.height - height)).toBeLessThanOrEqual(1);

  // No rail on the photo, and nothing else on it: each thing to do is in the
  // row under it, once (pass, like, comments, share, save, more).
  await expect(home.locator("[data-rail]")).toBeHidden();
  const actions = actionsOf(home);
  const names = [
    "Pass on this home",
    /^Like 1880 Tamsen Ridge Pl SE/,
    /^Comments/,
    "Share 1880 Tamsen Ridge Pl SE",
    "Save 1880 Tamsen Ridge Pl SE",
    "More options",
  ];
  await expect(actions.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(actions.getByRole("button").nth(i)).toHaveAccessibleName(name);
  for (const name of names) {
    await expect(home.getByRole("button", typeof name === "string" ? { name, exact: true } : { name })).toHaveCount(1);
  }
  await expect(home.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  const row = await box(actions);
  expect(row.y).toBeGreaterThanOrEqual(foot - 1);
  expect(row.y - foot).toBeLessThanOrEqual(12);
  inTheColumn(row, width);
  for (const button of await actions.getByRole("button").all()) {
    const at = await box(button);
    expect(at.height).toBeGreaterThanOrEqual(44);
    expect(at.width).toBeGreaterThanOrEqual(44);
  }
  // Nothing floats over the photo's foot: no line of what people did, no
  // caption. What was said is in the latest comments under the row, and in
  // the comments themselves; at the foot, the comment bar alone.
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  await expect(home.locator("[data-photo-caption]")).toHaveCount(0);
  await expect(home.locator("[data-words]").getByRole("list", { name: "Comments and likes" })).toHaveCount(0);
  const latest = await box(home.getByRole("group", { name: "Latest comments" }));
  expect(latest.y).toBeGreaterThanOrEqual(row.y + row.height - 1);
  const bar = home.locator("[data-bar-row]");
  await expect(bar.getByRole("button")).toHaveCount(1);
  await expect(bar.getByRole("button")).toHaveAccessibleName("Add a comment…");
  const barBox = await box(bar);
  expect(barBox.y).toBeGreaterThanOrEqual(latest.y + latest.height - 1);
  expect(barBox.y + barBox.height).toBeGreaterThan(height - 20);
  // The photo's own arrow just inside its right edge.
  const arrow = await box(home.getByRole("button", { name: "Next photo" }));
  expect(arrow.x + arrow.width).toBeLessThanOrEqual(photo.x + photo.width - 7.5);
  expect(arrow.x + arrow.width).toBeGreaterThanOrEqual(photo.x + photo.width - 30);
  // No strip of photos under it, no arrows in the gutters to go up and down
  // the homes: the feed scrolls, as on a phone.
  await expect(home.getByRole("list", { name: "Photos" })).toHaveCount(0);
  await expect(home.getByRole("button", { name: /^Go to the (previous|next) home$/ })).toHaveCount(0);

  // The facts in the head, plain words, not things to tap; what the home is
  // waits behind the head, as on a phone: the description whole, who listed
  // it and the details open over the photo, and until then they wait.
  const open = home.getByRole("button", { name: "About this home" });
  const about = home.getByRole("region", { name: "About this home" });
  await expect(open).toHaveAttribute("aria-expanded", "false");
  await expect(about).toBeHidden();
  await expect(home.getByRole("button", { name: "more", exact: true })).toHaveCount(0);
  await expect(about.getByText("Price per sq ft")).toBeHidden();
  await expect(about.getByText(/^Listed by/)).toBeHidden();
  await expect(home.getByText("Tap any detail", { exact: true })).toHaveCount(0);
  await expect(home.getByRole("button", { name: /^\$[\d,]+/ })).toHaveCount(0);
  await expect(sizeOf(home)).toHaveText(/^\d+ bd · \d+ ba · [\d,]+ sq ft$/);
  for (const fact of [priceOf(home), sizeOf(home), home.locator('[data-fact="Address"]')]) {
    const at = await box(fact);
    expect(at.x).toBeGreaterThanOrEqual(head.x - 1);
    expect(at.x + at.width).toBeLessThanOrEqual(head.x + head.width + 1);
    expect(at.y + at.height).toBeLessThanOrEqual(photo.y + 1);
  }
  expect(await home.locator("[data-words]").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  await open.click();
  await expect(about).toBeVisible();
  await settle(about);
  const card = await box(about);
  inTheColumn(card, width);
  expect(Math.abs(card.y - (head.y + head.height))).toBeLessThanOrEqual(1);
  expect(card.height).toBeLessThanOrEqual(height * 0.6 + 1);
  await expect(about.getByText(/^Clean modern lines under a mature shade tree.+\.$/)).toBeVisible();
  await expect(about.getByText(/^Listed by .+ · .+$/)).toBeVisible();
  await expect(about.getByText("Price per sq ft")).toBeVisible();
  await expect(about.getByRole("button")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(open).toBeFocused();

  // J and K only while the feed itself has the keyboard: not on a button (a
  // letter meant for it, or a word said to the computer), but after a click
  // on the feed anywhere else. Somewhere with nothing on it: the first line
  // of the latest comments, how many liked it or "No comments yet.", which
  // is plain words.
  const blankIn = async (article: typeof home) => {
    const list = await box(article.getByRole("group", { name: "Latest comments" }));
    await page.mouse.click(list.x + list.width / 2, list.y + 10);
  };
  await heartOf(home).focus();
  await page.keyboard.press("j");
  await page.waitForTimeout(600);
  await settled(home);
  await blankIn(home);
  await page.keyboard.press("j");
  const second = page.getByRole("article").nth(1);
  await settled(second);
  // The same column on the next home: no jump from home to home.
  const secondHead = await box(second.locator("[data-home-head]"));
  const secondPhoto = await box(photoOf(second));
  inTheColumn(secondHead, width);
  inTheColumn(secondPhoto, width);
  expect(Math.abs(secondPhoto.x - photo.x)).toBeLessThanOrEqual(1);
  await blankIn(second);
  await page.keyboard.press("k");
  await settled(home);
  expect(pageErrors).toEqual([]);

  // The photo is fetched about as wide as it shows (the column), not as wide
  // as the window, let alone wider.
  await expect
    .poll(
      () =>
        photoOf(home).evaluate((img: HTMLImageElement) =>
          img.currentSrc ? Number(new URL(img.currentSrc).searchParams.get("w")) : Infinity,
        ),
      { timeout: 5_000 },
    )
    .toBeLessThan(1440);
});

test("on a desktop, comments come up as a sheet in the same column, as on a phone, under the photo (smaller, still in sight); Escape folds them away", async ({
  browser,
}) => {
  // (On a home already among the busiest this week by now: what's said here
  // doesn't change which homes lead the feed in later tests.)
  const page = await phone(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, "3518 Wexford Ave N");
  await settled(home);
  const { width, height } = page.viewportSize()!;
  // (The Comments button, in the row of things to do under the photo.)
  const rail = home.getByRole("button", { name: /^Comments/ });
  const head = await box(home.locator("[data-home-head]"));
  await rail.click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  // The words under the photo, grown into a sheet: the same column, from
  // under the photo (smaller now, still in sight under the head, which
  // stays) down to the foot of the window. Not a dialog over the page:
  // nothing is shut off, and no tabs (the Porchcard is an agent's). The row
  // of things to do steps aside while they're open.
  const words = home.locator("[data-words]");
  const panel = await box(words);
  await expect.poll(async () => Math.round((await box(sheet)).x)).toBe(Math.round(panel.x));
  inTheColumn(await box(sheet), width);
  await atRest(sheet);
  const up = await box(photoOf(home));
  expect(up.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
  expect(up.height).toBeGreaterThanOrEqual(100);
  expect(up.y + up.height).toBeLessThanOrEqual((await box(sheet)).y + 1);
  expect(Math.round((await box(sheet)).y + (await box(sheet)).height)).toBe(height);
  await expect(home.locator("[data-home-head]")).toBeVisible();
  await expect(actionsOf(home)).toBeHidden();
  await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  await expect(words).not.toHaveAttribute("inert");
  await expect(sheet.getByRole("tablist")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Hide comments" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^(Expand|Shrink) comments$/ })).toHaveCount(0);
  // Escape folds them away from anywhere: from out on the photo's own arrow,
  // the keyboard stays where it is.
  const nextPhoto = home.getByRole("button", { name: "Next photo" });
  await nextPhoto.focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(nextPhoto).toBeFocused();
  // From the button itself, the keyboard stays on it.
  await rail.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(rail).toBeFocused();
  // The comment box is in the comments, at their foot. Signed out, the first
  // word asks them to sign up: the prompt rises from the foot of the window,
  // in the middle, the cursor in the first name. Then it posts, and the
  // comments show it.
  const field = home.getByRole("textbox", { name: "Add a comment" });
  await rail.click();
  await expect(sheet).toBeVisible();
  await field.fill("The porch swing stays, I hope.");
  await field.press("Enter");
  const prompt = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("textbox", { name: "First name" })).toBeFocused();
  await expect.poll(async () => Math.round((await box(prompt)).y + (await box(prompt)).height)).toBe(height);
  expect(Math.abs((await box(prompt)).x + (await box(prompt)).width / 2 - width / 2)).toBeLessThanOrEqual(1);
  await joinAs(page, "Wren");
  await expect(commentIn(sheet, "Wren", "The porch swing stays, I hope.")).toBeVisible();
  // (Posted, the box is empty again and has the keyboard; the feed never shifted.)
  await expect(field).toHaveValue("");
  expect(await page.evaluate(() => document.querySelector("[data-dark-ground]")!.scrollLeft)).toBe(0);
  // Escape, from the box, and the keyboard comes back to the Comments button.
  await field.focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(rail).toBeFocused();
  // From inside the thread, back to the button too. The thread has a row for
  // each comment (never one for who liked what: the likes line counts them).
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await settled(home);
  await rail.press("Enter");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("listitem").filter({ hasText: /You liked|liked the/ })).toHaveCount(0);
  await expect(sheet.getByText(/^\d+ likes?$/)).toBeVisible();
  await sheet.getByRole("button", { name: "Reply to your comment" }).focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(rail).toBeFocused();

  // With the comments open, a click on the photo above them puts them
  // away, and opens no card about a spot. The X does too, and the photo and
  // its row are back.
  await rail.click();
  await expect(sheet).toBeVisible();
  await atRest(sheet);
  const photo = await box(photoOf(home));
  await page.mouse.click(photo.x + photo.width * 0.6, photo.y + photo.height * 0.5);
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await rail.click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Hide comments" }).click();
  await expect(sheet).toBeHidden();
  await expect(actionsOf(home)).toBeVisible();
  await expect(home.getByRole("button", { name: "Next photo" })).toBeAttached();
  // Moving on to another home puts them away.
  await rail.click();
  await expect(sheet).toBeVisible();
  await page.locator("[data-reel]").evaluate((reel) => reel.scrollTo({ top: reel.clientHeight }));
  await settled(page.getByRole("article").nth(1));
  await expect(sheet).toBeHidden();
});

test("on a phone, the comments come up as a sheet under the photo, which stays in sight, and fold away again", async ({ browser }) => {
  for (const options of [undefined, IPHONE]) {
    const page = await phone(browser, options);
    await page.goto("/homes/SAMPLE-1006");
    const home = homeIn(page, "2205 Brackenfield Ct NW");
    await settled(home);
    const head = await box(home.locator("[data-home-head]"));
    const latest = home.getByRole("group", { name: "Latest comments" });
    await expect(latest).toBeVisible();
    await home.getByRole("button", { name: /^Comments/ }).click();
    const sheet = commentsOf(home);
    await expect(sheet).toBeVisible();
    const { height } = page.viewportSize()!;
    // From under the photo (smaller, under the head, which stays) to the foot
    // of the screen: one block, the thread scrolling inside it and the
    // comment box at its foot.
    await atRest(sheet);
    const photo = await box(photoOf(home));
    expect(photo.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
    expect(photo.height).toBeGreaterThanOrEqual(100);
    expect(photo.y + photo.height).toBeLessThanOrEqual((await box(sheet)).y + 1);
    expect((await box(sheet)).height).toBeGreaterThan(height * 0.45);
    expect(Math.round((await box(sheet)).y + (await box(sheet)).height)).toBe(height);
    await expect(home.locator("[data-home-head]")).toBeVisible();
    await expect(sheet.getByLabel("Add a comment")).toBeVisible();
    const foot = await box(sheet.getByLabel("Add a comment"));
    expect(foot.y + foot.height).toBeLessThanOrEqual(height);
    // Not a dialog: the words under the photo, grown into a sheet.
    await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: /^(Expand|Shrink) comments$/ })).toHaveCount(0);
    await expect(latest).toBeHidden();
    // The X folds them away, and the latest comments are back under the photo.
    await sheet.getByRole("button", { name: "Hide comments" }).click();
    await expect(sheet).toBeHidden();
    await expect(latest).toBeVisible();
    // Escape too, and the keyboard goes back to the button that opened them.
    await home.getByRole("button", { name: /^Comments/ }).click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(home.getByRole("button", { name: /^Comments/ })).toBeFocused();
    await page.context().close();
  }
});

test("a link's comment box says who sees it (a public page's needn't), and signing up rises like a sheet, right where you are", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, "719 Saltmarsh Ln");
  await settled(home);
  // Signed out, the comment bar asks them to sign up first, from the bottom
  // like everything else. On a phone the whole sheet shows, the keyboard
  // still down, so none of it is hidden under it.
  await home.getByRole("button", { name: "Add a comment…" }).click();
  const prompt = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("textbox", { name: "First name" })).not.toBeFocused();
  await expect.poll(async () => Math.round((await box(prompt)).y + (await box(prompt)).height)).toBe(page.viewportSize()!.height);
  await expect(prompt.getByRole("button", { name: "Continue" })).toBeInViewport({ ratio: 1 });
  await joinAs(page, "Odile");
  // Then the comments, where they were going.
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  // (Everything here is public, and signing up said so: no line under the box.)
  await expect(sheet.getByText("Public, with your first name.")).toHaveCount(0);
  const field = sheet.getByLabel("Add a comment");
  await field.fill("That fence");
  await field.press("Enter");
  await expect(commentIn(sheet, "Odile", "That fence")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // On an agent's link: the agent and everyone on the link read what's said
  // there (each person's own link included), never "only you". (A home with
  // link activity already, so the feed's order in later tests stays put.)
  const agent = await signInAgent(browser, "lane@example.com", "Lane Agent");
  const { urls } = await createShare(agent, ["1204 Quillan"], ["Ottilie", "Pim"]);
  for (const name of ["Ottilie", "Pim"]) {
    const client = await signedIn(browser);
    await client.goto(urls[name]);
    const clientHome = homeIn(client, "1204 Quillan St SE");
    // Public as it starts, the box asks for a comment; kept to the link, it
    // asks you to tell the agent (and is named "Add a comment" either way).
    await clientHome.getByRole("button", { name: "Add a comment…" }).click();
    const private_ = commentsOf(clientHome);
    await expect(private_.getByLabel("Add a comment")).toHaveAttribute("placeholder", "Add a comment…");
    // Public to start with, a tap from staying on the link (never "only you").
    await expect(private_.getByText("Public, with your first name.")).toBeVisible();
    await expect(private_.getByRole("button", { name: "Keep it to this link" })).toBeVisible();
    await expect(private_.getByRole("button", { name: "Keep it to Lane Agent" })).toHaveCount(0);
    await expect(private_.getByText(/Everyone can see/)).toHaveCount(0);
    if (name === "Pim") {
      // Kept to the link, the line says who reads it there; and back.
      await private_.getByRole("button", { name: "Keep it to this link" }).click();
      await expect(private_.getByText("Only Lane Agent and people on this link see this.")).toBeVisible();
      await expect(private_.getByLabel("Add a comment")).toHaveAttribute("placeholder", "Tell Lane what you think…");
      await expect(private_.getByText(/Only you/)).toHaveCount(0);
      await private_.getByRole("button", { name: "Make public" }).click();
      await expect(private_.getByText("Public, with your first name.")).toBeVisible();
    }
    await client.context().close();
  }
});

test("the skip link goes past the header to the homes, though the header comes first", async ({ browser }) => {
  for (const options of [DESKTOP, IPHONE]) {
    const page = await (await browser.newContext(options)).newPage();
    await page.goto("/homes/SAMPLE-1008");
    const home = homeIn(page, "719 Saltmarsh Ln");
    await settled(home);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    // The next stop is in the first home, not the header's logo or links.
    await page.keyboard.press("Tab");
    expect(await home.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await expect(page.getByRole("banner").locator(":focus")).toHaveCount(0);
    await page.context().close();
  }
});
