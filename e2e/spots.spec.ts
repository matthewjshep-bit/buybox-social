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

  // It shows where it was said: the heart exactly where the tap was (not
  // moved onto the door's middle), the comment beside it.
  const pin = home.getByRole("button", { name: /^Front door: Avery: Love this door color, 1 like$/ });
  await expect(pin).toBeVisible();
  const box = (await home.getByRole("img", { name: PHOTO }).boundingBox())!;
  const centre = async () => {
    const at = (await pin.boundingBox())!;
    return [at.x + at.width / 2 - (box.x + box.width * 0.6), at.y + at.height / 2 - (box.y + box.height * 0.66)];
  };
  await expect.poll(async () => Math.max(...(await centre()).map(Math.abs))).toBeLessThan(2);

  // Tapping the heart again is that heart, liked.
  await tapPhoto(home, PHOTO, 0.6, 0.66);
  await expect(door.getByRole("button", { name: "Like the front door, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await door.getByRole("button", { name: "Close" }).click();

  // Anywhere else is "this spot", and a like there is a heart of its own,
  // there: not added to the door's.
  await tapPhoto(home, PHOTO, 0.1, 0.3);
  const spot = home.getByRole("group", { name: "This spot" });
  await expect(spot).toBeVisible();
  await settle(spot);
  await spot.getByRole("button", { name: "Like this spot", exact: true }).click();
  await expect(spot.getByRole("button", { name: "Like this spot, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await spot.getByRole("button", { name: "Close" }).click();
  await expect(spot).toBeHidden();
  const second = home.getByRole("button", { name: "A spot: 1 like" });
  await expect(second).toBeVisible();
  // (Once it's done popping in.)
  await expect
    .poll(async () => {
      const at = (await second.boundingBox())!;
      return Math.max(
        Math.abs(at.x + at.width / 2 - (box.x + box.width * 0.1)),
        Math.abs(at.y + at.height / 2 - (box.y + box.height * 0.3)),
      );
    })
    .toBeLessThan(2);
  await expect(pin).toHaveAccessibleName(/1 like$/);

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

test("on a desktop, the comment box opens right where you click, and what's said can be shown or hidden", async ({
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
  // Right where it was said, with who said it.
  const pin = home.getByRole("button", { name: /^Mature trees: Jordan: These trees make the whole street/ });
  const words = home.getByText("These trees make the whole street");
  await expect(pin).toBeVisible();
  await expect(words).toBeVisible();

  // The words can be put away, and shown again; who said something stays on the spot.
  const toggle = home.getByRole("button", { name: /comments on this photo/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(words).toBeHidden();
  await expect(pin).toBeVisible();

  // Coming back, just the spot until you ask for the words.
  await page.reload();
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(pin).toBeVisible();
  await expect(words).toBeHidden();
  await toggle.click();
  await expect(words).toBeVisible();

  // A keyboard reaches the things in the photo too.
  const card = await pick(home, "the covered porch");
  await expect(card.getByRole("button", { name: "Like the covered porch", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
});

test("nothing on a photo shows under the words or the buttons, and a tap on the words isn't a tap on the photo", async ({
  page,
  browser,
}) => {
  const CORBEL = "812 N Corbel St";
  const SHINGLED = "Shingled home with a wraparound porch and green lawn";
  // On a phone the words sit below the photo; the buttons down the right
  // reach over its bottom corner.
  await page.goto("/homes/SAMPLE-1003");
  const home = homeIn(page, CORBEL);
  // Scrolled all the way to it, so where things are stays put.
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  const photo = (await home.getByRole("img", { name: SHINGLED }).boundingBox())!;
  const rail = (await home.locator("[data-keep-clear]").filter({ has: home.page().getByRole("button", { name: /^Like (?!the )/ }) }).boundingBox())!;
  const photoBottom = photo.y + photo.height;
  expect(rail.y).toBeLessThan(photoBottom - 20);

  // Hearts at a point, by where they're drawn.
  const heartsAt = (where: typeof home, [px, py]: number[]) =>
    where.evaluate(
      (el, [x, y]) =>
        [...el.querySelectorAll("button[aria-label$='1 like']")].filter((pin) => {
          const box = pin.getBoundingClientRect();
          return Math.abs(box.x + box.width / 2 - x) < 3 && Math.abs(box.y + box.height / 2 - y) < 3;
        }).length,
      [px, py],
    );

  // A heart left (on a desktop, where nothing covers it) right where a
  // phone's buttons are: on the phone, it isn't drawn under them.
  const under = { x: (rail.x + rail.width / 2 - photo.x) / photo.width, y: (photoBottom - 12 - photo.y) / photo.height };
  const desk = await (await browser.newContext(DESKTOP)).newPage();
  await desk.goto("/homes/SAMPLE-1003");
  const deskHome = homeIn(desk, CORBEL);
  await expect.poll(async () => Math.abs((await deskHome.boundingBox())?.y ?? 99)).toBeLessThan(1);
  await tapPhoto(deskHome, SHINGLED, under.x, under.y);
  const deskCard = deskHome.getByRole("group").and(deskHome.locator("[data-spot-card]"));
  await expect(deskCard).toBeVisible();
  await settle(deskCard);
  await deskCard.getByRole("button", { name: /^Like / }).click();
  await joinAs(desk, "Rowan");
  await expect(deskCard.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  await expect(home.getByRole("button", { name: /^Comments/ })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await heartsAt(home, [photo.x + photo.width * under.x, photo.y + photo.height * under.y])).toBe(0);

  // Just left of the buttons is the photo: a tap there is a heart there.
  const [x, y] = [rail.x - 18, photoBottom - 25];
  await page.mouse.click(x, y);
  const card = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(card).toBeVisible();
  await settle(card);
  await card.getByRole("button", { name: /^Like / }).click();
  await joinAs(page, "Sky");
  await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");

  // A tap on the words is on them: it puts the card away, rather than
  // starting a new one under them.
  const listedBy = (await home.getByText(/^Listed by/).boundingBox())!;
  await page.mouse.click(listedBy.x + 40, listedBy.y + listedBy.height / 2);
  await expect(card).toBeHidden();
  await page.waitForTimeout(500);
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  await expect.poll(() => heartsAt(home, [x, y])).toBe(1);

  // The whole description opens over the photo, so the heart under it steps
  // out of the way, and comes back when the description's put away.
  await home.getByRole("button", { name: "more", exact: true }).click();
  await expect.poll(() => heartsAt(home, [x, y])).toBe(0);
  await home.getByRole("button", { name: "less", exact: true }).click();
  await expect.poll(() => heartsAt(home, [x, y])).toBe(1);
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
  await expect(home.getByRole("button", { name: /: 1 dislike$/ })).toBeVisible();

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

  // Kept, on coming back.
  await page.reload();
  await expect(home.getByRole("button", { name: /^\$[\d,]+, 1 like, 1 comment$/ })).toBeVisible();
  await expect(home.getByRole("button", { name: /: 1 dislike$/ })).toBeVisible();
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
  await expect(home.getByRole("button", { name: /^Evergreens: Toby: The evergreens are my favorite part/ })).toBeVisible();
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
});
