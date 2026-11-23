import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { signedIn,
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

test("on a phone, the photo has most of the screen, whole, in the middle of its room; under it the activity line and a few lines of plain words, the same on every home", async ({ browser }) => {
  // (Now the way a post reads: the price, the size and the address in a head
  // above the photo, the photo whole under it, and the latest comments under
  // that, down to the comment bar.)
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
      // The head right under the chrome, always the same height, and the
      // photo right under the head: never under either.
      expect(Math.abs(head.y - CHROME_FOOT)).toBeLessThanOrEqual(1);
      expect(Math.abs(head.height - 64)).toBeLessThanOrEqual(1);
      expect(Math.abs(photo.y - (head.y + head.height))).toBeLessThanOrEqual(1);
      // As wide as the screen, and whole, never cropped: nothing of it past
      // the screen's sides (a flyer's words run to its edges). (The sample
      // homes' first photos are four by three.)
      expect(photo.width).toBeGreaterThanOrEqual(width - 1);
      expect(photo.height).toBeGreaterThanOrEqual(220);
      expect(Math.abs(photo.height - width * 0.75)).toBeLessThanOrEqual(2);
      expect(photo.x).toBeGreaterThanOrEqual(-1);
      expect(photo.x + photo.width).toBeLessThanOrEqual(width + 1);
      // The X and the heart on it stay on the screen.
      for (const button of [heartOf(home), home.getByRole("button", { name: "Pass on this home" })]) {
        await expect(button).toBeInViewport({ ratio: 1 });
      }
      // The words start at the photo's foot, none of them on it, and run to
      // the bottom of the screen.
      const foot = photo.y + photo.height;
      expect(Math.abs(words.y - foot)).toBeLessThanOrEqual(1);
      expect(Math.abs(words.y + words.height - height)).toBeLessThanOrEqual(1);
      // What people said about the home is in that room, under the photo,
      // never on it: no line going round over the photo's foot any more.
      const latest = await box(home.getByRole("group", { name: "Latest comments" }));
      expect(latest.y).toBeGreaterThanOrEqual(foot - 1);
      expect(latest.y + latest.height).toBeLessThanOrEqual(words.y + words.height + 1);
      await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
      await expect(home.locator("[data-photo-caption]")).toHaveCount(0);
      await expect(home.getByText("Tap the photo to like or comment")).toHaveCount(0);
      // No row of round buttons: what there is to do is in the comment bar's row.
      await expect(home.locator("[data-rail]")).toBeHidden();
      // Plain words, not chips to tap: the price, then "4 bd · 3 ba · 2,780 sq
      // ft" (a lot has no "0 bd"), the address, all in the head above the
      // photo. Who listed it waits in About this home, closed until asked.
      await expect(priceOf(home)).toHaveText(/^\$[\d,]+$/);
      await expect(sizeOf(home)).toHaveText(/^(\d+ bd · )?(\d+ ba · )?[\d,]+ sq ft$/);
      await expect(home.getByRole("button", { name: /^\$[\d,]+/ })).toHaveCount(0);
      await expect(home.getByRole("button", { name: /^\d+ (bd|beds?)\b/ })).toHaveCount(0);
      await expect(home.locator("[data-fact]").filter({ has: page.locator("button") })).toHaveCount(0);
      await expect(home.getByText(/^Listed by/)).toBeHidden();
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

test("under the words, one row: the comment bar with its count, Save and More; the heart and the X are on the photo, Share in its corner", async ({
  page,
}) => {
  await page.goto("/homes/SAMPLE-1013");
  const home = homeIn(page, "5902 Lakeview Terrace SE");
  await settled(home);
  const row = home.locator("[data-bar-row]");
  const names = ["Add a comment…", /^Comments/, "Save 5902 Lakeview Terrace SE", "More options"];
  await expect(row.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(row.getByRole("button").nth(i)).toHaveAccessibleName(name);
  // (The Porchcard is an agent's, in a client's homes: not here.)
  await expect(home.getByRole("button", { name: "Feedback" })).toHaveCount(0);
  // One row, left to right, at the foot, each a fingertip tall.
  const buttons = await Promise.all(names.map((_, i) => box(row.getByRole("button").nth(i))));
  for (const [i, button] of buttons.entries()) {
    expect(Math.abs(button.y + button.height / 2 - (buttons[0].y + buttons[0].height / 2))).toBeLessThanOrEqual(1);
    expect(button.height).toBeGreaterThanOrEqual(44);
    if (i > 0) expect(button.x).toBeGreaterThan(buttons[i - 1].x + buttons[i - 1].width - 1);
  }
  // Right under the words: no empty band between them.
  const words = await box(home.locator("[data-words] [data-keep-clear]").first());
  expect(buttons[0].y - (words.y + words.height)).toBeLessThanOrEqual(12);
  // The count reads the comments, for anyone.
  await row.getByRole("button", { name: /^Comments/ }).click();
  await expect(commentsOf(home)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(commentsOf(home)).toBeHidden();
  // The one heart is in the photo's bottom right corner, opposite the X that passes.
  const frame = (await home.locator("[data-photo-frame]").first().boundingBox())!;
  const heart = (await heartOf(home).boundingBox())!;
  const x = (await home.getByRole("button", { name: "Pass on this home" }).boundingBox())!;
  expect(heart.x + heart.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(heart.x).toBeGreaterThan(frame.x + frame.width / 2);
  expect(x.x).toBeGreaterThanOrEqual(frame.x);
  expect(x.x).toBeLessThan(frame.x + frame.width / 2);
  expect(Math.abs(heart.y - x.y)).toBeLessThan(2);
  expect(heart.y + heart.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  // Sharing it is in the photo's top left corner.
  await expect(home.getByRole("button", { name: "Share 5902 Lakeview Terrace SE" })).toBeVisible();
  await expect(home.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
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
  for (const part of [sheet.getByLabel("Add a comment"), sheet.getByText("Public, with your first name.")]) {
    const at = await box(part);
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
  const about = home.getByRole("region", { name: "About this home" });
  await expect(about).toBeHidden();
  await expect(home.getByText(/^A warm Ravenna-area Craftsman/)).toBeHidden();
  await expect(home.getByText(/^Listed by/)).toBeHidden();
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

test("on a desktop, the photo has a stage of its own with nothing on it, and everything to read and do in the panel", async ({
  browser,
}) => {
  const page = await phone(browser, DESKTOP);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await settled(home);

  // The photo, whole, on the stage on the left, up to the panel down the
  // right.
  const photo = await box(photoOf(home));
  expect(photo.x).toBeGreaterThanOrEqual(23);
  expect(photo.x + photo.width).toBeLessThanOrEqual(1440 - 24 - 360 - 16 + 1);
  expect(photo.y).toBeGreaterThanOrEqual(72 - 1);
  // It's fetched about as wide as it shows, not as wide as the window.
  await expect
    .poll(() =>
      photoOf(home).evaluate((img: HTMLImageElement) =>
        img.currentSrc ? Number(new URL(img.currentSrc).searchParams.get("w")) : Infinity,
      ),
    )
    .toBeLessThan(1440);
  const panel = await box(home.locator("[data-words]"));
  expect(Math.abs(panel.x + panel.width - 1416)).toBeLessThanOrEqual(1);
  expect(panel.x - (photo.x + photo.width)).toBeGreaterThanOrEqual(15);
  // No rail on the photo: each thing to do is in the panel, once, in a row
  // just over the comment box (like, comments, save, share, more).
  await expect(home.locator("[data-rail]")).toBeHidden();
  const panelWords = home.locator("[data-words]");
  const actions = panelWords.locator("[data-actions]");
  const names = [/^Comments/, "Save 1880 Tamsen Ridge Pl SE", "Share", "More options"];
  await expect(actions.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(actions.getByRole("button").nth(i)).toHaveAccessibleName(name);
  for (const name of names) {
    await expect(home.getByRole("button", typeof name === "string" ? { name, exact: true } : { name })).toHaveCount(1);
  }
  // And, on the photo's top left corner, a quick way to send it on.
  await expect(home.getByRole("button", { name: "Share 1880 Tamsen Ridge Pl SE" })).toHaveText("Share this home");
  // Share has its word beside it, as Save has.
  await expect(actions.getByRole("button", { name: "Share", exact: true })).toHaveText("Share");
  const row = await box(actions);
  const compose = await box(panelWords.getByRole("textbox", { name: "Add a comment" }));
  expect(row.y + row.height).toBeLessThanOrEqual(compose.y);
  expect(compose.y - (row.y + row.height)).toBeLessThanOrEqual(12);
  // Nothing floats over the photo's foot: no line of what people did, no
  // caption. What was said is in the panel's latest comments, and in the
  // comments themselves.
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  await expect(home.locator("[data-photo-caption]")).toHaveCount(0);
  const latest = await box(panelWords.getByRole("group", { name: "Latest comments" }));
  expect(latest.x).toBeGreaterThanOrEqual(photo.x + photo.width);
  // The photo's own arrow just inside its right edge.
  const arrow = await box(home.getByRole("button", { name: "Next photo" }));
  expect(arrow.x + arrow.width).toBeLessThanOrEqual(photo.x + photo.width - 7.5);
  expect(arrow.x + arrow.width).toBeGreaterThanOrEqual(photo.x + photo.width - 30);
  // The rest of the words, not one of them on the photo: the panel says what
  // the home is (what was said is in one place only: the comments).
  await expect(panelWords.getByRole("list", { name: "Comments and likes" })).toHaveCount(0);
  // The description to two lines, then "more", which reads the rest in
  // place, with who listed it and the details; until then they wait.
  const more = panelWords.getByRole("button", { name: "more", exact: true });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  expect(await more.getAttribute("aria-haspopup")).toBeNull();
  await expect(panelWords.getByText("Price per sq ft")).toHaveCount(0);
  await expect(panelWords.getByRole("list", { name: "The details" })).toHaveCount(0);
  await expect(home.getByText(/^Listed by/)).toHaveCount(0);
  await more.click();
  await expect(panelWords.getByRole("button", { name: "less", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(panelWords.getByText("Price per sq ft")).toBeVisible();
  // On the stage's own dark, the facts and the details are words to read,
  // not things to tap: what someone thinks goes in a comment.
  await expect(panelWords.getByText("Tap any detail", { exact: true })).toHaveCount(0);
  const details = panelWords.getByRole("list", { name: "The details" }).getByRole("listitem");
  expect(await details.count()).toBeGreaterThanOrEqual(3);
  await expect(panelWords.getByRole("list", { name: "The details" }).getByRole("button")).toHaveCount(0);
  await expect(home.getByRole("button", { name: /^\$[\d,]+/ })).toHaveCount(0);
  await expect(sizeOf(home)).toHaveText(/^\d+ bd · \d+ ba · [\d,]+ sq ft$/);
  expect(await panelWords.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  for (const words of [
    priceOf(home),
    sizeOf(home),
    home.locator('[data-fact="Address"]'),
    home.getByText(/^Clean modern lines under a mature shade tree/),
    home.getByText(/^Listed by/),
  ]) {
    expect((await box(words)).x).toBeGreaterThanOrEqual(photo.x + photo.width);
  }
  // The panel has the room: the whole description, right there, and "less"
  // puts the rest away again (the one button, where the keyboard is).
  await expect(panelWords.getByText(/^Clean modern lines under a mature shade tree.+\.$/)).toBeVisible();
  await panelWords.getByRole("button", { name: "less", exact: true }).click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(panelWords.getByText("Price per sq ft")).toHaveCount(0);

  // Every photo in a strip just under it, lined up with it: the one on screen
  // marked, a click goes straight there.
  const strip = home.getByRole("list", { name: "Photos" });
  await expect(strip.getByRole("button")).toHaveCount(4);
  await expect(strip.getByRole("button").first()).toHaveAttribute("aria-current", "true");
  const first = await box(strip.getByRole("button").first());
  expect(Math.abs(first.x - photo.x)).toBeLessThanOrEqual(1);
  expect(first.y - (photo.y + photo.height)).toBeGreaterThanOrEqual(0);
  expect(first.y - (photo.y + photo.height)).toBeLessThanOrEqual(16);
  const third = strip.getByRole("button", { name: /^Photo 3: / });
  await third.click();
  await expect(home.getByText("Photo 3 of 4")).toBeAttached();
  await expect(third).toHaveAttribute("aria-current", "true");

  // The panel starts level with the photo and ends level with the strip of
  // photos under it (with one photo, the photo itself), whichever is showing.
  const panelNow = await box(panelWords);
  const thumb = await box(strip.getByRole("button").first());
  expect(Math.abs(panelNow.y - photo.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(panelNow.y + panelNow.height - (thumb.y + thumb.height))).toBeLessThanOrEqual(1);
  // A home with one photo: level with the photo's foot.
  const lone = await phone(browser, DESKTOP);
  await lone.goto("/homes/SAMPLE-1009");
  const alone = homeIn(lone, "1204 Quillan St SE");
  await settled(alone);
  const lonePhoto = await box(photoOf(alone));
  const lonePanel = await box(alone.locator("[data-words]"));
  expect(Math.abs(lonePanel.y + lonePanel.height - (lonePhoto.y + lonePhoto.height))).toBeLessThanOrEqual(1);
  await lone.close();

  // Nothing over the photo to go up and down the homes: a small arrow in the
  // middle of the band under the block (and, past the first home, one in the
  // band over it). The feed scrolls on to the next too.
  await expect(home.getByRole("button", { name: "Go to the previous home" })).toHaveCount(0);
  const downArrow = await box(home.getByRole("button", { name: "Go to the next home" }));
  expect(Math.abs(downArrow.x + downArrow.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(downArrow.y).toBeGreaterThanOrEqual(thumb.y + thumb.height);
  expect(downArrow.y + downArrow.height).toBeLessThanOrEqual(900);
  await home.getByRole("button", { name: "Go to the next home" }).click();
  const second = page.getByRole("article").nth(1);
  await settled(second);
  const upArrow = await box(second.getByRole("button", { name: "Go to the previous home" }));
  const secondPhoto = await box(photoOf(second));
  expect(Math.abs(upArrow.x + upArrow.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(upArrow.y).toBeGreaterThanOrEqual(56);
  expect(upArrow.y + upArrow.height).toBeLessThanOrEqual(secondPhoto.y);
  // From the keyboard, again and again: the keyboard goes along to the same
  // arrow on each home, never left behind out of sight.
  await page.keyboard.press("Enter");
  const thirdHome = page.getByRole("article").nth(2);
  await settled(thirdHome);
  await expect(thirdHome.getByRole("button", { name: "Go to the next home" })).toBeFocused();
  await thirdHome.getByRole("button", { name: "Go to the previous home" }).press("Enter");
  await settled(second);
  await expect(second.getByRole("button", { name: "Go to the previous home" })).toBeFocused();
  await page.keyboard.press("Enter");
  await settled(home);
  // J and K only while the feed itself has the keyboard: not on a button (a
  // letter meant for it, or a word said to the computer), but after a click
  // on the feed anywhere else.
  // Somewhere with nothing on it: in the panel, between the latest comments
  // and the row of things to do.
  const blankIn = async (article: typeof home) => {
    const list = await box(article.getByRole("group", { name: "Latest comments" }));
    const row = await box(article.locator("[data-actions]"));
    await page.mouse.click(list.x + list.width / 2, (list.y + list.height + row.y) / 2);
  };
  await heartOf(home).focus();
  await page.keyboard.press("j");
  await page.waitForTimeout(600);
  await settled(home);
  await blankIn(home);
  await page.keyboard.press("j");
  await settled(second);
  await blankIn(second);
  await page.keyboard.press("k");
  await settled(home);
  expect(pageErrors).toEqual([]);
});

test("on a desktop, comments unfurl in the panel beside the photo, which can still be tapped; Escape folds them away", async ({
  browser,
}) => {
  // (On a home already among the busiest this week by now: what's said here
  // doesn't change which homes lead the feed in later tests.)
  const page = await phone(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, "3518 Wexford Ave N");
  await settled(home);
  // (The Comments button, in the row of things to do at the panel's foot.)
  const rail = home.getByRole("button", { name: /^Comments/ });
  await rail.click();
  const sheet = commentsOf(home);
  await expect(sheet).toBeVisible();
  // In the panel itself, not a dialog over the page: nothing is shut off,
  // the panel's own buttons stay in reach, and no tabs (the Porchcard beside
  // them is an agent's).
  const words = home.locator("[data-words]");
  const panel = await box(words);
  await expect.poll(async () => Math.round((await box(sheet)).x)).toBe(Math.round(panel.x));
  await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  await expect(words).not.toHaveAttribute("inert");
  await expect(sheet.getByRole("tablist")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Hide comments" })).toBeVisible();
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
  // The comment box is in the panel, at its foot. Signed out, the first word
  // asks them to sign up: the prompt rises from the foot of the panel, not
  // across the photo, the cursor in the first name. Then it posts, and the
  // comments unfurl to show it.
  const field = home.getByRole("textbox", { name: "Add a comment" });
  await rail.click();
  await expect(sheet).toBeVisible();
  await field.fill("The porch swing stays, I hope.");
  await field.press("Enter");
  const prompt = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("textbox", { name: "First name" })).toBeFocused();
  await expect.poll(async () => Math.round((await box(prompt)).y + (await box(prompt)).height)).toBe(Math.round(panel.y + panel.height));
  expect(Math.abs((await box(prompt)).x - panel.x)).toBeLessThanOrEqual(1);
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

  // With the comments open, a tap on the photo still opens a card about that spot,
  // whole, over anyone's words on the photo.
  await rail.click();
  await expect(sheet).toBeVisible();
  await tapPhoto(home, "Modern townhouse with a lit front entry at dusk", 0.6, 0.66);
  const card = home.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await expect(sheet).toBeVisible();
  await settle(card);
  const cardBox = await box(card);
  expect(
    await page.evaluate(
      ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("[data-spot-card]")),
      { x: cardBox.x + cardBox.width / 2, y: cardBox.y + 20 },
    ),
  ).toBe(true);
  // Escape puts the card away (the keyboard stays on the photo), then the comments.
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(sheet).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // Moving on to another home puts them away.
  await rail.click();
  await expect(sheet).toBeVisible();
  await page.locator("[data-reel]").evaluate((reel) => reel.scrollTo({ top: reel.clientHeight }));
  await settled(page.getByRole("article").nth(1));
  await expect(sheet).toBeHidden();
});

test("on a phone, the comments unfurl up over the photo, to just under the head, and fold away again", async ({ browser }) => {
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
    // From right under the head (which stays) to the foot of the screen: one
    // block, the thread scrolling inside it and the comment box at its foot.
    await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(Math.round(head.y + head.height));
    expect(Math.round((await box(sheet)).y + (await box(sheet)).height)).toBe(height);
    await expect(home.locator("[data-home-head]")).toBeVisible();
    await expect(sheet.getByLabel("Add a comment")).toBeVisible();
    const foot = await box(sheet.getByLabel("Add a comment"));
    expect(foot.y + foot.height).toBeLessThanOrEqual(height);
    // No sheet, no handle to drag: it's the words under the photo, grown.
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

test("every comment box says who sees it, and signing up rises like a sheet, right where you are", async ({ page, browser }) => {
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
  await expect(sheet.getByText("Public, with your first name.")).toBeVisible();
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
    // The box asks you to tell the agent (and is still named "Add a comment").
    await clientHome.getByRole("button", { name: "Tell Lane what you think…" }).click();
    const private_ = commentsOf(clientHome);
    await expect(private_.getByLabel("Add a comment")).toHaveAttribute("placeholder", "Tell Lane what you think…");
    await expect(private_.getByText("Shown to everyone on this link and on your profile.")).toBeVisible();
    await expect(private_.getByText(/Shown to Lane Agent/)).toHaveCount(0);
    await expect(private_.getByText(/Everyone can see/)).toHaveCount(0);
    if (name === "Pim") {
      // Liked, you may share it on the public page too: ticked, the line says so.
      await client.keyboard.press("Escape");
      await expect(private_).toBeHidden();
      await heartOf(clientHome).click();
      await expect(heartOf(clientHome)).toHaveAttribute("aria-pressed", "true");
      await clientHome.getByRole("button", { name: /^Comments/ }).click();
      await private_.getByRole("checkbox").check();
      await expect(private_.getByText("Also public, without your name.")).toBeVisible();
      await expect(private_.getByText(/Only Lane Agent/)).toHaveCount(0);
      await private_.getByRole("checkbox").uncheck();
      await expect(private_.getByText("Shown to everyone on this link and on your profile.")).toBeVisible();
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
