import { expect, test } from "@playwright/test";
import { signedIn, commentsOf, createShare, homeIn, joinAs, pick, settle, signInAgent, tapPhoto, heartOf } from "./helpers";

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

  // On a phone, comments on it are typed in the thread, which opens about just this spot.
  await door.getByRole("button", { name: /^Comment on the front door/ }).click();
  const sheet = commentsOf(home);
  await expect(sheet.getByRole("heading", { name: "On the front door" })).toBeVisible();
  await expect(sheet.getByText("No comments on the front door yet.")).toBeVisible();
  const field = sheet.getByLabel("Comment on the front door");
  await expect(field).toBeFocused();
  await field.fill("Love this door color");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();

  // Nothing stays drawn on the photo, and no line about it rolls over the
  // photo's foot any more: what was said is the newest of the latest comments
  // under the photo, with a pin to say it's about a spot in it. (Where you
  // tapped is where the card opened; the words stay put below.)
  await expect(home.locator("[data-pin], [data-pins-toggle], [data-spot-highlight]")).toHaveCount(0);
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  const latest = home.getByRole("group", { name: "Latest comments" });
  const said = latest.getByRole("button", { name: /Love this door color/ });
  await expect(said).toBeVisible();
  await expect(said.locator("svg.lucide-map-pin")).toHaveCount(1);
  const photo = (await home.getByRole("img", { name: PHOTO }).boundingBox())!;
  const saidBox = (await said.boundingBox())!;
  expect(saidBox.y).toBeGreaterThanOrEqual(photo.y + photo.height);

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
  // The latest comments are only comments: they never say who liked what,
  // so the like isn't announced there, and nothing is drawn on the photo;
  // the door's card still says one like.
  await expect(latest).not.toContainText(/liked a spot|You liked|Avery liked/);
  await expect(latest.getByRole("button", { name: /Love this door color/ })).toBeVisible();
  await expect(home.locator("[data-pin], [data-pins-toggle], [data-spot-highlight]")).toHaveCount(0);
  await tapPhoto(home, PHOTO, 0.6, 0.66);
  await expect(door.getByRole("button", { name: "Like the front door, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await door.getByRole("button", { name: "Close" }).click();

  // A tap on the comment under the photo opens the comments on it; there it
  // says which spot, and takes you there.
  await said.click();
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

test("on a desktop, the comment box opens right where you click, and what's said shows under the photo and in the comments", async ({
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
  // Nothing is left drawn on the photo, and nothing rolls over its foot:
  // what was said is the newest of the latest comments under the photo (the
  // same column as on a phone, under the row of things to do), with a pin to
  // say it's about a spot in it.
  await expect(home.locator("[data-pin], [data-pins-toggle], [data-spot-highlight]")).toHaveCount(0);
  await expect(home.getByRole("group", { name: "Recent activity" })).toHaveCount(0);
  // (Whole rows only: in the room a 900px-tall window leaves under a 44rem
  // photo, the row shows whole or not at all, with "View all" in its place.)
  const latest = home.locator("[data-words]").getByRole("group", { name: "Latest comments" });
  const said = latest.getByRole("button", { name: /These trees make the whole street/ });
  const viewAll = latest.getByRole("button", { name: /^View all \d+ comments?$/ });
  await expect(said.or(viewAll).first()).toBeVisible();
  const photo = (await home.getByRole("img", { name: PHOTO }).boundingBox())!;
  const actions = (await home.locator("[data-actions]").boundingBox())!;
  const latestBox = (await latest.boundingBox())!;
  expect(actions.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  expect(latestBox.y).toBeGreaterThanOrEqual(actions.y + actions.height - 1);
  if (await said.isVisible()) {
    await expect(said.locator("svg.lucide-map-pin")).toHaveCount(1);
    const saidBox = (await said.boundingBox())!;
    expect(saidBox.y + saidBox.height).toBeLessThanOrEqual(latestBox.y + latestBox.height + 1);
  } else {
    // No half a row: every row of it is out of the way, and "View all" counts them.
    for (const row of await latest.locator("[data-row]").all()) await expect(row).toBeHidden();
  }
  // The row under the photo says how many; the words are in the comments,
  // on a card with the spot it's about.
  await home.locator("[data-words]").getByRole("button", { name: /^Comments, \d+$/ }).click();
  const comments = commentsOf(home);
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

  // From the comments, the spot's name goes back to the spot, its card open.
  await home.locator("[data-words]").getByRole("button", { name: /^Comments, \d+$/ }).click();
  await card.getByRole("button", { name: /^About the mature trees/ }).click();
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
  // On a phone the price, size and address sit in a head above the photo, and
  // under the photo the row of things to do (the X and the heart first), the
  // latest comments, then the comment bar: nothing on the photo itself.
  await page.goto("/homes/SAMPLE-1003");
  const home = homeIn(page, CORBEL);
  // Scrolled all the way to it, so where things are stays put.
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  const photo = (await home.getByRole("img", { name: SHINGLED }).boundingBox())!;
  const head = home.locator("[data-home-head]");
  const headBox = (await head.boundingBox())!;
  expect(headBox.y + headBox.height).toBeLessThanOrEqual(photo.y + 1);
  const latest = (await home.getByRole("group", { name: "Latest comments" }).boundingBox())!;
  const row = home.locator("[data-actions]");
  const rowBox = (await row.boundingBox())!;
  const bar = (await home.locator("[data-bar-row]").boundingBox())!;
  const photoBottom = photo.y + photo.height;
  expect(rowBox.y).toBeGreaterThanOrEqual(photoBottom - 1);
  expect(latest.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1);
  expect(bar.y).toBeGreaterThanOrEqual(latest.y + latest.height - 1);

  // The heart is in the row, under the photo, not on it; just above the row,
  // inside the photo's bottom right corner, is the photo: a tap there opens
  // a card about that spot. (A tap on the heart itself likes the home.)
  const heart = (await heartOf(home).boundingBox())!;
  expect(heart.y).toBeGreaterThanOrEqual(photoBottom - 1);
  expect(heart.x).toBeGreaterThanOrEqual(rowBox.x);
  expect(heart.x + heart.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  const [x, y] = [photo.x + photo.width - 40, photoBottom - 24];
  await page.mouse.click(x, y);
  // (Signed out: signing up first, then the card.)
  await joinAs(page, "Sky");
  const card = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Like / }).click();
  await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");

  // A tap on the words under the photo (the latest comments) is on them: it
  // puts the card away, rather than starting a new one under them.
  // (On its first line, how many like it: plain words, not a comment's row,
  // which would open the comments.)
  const comments = (await home.getByRole("group", { name: "Latest comments" }).boundingBox())!;
  await page.mouse.click(comments.x + 40, comments.y + 12);
  await expect(card).toBeHidden();
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The words in the head are just words too: a tap on "Sample listing"
  // opens what the home is, over the photo, and no card.
  const sample = (await head.getByText(/Sample listing$/).boundingBox())!;
  await page.mouse.click(sample.x + sample.width / 2, sample.y + sample.height / 2);
  const about = home.getByRole("region", { name: "About this home" });
  await expect(about).toBeVisible();
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // The price is in the same head: a tap on it puts what the home is away
  // again, and opens no card.
  const price = (await home.locator('[data-fact="Price"]').boundingBox())!;
  await page.mouse.click(price.x + price.width / 2, price.y + price.height / 2);
  await expect(about).toBeHidden();
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  // Nor is a tap between the buttons in the row under the photo (between
  // Comments and Share, where there's room).
  const commentsButton = (await row.getByRole("button", { name: /^Comments/ }).boundingBox())!;
  // (Signed in, on a public home, it's Send; signed out, Share.)
  const share = (await row.getByRole("button", { name: /^(Share|Send) / }).boundingBox())!;
  expect(share.x - (commentsButton.x + commentsButton.width)).toBeGreaterThan(8);
  await page.mouse.click((commentsButton.x + commentsButton.width + share.x) / 2, share.y + share.height / 2);
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // (No Porchcard to read about it in: that's an agent's, in a client's homes.)
  await expect(home.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
  // Still nothing drawn on the photo where Sky liked it.
  await expect(home.locator("[data-pin], [data-pins-toggle], [data-spot-highlight]")).toHaveCount(0);

  // With a card open, a tap on the head is a tap off the photo too: what the
  // home is opens over the photo, and the card goes with the photo, rather
  // than floating over the description.
  await page.mouse.click(x, y);
  await expect(card).toBeVisible();
  await settle(card);
  await page.mouse.click(sample.x + sample.width / 2, sample.y + sample.height / 2);
  await expect(about).toBeVisible();
  await expect(card).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
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
  const sheet = commentsOf(home);
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
  const sheet = commentsOf(home);
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
  const publicComments = commentsOf(publicHome);
  await expect(publicComments).toBeVisible();
  await expect(publicComments).not.toContainText("The evergreens are my favorite part");
  await expect(publicComments).not.toContainText(/didn't like .*evergreens/);
});
