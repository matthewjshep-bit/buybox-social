import { expect, test } from "@playwright/test";
import { signedIn, createShare, homeIn, joinAs, pick, settle, signInAgent, tapPhoto, heartOf } from "./helpers";

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

  // Signed out, a tap near the front door asks them to sign up first: no
  // card to like or comment on before that (from the keyboard too).
  await tapPhoto(home, PHOTO, 0.6, 0.66);
  const join = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(join).toBeVisible();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await join.getByRole("button", { name: "Not now" }).click();
  await expect(join).toBeHidden();
  await home.getByRole("button", { name: "Select the front door" }).press("Enter");
  await expect(join).toBeVisible();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await join.getByRole("button", { name: "Not now" }).click();
  // Signed up from the tap, its card opens, right there.
  await tapPhoto(home, PHOTO, 0.6, 0.66);
  await joinAs(page, "Avery");
  const door = home.getByRole("group", { name: "Front door" });
  await expect(door).toBeVisible();
  await settle(door);
  await door.getByRole("button", { name: "Like the front door", exact: true }).click();
  await expect(door.getByRole("button", { name: "Like the front door, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");

  // On a phone, comments on it are typed in a sheet, the spot still in view above.
  await door.getByRole("button", { name: /^Comment on the front door/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet.getByRole("heading", { name: "On the front door" })).toBeVisible();
  await expect(sheet.getByText("No comments on the front door yet.")).toBeVisible();
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
  // (The keyboard coming in stops it there, so it holds.)
  const control = line.getByRole("button", { name: /^(Pause|Play) activity$/ });
  if (await control.count()) await control.focus();
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
  await tapPhoto(home, PHOTO, 0.2, 0.3);
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
  await expect.poll(() => offBy(pin, 0.2, 0.3), { timeout: 15_000 }).toBeLessThan(2);
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

  // (Signed out: signing up first, then the card, the cursor in its box.)
  await tapPhoto(home, PHOTO, 0.83, 0.24);
  await joinAs(page, "Jordan");
  const trees = home.getByRole("group", { name: "Mature trees" });
  await expect(trees).toBeVisible();
  const box = trees.getByLabel("Comment on the mature trees");
  await expect(box).toBeFocused();
  await box.fill("These trees make the whole street");
  await box.press("Enter");
  await expect(trees).toBeHidden();
  // Nothing is left drawn on the photo: what was said leads the line at its
  // foot, with a hotspot on the trees, and it's in the feed beside the photo,
  // on a card with the spot it's about.
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
  const line = home.getByRole("group", { name: "Recent activity" });
  // (The keyboard coming in stops it there, so it holds.)
  const control = line.getByRole("button", { name: /^(Pause|Play) activity$/ });
  if (await control.count()) await control.focus();
  await expect(line).toContainText("These trees make the whole street");
  await expect(home.locator("[data-spot-highlight]")).toHaveCount(1);
  // The panel says how many; the words are in the comments, on a card with
  // the spot it's about.
  await home.locator("[data-words]").getByRole("button", { name: /^Comments, \d+$/ }).click();
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
  await home.locator("[data-words]").getByRole("button", { name: /^Comments, \d+$/ }).click();
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
  // On a phone the words sit below the photo, and the comment bar's row
  // under them: in the photo's two bottom corners, only the X and the heart.
  await page.goto("/homes/SAMPLE-1003");
  const home = homeIn(page, CORBEL);
  // Scrolled all the way to it, so where things are stays put.
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  const photo = (await home.getByRole("img", { name: SHINGLED }).boundingBox())!;
  const row = home.locator("[data-bar-row]");
  const rail = (await row.boundingBox())!;
  const photoBottom = photo.y + photo.height;
  expect(rail.y).toBeGreaterThanOrEqual(photoBottom);

  // Just above the heart in its bottom right corner is the photo: a tap
  // there opens a card about that spot. (A tap on the heart itself likes the home.)
  const heart = (await heartOf(home).boundingBox())!;
  expect(heart.x + heart.width).toBeGreaterThan(photo.x + photo.width - 20);
  expect(heart.y + heart.height).toBeLessThanOrEqual(photoBottom + 1);
  const [x, y] = [photo.x + photo.width - 40, heart.y - 24];
  await page.mouse.click(x, y);
  // (Signed out: signing up first, then the card.)
  await joinAs(page, "Sky");
  const card = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Like / }).click();
  await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");

  // A tap on the words is on them: it puts the card away, rather than
  // starting a new one under them.
  const sample = (await home.getByText(/Sample listing$/).boundingBox())!;
  await page.mouse.click(sample.x + sample.width / 2, sample.y + sample.height / 2);
  await expect(card).toBeHidden();
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // The price is just words: a tap on it opens nothing.
  const price = (await home.locator('[data-fact="Price"]').boundingBox())!;
  await page.mouse.click(price.x + price.width / 2, price.y + price.height / 2);
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // Nor is a tap between the buttons in the row.
  const save = (await row.getByRole("button", { name: /^Save / }).boundingBox())!;
  const more = (await row.getByRole("button", { name: "More options" }).boundingBox())!;
  await page.mouse.click((save.x + save.width + more.x) / 2, more.y + more.height / 2);
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // (No Porchcard to read about it in: that's an agent's, in a client's homes.)
  await expect(home.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
  // Still nothing drawn on the photo where Sky liked it.
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);
});

test("dislike a spot as easily as liking it; the price is words to read, said about in a comment", async ({ page }) => {
  await page.goto("/homes/SAMPLE-1002");
  const home = homeIn(page, "1880 Tamsen Ridge Pl SE");
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // A spot in the photo: Dislike, beside Like.
  await tapPhoto(home, "Dark modern home glowing at dusk beneath a large tree", 0.3, 0.3);
  await joinAs(page, "Quinn");
  const card = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Dislike / }).click();
  await expect(card.getByRole("button", { name: /^Dislike .*, 1 dislike$/ })).toHaveAttribute("aria-pressed", "true");
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  // (Nothing is left drawn on the photo, for anyone.)
  await expect(home.locator("[data-pin], [data-pins-toggle]")).toHaveCount(0);

  // The price, the size and the address are plain words: nothing to like
  // or dislike on them, no card. What someone thinks of the price, they say.
  await expect(home.getByRole("button", { name: /^\$[\d,]+/ })).toHaveCount(0);
  await expect(home.getByRole("group", { name: "Price" })).toHaveCount(0);
  await expect(home.getByRole("button", { name: /^Like the price/ })).toHaveCount(0);
  await home.getByRole("button", { name: "Add a comment…" }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Add a comment").fill("A little high for the street");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet.getByText("A little high for the street")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Kept, on coming back: the spot's card still has the dislike.
  await page.reload();
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await tapPhoto(home, "Dark modern home glowing at dusk beneath a large tree", 0.3, 0.3);
  const again = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(again).toBeVisible();
  await expect(again.getByRole("button", { name: /^Dislike .*, 1 dislike$/ })).toHaveAttribute("aria-pressed", "true");
});

test("a spot comment on an agent's link stays on the link", async ({ browser }) => {
  const agent = await signInAgent(browser, "spots-agent@example.com", "Sloane Agent");
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Toby"]);
  const client = await signedIn(browser);
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
