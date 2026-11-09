import { expect, test } from "@playwright/test";
import { createShare, homeIn, joinAs, pick, settle, signInAgent, tapPhoto } from "./helpers";

// The phone settings carry over to new contexts, touch included; a desktop has none.
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
const LARKMOOR = "4127 Larkmoor Ave NE";
const PHOTO = "White Craftsman home with a covered front porch";

test("tap anywhere on a photo to like that spot or comment on it, and it shows where you tapped", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1001");
  const home = homeIn(page, LARKMOOR);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  // A clean photo: nothing on it until you tap.
  await expect(home.getByRole("button", { name: /^Select / }).first()).toBeAttached();
  await expect(home.getByRole("group", { name: "Front door" })).toHaveCount(0);

  // Tap near the front door: a card for it, right there.
  await tapPhoto(home, PHOTO, 0.6, 0.66);
  const door = home.getByRole("group", { name: "Front door" });
  await expect(door).toBeVisible();
  await settle(door);
  await door.getByRole("button", { name: "Like the front door", exact: true }).click();
  await joinAs(page, "Avery");
  await expect(door.getByRole("button", { name: "Like the front door, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");

  // On a phone, comments on it are typed in a sheet, the spot still in view above.
  await door.getByRole("button", { name: /^Comment on the front door/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet.getByRole("heading", { name: "On the front door" })).toBeVisible();
  await expect(sheet.getByText("Be the first to say something about the front door.")).toBeVisible();
  const field = sheet.getByLabel("Comment on the front door");
  await expect(field).toBeFocused();
  await field.fill("Love this door color");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();

  // Nothing stays drawn on the photo: what was said leads the line at its
  // foot (held there, so it can be looked at), with the hotspot exactly where
  // the tap was (not moved onto the door's middle). The photo and the hotspot
  // are measured together each time, so a page still settling (the sheet
  // going) is waited out, not measured halfway.
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  const line = home.getByRole("group", { name: "Recent activity" });
  const pause = line.getByRole("button", { name: "Pause activity" });
  if (await pause.isVisible()) await pause.click();
  await expect(line).toContainText("Love this door color");
  const pin = home.locator("[data-spot-highlight]");
  const photo = home.getByRole("img", { name: PHOTO });
  const offBy = async (target: typeof pin, x: number, y: number) => {
    const [box, at] = await Promise.all([photo.boundingBox(), target.boundingBox()]);
    if (!box || !at) return Infinity;
    return Math.max(
      Math.abs(at.x + at.width / 2 - (box.x + box.width * x)),
      Math.abs(at.y + at.height / 2 - (box.y + box.height * y)),
    );
  };
  await expect.poll(() => offBy(pin, 0.6, 0.66), { timeout: 15_000 }).toBeLessThan(2);

  // Tapping there again is that same spot, liked.
  await tapPhoto(home, PHOTO, 0.6, 0.66);
  await expect(door.getByRole("button", { name: "Like the front door, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await door.getByRole("button", { name: "Close" }).click();

  // Anywhere else is "this spot", and a like there is its own, there: not
  // added to the door's.
  await tapPhoto(home, PHOTO, 0.1, 0.3);
  const spot = home.getByRole("group", { name: "This spot" });
  await expect(spot).toBeVisible();
  await settle(spot);
  await spot.getByRole("button", { name: "Like this spot", exact: true }).click();
  await expect(spot.getByRole("button", { name: "Like this spot, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await spot.getByRole("button", { name: "Close" }).click();
  await expect(spot).toBeHidden();
  // What you just did leads the line, with its hotspot there; the door's
  // card still says one like.
  await expect(line).toContainText(/You liked a spot/);
  await expect.poll(() => offBy(pin, 0.1, 0.3), { timeout: 15_000 }).toBeLessThan(2);
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  await tapPhoto(home, PHOTO, 0.6, 0.66);
  await expect(door.getByRole("button", { name: "Like the front door, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await door.getByRole("button", { name: "Close" }).click();

  // In the comments, it says which spot, and takes you there.
  await home.getByRole("button", { name: /^Comments/ }).click();
  const chip = sheet.getByRole("button", { name: /^About the front door/ });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(sheet).toBeHidden();
  await expect(door).toBeVisible();

  // The spot's own comments, from its card.
  await door.getByRole("button", { name: /^Comment on the front door.*1 comment so far$/ }).click();
  await expect(sheet.getByText("Love this door color")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  expect(pageErrors).toEqual([]);
});

test("on a desktop, the comment box opens right where you click, and what's said shows at the photo's foot and in the feed", async ({
  browser,
}) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1001");
  const home = homeIn(page, LARKMOOR);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  await tapPhoto(home, PHOTO, 0.83, 0.24);
  const trees = home.getByRole("group", { name: "Mature trees" });
  await expect(trees).toBeVisible();
  const box = trees.getByLabel("Comment on the mature trees");
  await expect(box).toBeFocused();
  await box.fill("These trees make the whole street");
  await box.press("Enter");
  await joinAs(page, "Jordan");
  await expect(trees).toBeHidden();
  // Nothing is left drawn on the photo: what was said leads the line at its
  // foot, with a hotspot on the trees, and it's in the feed beside the photo,
  // on a card with the spot it's about.
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  const line = home.getByRole("group", { name: "Recent activity" });
  const pause = line.getByRole("button", { name: "Pause activity" });
  if (await pause.isVisible()) await pause.click();
  await expect(line).toContainText("These trees make the whole street");
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(1);
  // The panel says how many; the words are in the comments, on a card with
  // the spot it's about.
  await home.locator("[data-words]").getByRole("button", { name: /^\d+ comments?\. Read them$/ }).click();
  const comments = page.getByRole("dialog", { name: "Comments" });
  const card = comments.getByRole("listitem").filter({ hasText: "These trees make the whole street" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("button", { name: /^About the mature trees/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(comments).toBeHidden();

  // A keyboard reaches the things in the photo too.
  const porch = await pick(home, "the covered porch");
  await expect(porch.getByRole("button", { name: "Like the covered porch", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(porch).toBeHidden();

  // From the comments, the card's photo goes back to the spot, its card open.
  await home.locator("[data-words]").getByRole("button", { name: /^\d+ comments?\. Read them$/ }).click();
  await card.getByRole("button", { name: /on the photo$/ }).click();
  await expect(comments).toBeHidden();
  await expect(trees).toBeVisible();
});

test("from the keyboard, each thing's name shows beside it, inside the photo and clear of the spot", async ({
  page,
  browser,
}) => {
  const desk = await (await browser.newContext(DESKTOP)).newPage();
  for (const at of [page, desk]) {
    await at.goto("/homes/SAMPLE-1001");
    const home = homeIn(at, LARKMOOR);
    await expect(home).toBeInViewport({ ratio: 0.9 });
    const photo = (await home.getByRole("img", { name: PHOTO }).boundingBox())!;
    // In the middle, and at the top right corner, where a name centred on it
    // would run off the photo.
    for (const [thing, x, y] of [
      ["the front door", 0.62, 0.68],
      ["the mature trees", 0.85, 0.22],
    ] as const) {
      const name = home.getByRole("button", { name: `Select ${thing}` });
      await name.focus();
      await at.keyboard.press("Shift+Tab");
      await at.keyboard.press("Tab");
      await expect(name).toBeFocused();
      const box = (await name.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(photo.x);
      expect(box.x + box.width).toBeLessThanOrEqual(photo.x + photo.width);
      // Above or below the spot, never over a heart there (20px across).
      const spot = photo.y + photo.height * y;
      expect(box.y >= spot + 10 || box.y + box.height <= spot - 10).toBe(true);
      expect(photo.x + photo.width * x).toBeGreaterThan(box.x);
    }
  }
});

test("a tap on the words or the buttons isn't a tap on the photo, but just beside them is", async ({ page }) => {
  const CORBEL = "812 N Corbel St";
  const SHINGLED = "Shingled home with a wraparound porch and green lawn";
  // On a phone the words sit below the photo; the buttons down the right
  // reach over its bottom corner.
  await page.goto("/homes/SAMPLE-1003");
  const home = homeIn(page, CORBEL);
  // Scrolled all the way to it, so where things are stays put.
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  const photo = (await home.getByRole("img", { name: SHINGLED }).boundingBox())!;
  const rail = (await home.locator("[data-rail]").boundingBox())!;
  const photoBottom = photo.y + photo.height;
  expect(rail.y).toBeLessThan(photoBottom - 20);

  // Just left of the buttons (beside the heart, well above the line at the
  // photo's foot) is the photo: a tap there opens a card about that spot.
  const [x, y] = [rail.x - 18, rail.y + 30];
  expect(y).toBeLessThan(photoBottom - 80);
  await page.mouse.click(x, y);
  const card = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Like / }).click();
  await joinAs(page, "Sky");
  await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");

  // A tap on the words is on them: it puts the card away, rather than
  // starting a new one under them.
  const sample = (await home.getByText(/Sample listing$/).boundingBox())!;
  await page.mouse.click(sample.x + sample.width / 2, sample.y + sample.height / 2);
  await expect(card).toBeHidden();
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // Who listed it is something to react to of its own: its card, not one
  // about the photo under it.
  const listedBy = (await home.getByText(/^Listed by/).boundingBox())!;
  await page.mouse.click(listedBy.x + 40, listedBy.y + listedBy.height / 2);
  const listingAgent = home.getByRole("group", { name: "Listing agent" });
  await expect(listingAgent).toBeVisible();
  await expect(home.locator("[data-spot-card]")).toHaveCount(1);
  await settle(listingAgent);
  await listingAgent.getByRole("button", { name: "Close" }).click();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // Nor is a tap on the buttons.
  await page.mouse.click(rail.x + rail.width / 2, rail.y + rail.height - 4);
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The whole description is in the Scorecard, at "About this home".
  await home.getByRole("button", { name: "more", exact: true }).click();
  const scorecard = page.getByRole("dialog", { name: "Scorecard" });
  await expect(scorecard).toBeVisible();
  await expect(scorecard.getByRole("heading", { name: "About this home" })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(scorecard).toBeHidden();
  // Still nothing drawn on the photo where Sky liked it.
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
});

test("dislike a spot or a fact as easily as liking it, and say something about the price", async ({ page }) => {
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // A spot in the photo: Dislike, beside Like.
  await tapPhoto(home, "Dark modern home glowing at dusk beneath a large tree", 0.3, 0.3);
  const card = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Dislike / }).click();
  await joinAs(page, "Quinn");
  await expect(card.getByRole("button", { name: /^Dislike .*, 1 dislike$/ })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  // (Nothing is left drawn on the photo, for anyone.)
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);

  // The price is something to react to as well: the same card, above it.
  await home.getByRole("button", { name: /^\$[\d,]+$/ }).click();
  const price = home.getByRole("group", { name: "Price" });
  await expect(price).toBeVisible();
  await settle(price);
  await price.getByRole("button", { name: "Dislike the price", exact: true }).click();
  await expect(price.getByRole("button", { name: "Dislike the price, 1 dislike", exact: true })).toHaveAttribute("aria-pressed", "true");
  // A change of mind: a like takes the dislike's place.
  await price.getByRole("button", { name: "Like the price", exact: true }).click();
  await expect(price.getByRole("button", { name: "Like the price, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(price.getByRole("button", { name: "Dislike the price", exact: true })).toHaveAttribute("aria-pressed", "false");

  // And something said about it.
  await price.getByRole("button", { name: /^Comment on the price/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet.getByRole("heading", { name: "On the price" })).toBeVisible();
  await sheet.getByLabel("Comment on the price").fill("A little high for the street");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();
  // The price says so, quietly.
  await expect(home.getByRole("button", { name: /^\$[\d,]+, 1 like, 1 comment$/ })).toBeVisible();

  // In the comments: who liked what and didn't, and what was said about the price.
  await home.getByRole("button", { name: /^Comments/ }).click();
  await expect(sheet.getByText(/liked the price but not /)).toBeVisible();
  await sheet.getByRole("button", { name: /^About the price/ }).click();
  await expect(sheet).toBeHidden();
  await expect(price).toBeVisible();

  // Kept, on coming back: the price says so, and the spot's card still has
  // the dislike.
  await page.reload();
  await expect(home.getByRole("button", { name: /^\$[\d,]+, 1 like, 1 comment$/ })).toBeVisible();
  await tapPhoto(home, "Dark modern home glowing at dusk beneath a large tree", 0.3, 0.3);
  const again = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(again).toBeVisible();
  await expect(again.getByRole("button", { name: /^Dislike .*, 1 dislike$/ })).toHaveAttribute("aria-pressed", "true");
});

test("a spot comment on an agent's link stays on the link", async ({ browser }) => {
  const agent = await signInAgent(browser, "spots-agent@example.com", "Sloane Agent");
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Toby"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  const home = homeIn(client, "96 Fernhollow Ln");
  const card = await pick(home, "the evergreens");
  await card.getByRole("button", { name: "Comment" }).click();
  const sheet = client.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Comment on the evergreens").fill("The evergreens are my favorite part");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();
  // On the link, it's in the comments, on a card with the spot it's about.
  await home.getByRole("button", { name: /^Comments/ }).click();
  const said = sheet.getByRole("listitem").filter({ hasText: "The evergreens are my favorite part" });
  await expect(said).toBeVisible();
  await expect(said.getByRole("button", { name: /^About the evergreens/ })).toBeVisible();
  await client.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // So does not liking something there.
  const evergreens = await pick(home, "the evergreens");
  await evergreens.getByRole("button", { name: /^Dislike the evergreens/ }).click();
  await expect(evergreens.getByRole("button", { name: "Dislike the evergreens, 1 dislike", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Not on the public page.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/homes/SAMPLE-1004");
  await expect(homeIn(anon, "96 Fernhollow Ln")).toBeVisible();
  await expect(anon.getByText("The evergreens are my favorite part")).toHaveCount(0);
  await expect(homeIn(anon, "96 Fernhollow Ln").getByRole("button", { name: /\d dislikes?/ })).toHaveCount(0);
  // Not in the page's code either, nor (as a dislike) among the public comments.
  for (const path of ["/homes/SAMPLE-1004", "/"]) {
    const html = await (await anon.request.get(path)).text();
    expect(html).not.toContain("The evergreens are my favorite part");
  }
  const publicHome = homeIn(anon, "96 Fernhollow Ln");
  await publicHome.getByRole("button", { name: /^Comments/ }).click();
  const publicComments = anon.getByRole("dialog", { name: "Comments" });
  await expect(publicComments).toBeVisible();
  await expect(publicComments).not.toContainText("The evergreens are my favorite part");
  await expect(publicComments).not.toContainText(/didn't like .*evergreens/);
});
