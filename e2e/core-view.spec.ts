import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import {
  commentIn,
  createShare,
  heartOf,
  homeIn,
  joinAs,
  likeInPhoto,
  openMore,
  settle,
  signInAgent,
  tapPhoto,
} from "./helpers";

// The phone sizes the core view is drawn for (the project's own is a Pixel 7).
const IPHONE = { viewport: { width: 393, height: 660 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SMALL = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ON_ITS_SIDE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const SMALL_ON_ITS_SIDE = { viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
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
      // The words: always 260px, right under the photo, and none of them on it.
      expect(Math.abs(words.height - 260)).toBeLessThanOrEqual(2);
      expect(Math.abs(photo.y + photo.height - words.y)).toBeLessThanOrEqual(1);
      // What people did on the photo floats on it, just above its foot.
      const caption = await box(home.getByRole("group", { name: "Recent activity" }));
      expect(caption.y).toBeGreaterThanOrEqual(photo.y);
      expect(caption.y + caption.height).toBeLessThanOrEqual(photo.y + photo.height - 8);
      expect(caption.y + caption.height).toBeGreaterThanOrEqual(photo.y + photo.height - 20);
      const column = await box(home.locator("[data-words] [data-keep-clear]").first());
      expect(column.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
      for (const text of [home.getByText(/^Listed by/), home.getByRole("button", { name: /^\$[\d,]+/ })]) {
        expect((await box(text)).y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
      }
      // Each fact sits on a frosted chip of its own, as the buttons on the
      // photo do: plainly something to tap.
      for (const fact of [/^\$[\d,]+/, /^\d+ beds?/, /^\d+ baths?/, /^Listed by /]) {
        const chip = home.getByRole("button", { name: fact });
        expect(await chip.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
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

test("the buttons down the right: like, comments, scorecard, share, more, each with its label, just over the comment bar", async ({
  page,
}) => {
  await page.goto("/homes/SAMPLE-1013");
  const home = homeIn(page, "5902 Lakeview Terrace SE");
  await settled(home);
  const rail = home.locator("[data-rail]");
  const names = [/^Like 5902 Lakeview Terrace SE/, /^Comments/, "Scorecard", "Share", "More options"];
  await expect(rail.getByRole("button")).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(rail.getByRole("button").nth(i)).toHaveAccessibleName(name);
  await expect(rail).toContainText("Scorecard");
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

  // The price's card, opened from the keyboard, takes it; Escape puts the
  // card away and gives the keyboard back to the price.
  const price = home.getByRole("button", { name: /^\$[\d,]+/ });
  await price.focus();
  await page.keyboard.press("Enter");
  await expect(card.getByRole("button", { name: /^Like the price/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(price).toBeFocused();
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

  // Too short for two heights, the comments open just under the header, the
  // comment box and who sees it wholly on screen.
  await home.getByRole("button", { name: /^Comments/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(HEADER);
  await expect(sheet.getByRole("button", { name: /^(Expand|Shrink) comments$/ })).toHaveCount(0);
  for (const part of [sheet.getByLabel("Add a comment"), sheet.getByText("Everyone can see your comment and first name.")]) {
    const at = await box(part);
    expect(at.y + at.height).toBeLessThanOrEqual(390);
  }
  expect((await box(sheet.locator("div.overflow-y-auto"))).height).toBeGreaterThanOrEqual(100);
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

test("the description: two lines, then more right after the last word, which opens the rest in the Scorecard", async ({
  browser,
}) => {
  const page = await phone(browser, IPHONE);
  await page.goto("/homes/SAMPLE-1001");
  const home = homeIn(page, "4127 Larkmoor Ave NE");
  await settled(home);
  const more = home.getByRole("button", { name: "more", exact: true });
  await expect(more).toHaveAttribute("aria-haspopup", "dialog");
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
  // It opens the Scorecard at "About this home", with all of it there; put
  // away, the keyboard is back on "more".
  await more.focus();
  await page.keyboard.press("Enter");
  const card = page.getByRole("dialog", { name: "Scorecard" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading", { name: "About this home" })).toBeInViewport();
  await expect(card.getByText(/^A warm Ravenna-area Craftsman.+a short walk away\.$/)).toBeInViewport({ ratio: 0.5 });
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
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
  const last = await box(more.getByRole("button", { name: "Show the photo only" }));
  expect(last.y + last.height).toBeLessThanOrEqual(852 - 34);
  expect((await box(more.getByRole("link", { name: /^See homes near .+ on the map$/ }))).height).toBeGreaterThanOrEqual(44);
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
  await tapPhoto(home, PHOTO, 0.3, 0.5);
  const card = home.locator("[data-spot-card]");
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Like / }).click();
  await joinAs(page, "Ines");
  await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  // No heart, pin or count stays on the photo, even for her.
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  await expect(home.getByRole("button", { name: /: 1 like$/ })).toHaveCount(0);

  // Someone else: just the photo, and the line at its foot saying what Ines
  // did, with a hotspot where she tapped (a fingertip away, at most: a tap
  // right beside a named thing is that thing).
  const other = await phone(browser);
  await other.goto("/homes/SAMPLE-1013");
  const theirs = homeIn(other, "5902 Lakeview Terrace SE");
  await settled(theirs);
  await expect(theirs.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  await expect(theirs.getByRole("button", { name: /: 1 like$/ })).toHaveCount(0);
  await expect(theirs.getByRole("group", { name: "Recent activity" })).toContainText("Ines liked");
  const spot = theirs.locator("[data-spot-highlight]");
  await expect(spot).toHaveCount(1);
  const theirPhoto = await box(theirs.getByRole("img", { name: PHOTO }));
  const at = await box(spot);
  expect(Math.abs(at.x - (theirPhoto.x + theirPhoto.width * 0.3))).toBeLessThan(40);
  expect(Math.abs(at.y - (theirPhoto.y + theirPhoto.height * 0.5))).toBeLessThan(40);
  expect(photo.width).toBeGreaterThan(0);
});

test("on a desktop, the photo has a stage of its own with the buttons floating on it, and the words a panel", async ({
  browser,
}) => {
  const page = await phone(browser, DESKTOP);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await settled(home);

  // The photo, whole, on the stage on the left, up to the panel down the
  // right; the buttons float on the photo, down its right edge.
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
  const rail = await box(home.locator("[data-rail]"));
  for (const button of [heartOf(home), home.getByRole("button", { name: "More options" })]) {
    const at = await box(button);
    expect(at.x).toBeGreaterThanOrEqual(photo.x + photo.width - 80);
    expect(at.x + at.width).toBeLessThanOrEqual(photo.x + photo.width - 8);
    expect(at.y).toBeGreaterThanOrEqual(photo.y);
  }
  // (Just inside the photo's bottom corner, with the photo's own arrow just inside them.)
  expect(Math.abs(rail.y + rail.height - (photo.y + photo.height - 12))).toBeLessThanOrEqual(2);
  const arrow = await box(home.getByRole("button", { name: "Next photo" }));
  expect(arrow.x + arrow.width).toBeLessThan(rail.x);
  // What people did on the photo (or, before anyone has, what you can do)
  // floats in a caption a little above its foot, centred under it and clear
  // of the buttons.
  const caption = await box(home.getByRole("group", { name: "Recent activity" }));
  expect(caption.y + caption.height).toBeLessThanOrEqual(photo.y + photo.height - 20);
  expect(caption.y + caption.height).toBeGreaterThanOrEqual(photo.y + photo.height - 30);
  expect(Math.abs(caption.x + caption.width / 2 - (photo.x + photo.width / 2))).toBeLessThanOrEqual(2);
  expect(caption.x + caption.width).toBeLessThan(rail.x);
  // The rest of the words, not one of them on the photo: the panel says what
  // the home is, then, in a word, how people took it, each a way in (what
  // was said is in one place only: the comments).
  const panelWords = home.locator("[data-words]");
  await expect(panelWords.getByText("Price per sq ft")).toBeVisible();
  await expect(panelWords.getByRole("button", { name: /^\d+ likes?\. See the scorecard$/ })).toBeVisible();
  await expect(panelWords.getByRole("button", { name: /^\d+ comments?\. Read them$/ })).toBeVisible();
  await expect(panelWords.getByRole("list", { name: "Comments and likes" })).toHaveCount(0);
  // On the stage's own dark, every fact you can react to looks like it: a
  // chip (each detail, a tile) of the same frosted glass as the buttons on
  // the photo, with a word on what a tap does.
  await expect(panelWords.getByText("Tap any detail to like it or comment")).toBeVisible();
  const details = panelWords.getByRole("list", { name: "The details" }).getByRole("button");
  expect(await details.count()).toBeGreaterThanOrEqual(3);
  for (const fact of [home.getByRole("button", { name: /^\$[\d,]+/ }), home.getByRole("button", { name: /^\d+ beds?/ }), details.first()]) {
    expect(await fact.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  }
  expect(await panelWords.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  for (const words of [
    home.getByRole("button", { name: /^\$[\d,]+/ }),
    home.getByRole("button", { name: /^\d+ beds?/ }),
    home.getByRole("button", { name: /^1880 Tamsen Ridge Pl SE, / }),
    home.getByText(/^Clean modern lines under a mature shade tree/),
    home.getByText(/^Listed by/),
  ]) {
    expect((await box(words)).x).toBeGreaterThanOrEqual(photo.x + photo.width);
  }
  // The panel has the room: the whole description, no "more".
  await expect(home.getByRole("button", { name: "more", exact: true })).toHaveCount(0);

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

  // Up and down the homes from the photo's top right corner (on the first
  // home, nothing before it: just the way down, in the same place as ever).
  await expect(home.getByRole("button", { name: "Go to the previous home" })).toHaveCount(0);
  await expect(home.locator('[data-follow="previous"]')).toBeDisabled();
  await expect(home.locator('[data-follow="previous"]')).toBeHidden();
  const down = await box(home.getByRole("button", { name: "Go to the next home" }));
  expect(down.x + down.width).toBeLessThanOrEqual(photo.x + photo.width - 8);
  expect(down.x + down.width).toBeGreaterThanOrEqual(photo.x + photo.width - 30);
  expect(down.y).toBeGreaterThanOrEqual(photo.y);
  expect(down.y).toBeLessThanOrEqual(photo.y + 80);
  await home.getByRole("button", { name: "Go to the next home" }).click();
  const second = page.getByRole("article").nth(1);
  await settled(second);
  // From the keyboard, again and again: the keyboard goes along to the same
  // button on each home, never left behind out of sight.
  await page.keyboard.press("Enter");
  const third_ = page.getByRole("article").nth(2);
  await settled(third_);
  await expect(third_.getByRole("button", { name: "Go to the next home" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(third_.getByRole("button", { name: "Go to the previous home" })).toBeFocused();
  await page.keyboard.press("Enter");
  await settled(second);
  await expect(second.getByRole("button", { name: "Go to the previous home" })).toBeFocused();
  // J and K only while the feed itself has the keyboard: not on a button
  // (a letter meant for it, or a word said to the computer), but after a
  // click on the feed anywhere else.
  await page.keyboard.press("j");
  await page.waitForTimeout(600);
  await settled(second);
  const blank = await box(second.locator("[data-words]"));
  await page.mouse.click(blank.x + blank.width / 2, blank.y + blank.height - 120);
  await page.keyboard.press("k");
  await settled(home);
  await page.mouse.click(blank.x + blank.width / 2, blank.y + blank.height - 120);
  await page.keyboard.press("j");
  await settled(second);
  expect(pageErrors).toEqual([]);
});

test("on a desktop, comments sit beside the photo, which can still be tapped; Escape puts them away", async ({
  browser,
}) => {
  // (On a home already among the busiest this week by now: what's said here
  // doesn't change which homes lead the feed in later tests.)
  const page = await phone(browser, DESKTOP);
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, "3518 Wexford Ave N");
  await settled(home);
  const rail = home.getByRole("button", { name: /^Comments/ });
  await rail.click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  // In the panel's place, and not shutting off the rest of the page.
  const words = home.locator("[data-words]");
  const panel = await box(words);
  await expect.poll(async () => Math.round((await box(sheet)).x)).toBe(Math.round(panel.x));
  expect(await sheet.evaluate((el) => el.matches(":modal"))).toBe(false);
  // What's under it is out of reach: Tab goes from the buttons down the side
  // into the comments, where the panel was, and back.
  await expect(words).toHaveAttribute("inert");
  const more = home.getByRole("button", { name: "More options" });
  await more.focus();
  await page.keyboard.press("Tab");
  // (First, in its header, the tab that's showing; Close after it.)
  await expect(sheet.getByRole("tab", { name: /^Comments/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(more).toBeFocused();
  // Escape closes it from anywhere: from out on the buttons, the keyboard
  // stays where it is.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(more).toBeFocused();
  await expect(words).not.toHaveAttribute("inert");
  // From inside it, the keyboard goes back to the button that opened it.
  await rail.press("Enter");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(rail).toBeFocused();
  // From the comment bar, the keyboard starts in the box. The first time,
  // the name prompt rises from the foot of the panel, not across the photo.
  const bar = home.getByRole("button", { name: "Add a comment…" });
  await bar.click();
  const field = sheet.getByLabel("Add a comment");
  await expect(field).toBeFocused();
  // (The box is focused while it's still sliding in: the feed doesn't shift.)
  expect(await page.evaluate(() => document.querySelector("[data-dark-ground]")!.scrollLeft)).toBe(0);
  await field.fill("The porch swing stays, I hope.");
  await field.press("Enter");
  const prompt = page.getByRole("dialog", { name: "What's your first name?" });
  await expect(prompt).toBeVisible();
  await expect.poll(async () => Math.round((await box(prompt)).y + (await box(prompt)).height)).toBe(Math.round(panel.y + panel.height));
  expect(Math.abs((await box(prompt)).x - panel.x)).toBeLessThanOrEqual(1);
  await joinAs(page, "Wren");
  await expect(commentIn(sheet, "Wren", "The porch swing stays, I hope.")).toBeVisible();
  // Escape, from the box, and the keyboard comes back to the bar.
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(bar).toBeFocused();
  // From inside the feed, back to the rail. It reads newest first, as on a
  // profile, a card for each: what you just did (liked the home), then
  // Wren's comment from before it.
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await settled(home);
  await rail.press("Enter");
  await expect(sheet).toBeVisible();
  const liked = sheet.getByRole("listitem").filter({ hasText: /You liked/ });
  await expect(liked).toBeVisible();
  expect((await box(liked)).y).toBeLessThan((await box(commentIn(sheet, "Wren", "The porch swing stays, I hope."))).y);
  await sheet.getByRole("button", { name: "Reply to your comment" }).focus();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(rail).toBeFocused();

  // A card open on the price goes when the comments take the panel's place.
  await home.getByRole("button", { name: /^\$[\d,]+/ }).click();
  await expect(home.locator("[data-spot-card]")).toBeVisible();
  await rail.click();
  await expect(sheet).toBeVisible();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);

  // With it open, a tap on the photo still opens a card about that spot,
  // whole, over anyone's words on the photo.
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
  await home.getByRole("button", { name: "Go to the next home" }).click();
  await settled(page.getByRole("article").nth(1));
  await expect(sheet).toBeHidden();
});

test("on a phone, comments rise to the photo's foot, and pull up to just under the header", async ({ browser }) => {
  for (const options of [undefined, IPHONE]) {
    const page = await phone(browser, options);
    await page.goto("/homes/SAMPLE-1006");
    const home = homeIn(page, "2205 Brackenfield Ct NW");
    await settled(home);
    const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
    const before = await box(photo);
    await home.getByRole("button", { name: /^Comments/ }).click();
    const sheet = page.getByRole("dialog", { name: "Comments" });
    await expect(sheet).toBeVisible();
    const { height } = page.viewportSize()!;
    await expect.poll(async () => Math.round((await box(sheet)).y + (await box(sheet)).height)).toBe(height);
    // At the photo's foot, between 35% and 55% of the way down: the whole
    // photo shows when it fits (an iPhone), and the photo doesn't move.
    const top = (await box(sheet)).y;
    expect(top).toBeGreaterThanOrEqual(height * 0.35 - 1);
    expect(top).toBeLessThanOrEqual(height * 0.55 + 1);
    expect(top).toBeLessThanOrEqual(before.y + before.height + 1);
    // (Never more than 55% down, so the comments have room: on an iPhone the
    // photo now reaches a little further, and the sheet covers its foot.)
    if (options === IPHONE) expect(Math.abs(top - Math.min(before.y + before.height, height * 0.55))).toBeLessThanOrEqual(1);
    const after = await box(photo);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);

    // The handle drags it up to just under the header, and back down.
    const drag = async (dy: number) => {
      const handle = await box(sheet.getByRole("heading").first());
      const [x, y] = [handle.x + handle.width / 2, handle.y + handle.height / 2];
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (dy * i) / 8);
      await page.mouse.up();
    };
    await drag(-320);
    await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(HEADER);
    await drag(320);
    await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(Math.round(top));
    await expect(sheet).toBeVisible();
    // Or, without dragging, the handle is a button that switches.
    await sheet.getByRole("button", { name: "Expand comments" }).press("Enter");
    await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(HEADER);
    await sheet.getByRole("button", { name: "Shrink comments" }).press("Enter");
    await expect.poll(async () => Math.round((await box(sheet)).y)).toBe(Math.round(top));
    // Closed, the keyboard goes back to the button that opened it (once it's
    // back in view from under the sheet).
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(home.getByRole("button", { name: /^Comments/ })).toBeFocused();
    await page.context().close();
  }
});

test("every comment box says who sees it, and the name prompt rises like a sheet", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await page.goto("/homes/SAMPLE-1008");
  const home = homeIn(page, "719 Saltmarsh Ln");
  await settled(home);
  await home.getByRole("button", { name: "Add a comment…" }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet.getByText("Everyone can see your comment and first name.")).toBeVisible();
  const field = sheet.getByLabel("Add a comment");
  await field.fill("That fence");
  await field.press("Enter");
  // Your name, the first time, from the bottom like everything else.
  const prompt = page.getByRole("dialog", { name: "What's your first name?" });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("textbox", { name: "First name" })).toBeFocused();
  await expect.poll(async () => Math.round((await box(prompt)).y + (await box(prompt)).height)).toBe(page.viewportSize()!.height);
  await joinAs(page, "Odile");
  await expect(commentIn(sheet, "Odile", "That fence")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // On an agent's link: the agent and everyone on the link read what's said
  // there (each person's own link included), never "only you". (A home with
  // link activity already, so the feed's order in later tests stays put.)
  const agent = await signInAgent(browser, "lane@example.com", "Lane Agent");
  const { urls } = await createShare(agent, ["1204 Quillan"], ["Ottilie", "Pim"]);
  for (const name of ["Ottilie", "Pim"]) {
    const client = await (await browser.newContext()).newPage();
    await client.goto(urls[name]);
    const clientHome = homeIn(client, "1204 Quillan St SE");
    // The box asks you to tell the agent (and is still named "Add a comment").
    await clientHome.getByRole("button", { name: "Tell Lane what you think…" }).click();
    const private_ = client.getByRole("dialog", { name: "Comments" });
    await expect(private_.getByLabel("Add a comment")).toHaveAttribute("placeholder", "Tell Lane what you think…");
    await expect(private_.getByText("Only Lane Agent and people on this link see this.")).toBeVisible();
    await expect(private_.getByText(/Only you and/)).toHaveCount(0);
    await expect(private_.getByText(/Everyone can see/)).toHaveCount(0);
    if (name === "Pim") {
      // Liked, you may share it on the public page too: ticked, the line says so.
      await client.keyboard.press("Escape");
      await expect(private_).toBeHidden();
      await heartOf(clientHome).click();
      await expect(heartOf(clientHome)).toHaveAttribute("aria-pressed", "true");
      await clientHome.getByRole("button", { name: /^Comments/ }).click();
      await private_.getByRole("checkbox").check();
      await expect(private_.getByText("Your words also show on the public page, without your name.")).toBeVisible();
      await expect(private_.getByText(/Only Lane Agent/)).toHaveCount(0);
      await private_.getByRole("checkbox").uncheck();
      await expect(private_.getByText("Only Lane Agent and people on this link see this.")).toBeVisible();
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
