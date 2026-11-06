import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { heartOf, homeIn, joinAs, likeInPhoto, openMore, settle, tapPhoto } from "./helpers";

// The phone sizes the core view is drawn for (the project's own is a Pixel 7).
const IPHONE = { viewport: { width: 393, height: 660 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SMALL = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ON_ITS_SIDE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SMALL_ON_ITS_SIDE = { viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const HEADER = 56;

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

test("on a phone, the whole photo sits right on top of the words, in the same place on every home", async ({ browser }) => {
  for (const options of [undefined, IPHONE, SMALL]) {
    const page = await phone(browser, options);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto("/homes/SAMPLE-1009");
    const homes = page.getByRole("article");
    const tops: number[] = [];
    for (let i = 0; i < 3; i++) {
      const home = homes.nth(i);
      if (i > 0) await page.keyboard.press("ArrowDown");
      await settled(home);
      const photo = await box(photoOf(home));
      const words = await box(home.locator("[data-words]"));
      tops.push(photo.y);
      // Never under the header.
      expect(photo.y).toBeGreaterThanOrEqual(HEADER);
      // The words: always 308px, right under the photo, and none of them on it.
      expect(Math.abs(words.height - 308)).toBeLessThanOrEqual(2);
      expect(Math.abs(photo.y + photo.height - words.y)).toBeLessThanOrEqual(1);
      const column = await box(home.locator("[data-words] [data-keep-clear]").first());
      expect(column.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
      for (const text of [home.getByText(/^Listed by/), home.getByRole("button", { name: /^\$[\d,]+/ })]) {
        expect((await box(text)).y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
      }
      // The comment bar is the last thing, at the bottom.
      const bar = await box(home.getByRole("button", { name: "Add a comment…" }));
      expect(bar.y + bar.height).toBeGreaterThan(page.viewportSize()!.height - 20);
    }
    // No jump from home to home.
    for (const top of tops) expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(1);
    expect(pageErrors).toEqual([]);
    await page.context().close();
  }
});

test("the buttons down the right: like, comments, share, more, each with its label, just over the comment bar", async ({
  page,
}) => {
  await page.goto("/homes/SAMPLE-1013");
  const home = homeIn(page, "5902 Lakeview Terrace SE");
  await settled(home);
  const rail = home.locator("[data-keep-clear]").filter({ has: home.page().getByRole("button", { name: /^Like (?!the )/ }) });
  const names = [/^Like 5902 Lakeview Terrace SE/, /^Comments/, "Share", "More options"];
  await expect(rail.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(rail.getByRole("button").nth(i)).toHaveAccessibleName(name);
  await expect(rail).toContainText("Share");
  await expect(rail).toContainText("More");
  const bar = await box(home.getByRole("button", { name: "Add a comment…" }));
  const railBox = await box(rail);
  expect(Math.abs(bar.y - (railBox.y + railBox.height) - 8)).toBeLessThanOrEqual(1);
  // The facts say what people thought of them to screen readers only: no
  // stray counts beside them.
  await expect(home.getByRole("button", { name: /^\$[\d,]+/ })).toHaveText(/^\$[\d,]+$/);
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
  // The arrows are a fingertip wide.
  const next = await box(home.getByRole("button", { name: "Next photo" }));
  expect(next.width).toBeGreaterThanOrEqual(44);
});

test("a tap near the top of the photo on an iPhone opens a card below the header, and it closes", async ({ browser }) => {
  const page = await phone(browser, IPHONE);
  await page.goto("/homes/SAMPLE-1010");
  const home = homeIn(page, "88 Heron Bluff Rd");
  await settled(home);
  await tapPhoto(home, "Small red cabin on a grassy meadow", 0.3, 0.12);
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
  // The photo fills the height; the words go over it.
  expect(photo.height).toBeGreaterThan(385);
  const words = await box(home.locator("[data-words]"));
  expect(words.y).toBeLessThan(photo.y + photo.height);
  // (The box it's clamped in: the words run on, unseen, past it.)
  const caption = await box(home.getByText(/^A blue cottage behind a white picket fence/).locator("xpath=.."));
  expect(caption.height).toBeLessThanOrEqual(23);
  // No room for labels on the photo here, and the arrows stay off the words
  // (a swipe turns the photos).
  await expect(home.getByText("Exterior · 1 of 2", { exact: true })).toBeHidden();
  await expect(home.getByRole("button", { name: "Next photo" })).toHaveCSS("opacity", "0");
  await expect(home.getByRole("button", { name: "Next photo" })).toHaveCSS("pointer-events", "none");
  // The buttons stay clear of the header.
  expect((await box(heartOf(home))).y).toBeGreaterThanOrEqual(HEADER);

  // The price's card can't go above it here, so it opens as high as it can
  // under the header, beside the price, and closes.
  const price = home.getByRole("button", { name: /^\$[\d,]+/ });
  await price.click();
  const card = home.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  const cardBox = await box(card);
  expect(cardBox.y).toBeGreaterThanOrEqual(HEADER);
  expect(cardBox.x).toBeGreaterThanOrEqual((await box(price)).x + (await box(price)).width);
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();

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

test("the description: two lines, then more right after the last word, one button that keeps the keyboard", async ({
  browser,
}) => {
  const page = await phone(browser, IPHONE);
  await page.goto("/homes/SAMPLE-1001");
  const home = homeIn(page, "4127 Larkmoor Ave NE");
  await settled(home);
  const more = home.getByRole("button", { name: "more", exact: true });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  // The words come first, then "more", right after them on the second line.
  const text = home.getByText(/^A warm Ravenna-area Craftsman/);
  const caption = await box(text.locator("xpath=.."));
  expect(caption.height).toBeLessThanOrEqual(45);
  const at = await box(more);
  expect(at.y).toBeGreaterThan(caption.y + 20);
  const words = await text.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].at(-1)!.right;
  });
  expect(at.x - words).toBeLessThan(20);
  // A fingertip to tap, not clipped by the two lines.
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.textContent,
    { x: at.x + at.width / 2, y: at.y + at.height + 9 },
  );
  expect(hit).toBe("more");
  // From the keyboard, it opens and closes in place, and stays where the keyboard is.
  await more.focus();
  await page.keyboard.press("Enter");
  const less = home.getByRole("button", { name: "less", exact: true });
  await expect(less).toBeFocused();
  await expect(less).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(more).toBeFocused();
  await page.context().close();
});

test("Show the photo only, from More, hides everything on the home until you ask or move on", async ({ page }) => {
  await page.goto("/homes/SAMPLE-1011");
  const home = homeIn(page, "16420 NE Alder Crest Way");
  await settled(home);
  const before = await box(photoOf(home));
  const price = home.getByRole("button", { name: /^\$[\d,]+/ });

  let more = await openMore(page, home);
  await more.getByRole("button", { name: "Show the photo only" }).click();
  await expect(more).toBeHidden();
  await expect(price).toBeHidden();
  await expect(home.getByRole("button", { name: /^Comments/ })).toBeHidden();
  await expect(home.getByRole("button", { name: "Add a comment…" })).toBeHidden();
  await expect(page.getByRole("link", { name: "BuyBox Social" })).toBeHidden();
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
  await more.getByRole("button", { name: "Show the photo only" }).click();
  await expect(price).toBeHidden();
  await page.keyboard.press("ArrowDown");
  const next = page.getByRole("article").nth(1);
  await settled(next);
  await expect(next.getByRole("button", { name: /^\$[\d,]+/ })).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await settled(home);
  await expect(price).toBeVisible();
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

test("spots right beside each other gather into one count, and spread out when tapped", async ({ page, browser }) => {
  const PHOTO = "Dark modern home with wood accents and an open courtyard";
  await page.goto("/homes/SAMPLE-1013");
  const home = homeIn(page, "5902 Lakeview Terrace SE");
  await settled(home);
  const photo = await box(home.getByRole("img", { name: PHOTO }));
  // Two hearts, a little more than a fingertip apart.
  const gap = 25 / photo.width;
  for (const [i, x] of [0.3, 0.3 + gap].entries()) {
    await tapPhoto(home, PHOTO, x, 0.5);
    const card = home.locator("[data-spot-card]");
    await expect(card).toBeVisible();
    await settle(card);
    await card.getByRole("button", { name: /^Like / }).click();
    if (i === 0) await joinAs(page, "Ines");
    await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toBeHidden();
  }
  // Yours always show on their own.
  await expect(home.getByRole("button", { name: /: 1 like$/ })).toHaveCount(2);

  // Someone else sees one count there, until they ask to see each.
  const other = await phone(browser);
  await other.goto("/homes/SAMPLE-1013");
  const theirs = homeIn(other, "5902 Lakeview Terrace SE");
  await settled(theirs);
  const count = theirs.getByRole("button", { name: "2 spots here. Show them" });
  await expect(count).toBeVisible();
  await expect(theirs.getByRole("button", { name: /: 1 like$/ })).toHaveCount(0);
  await count.press("Enter");
  await expect(theirs.getByRole("button", { name: /: 1 like$/ })).toHaveCount(2);
  await expect(count).toHaveCount(0);
  // The keyboard lands on the first of them, not lost with the count.
  await expect(theirs.getByRole("button", { name: /: 1 like$/ }).first()).toBeFocused();
});
