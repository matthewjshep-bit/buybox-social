import { expect, test } from "@playwright/test";
import { createShare, homeIn, joinAs, pick, signInAgent, tapPhoto } from "./helpers";

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
  await door.getByRole("button", { name: "Like the front door" }).click();
  await joinAs(page, "Avery");
  await expect(door.getByRole("button", { name: "Like the front door, 1 like" })).toHaveAttribute("aria-pressed", "true");

  // On a phone, comments on it are typed in a sheet, the spot still in view above.
  await door.getByRole("button", { name: "Comment" }).click();
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
  await expect(door.getByRole("button", { name: "Like the front door, 1 like" })).toHaveAttribute("aria-pressed", "true");
  await door.getByRole("button", { name: "Close" }).click();

  // Anywhere else is "this spot", and a like there is a heart of its own,
  // there: not added to the door's.
  await tapPhoto(home, PHOTO, 0.1, 0.3);
  const spot = home.getByRole("group", { name: "This spot" });
  await expect(spot).toBeVisible();
  await spot.getByRole("button", { name: "Like this spot" }).click();
  await expect(spot.getByRole("button", { name: "Like this spot, 1 like" })).toHaveAttribute("aria-pressed", "true");
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
  await door.getByRole("button", { name: "Comment 1" }).click();
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
  await expect(card.getByRole("button", { name: "Like the covered porch" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
});

test("nothing on a photo shows under the words over it, and a tap on the words isn't a tap on the photo", async ({
  browser,
}) => {
  // A small window: the photo goes on under the description.
  const page = await (await browser.newContext({ ...DESKTOP, viewport: { width: 500, height: 440 } })).newPage();
  await page.goto("/homes/SAMPLE-1003");
  const home = homeIn(page, "812 N Corbel St");
  // Scrolled all the way to it, so where things are stays put.
  await expect.poll(async () => Math.abs((await home.boundingBox())?.y ?? 99)).toBeLessThan(1);
  const more = home.getByRole("button", { name: "more", exact: true });
  const column = home.locator("[data-keep-clear]").filter({ has: page.getByRole("button", { name: "more", exact: true }) });
  const remarks = home.getByText(/^A classic shingled home with a wraparound porch/);

  // A heart just above the words.
  const top = (await column.boundingBox())!;
  await page.mouse.click(top.x + 60, top.y - 18);
  // (The photos are a group too.)
  const card = home.getByRole("group").and(home.locator("[data-spot-card]"));
  await expect(card).toBeVisible();
  await card.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await card.getByRole("button", { name: /^Like / }).click();
  await joinAs(page, "Rowan");
  await expect(card.getByRole("button", { name: /^Like .*, 1 like$/ })).toHaveAttribute("aria-pressed", "true");

  // A tap on the words is on them: it puts the card away, rather than
  // starting a new one under them.
  const words = (await remarks.boundingBox())!;
  await page.mouse.click(words.x + 40, words.y + words.height / 2);
  await expect(card).toBeHidden();
  const pin = home.getByRole("button", { name: /: 1 like$/ });
  await expect(pin).toBeVisible();

  // The whole description reaches over it, so it steps out of the way, and
  // comes back when the description's put away.
  await more.click();
  await expect(pin).toBeHidden();
  await home.getByRole("button", { name: "less", exact: true }).click();
  await expect(pin).toBeVisible();
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

  // Not on the public page.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/homes/SAMPLE-1004");
  await expect(homeIn(anon, "96 Fernhollow Ln")).toBeVisible();
  await expect(anon.getByText("The evergreens are my favorite part")).toHaveCount(0);
});
