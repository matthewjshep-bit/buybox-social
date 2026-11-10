import { expect, test } from "@playwright/test";
import { commentIn, homeIn, joinAs } from "./helpers";

const BRACKENFIELD = "2205 Brackenfield Ct NW";
// The phone settings carry over to new contexts, touch included; a desktop has none.
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

test("comments rise from the comment bar under the description, like a reel", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // The bar sits right under the description, at the bottom of the screen.
  const bar = home.getByRole("button", { name: "Add a comment…" });
  await expect(bar).toBeVisible();
  const listedBy = (await home.getByText(/^Listed by/).boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  const { height } = page.viewportSize()!;
  expect(barBox.y).toBeGreaterThan(listedBy.y);
  expect(barBox.y + barBox.height).toBeGreaterThan(height - 40);

  // Tapping it raises the comments from the bottom, ready to type, to the
  // photo's foot (but no lower than 55% of the way down), and the photo stays
  // just as it was.
  const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
  const photoBefore = (await photo.boundingBox())!;
  await bar.click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  const field = sheet.getByLabel("Add a comment");
  await expect(field).toBeFocused();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(height);
  const sheetTop = (await sheet.boundingBox())!.y;
  expect(sheetTop).toBeGreaterThanOrEqual(height * 0.35 - 1);
  expect(sheetTop).toBeLessThanOrEqual(height * 0.55 + 1);
  expect(sheetTop).toBeLessThanOrEqual(photoBefore.y + photoBefore.height + 1);
  const photoAfter = (await photo.boundingBox())!;
  expect(Math.abs(photoAfter.y - photoBefore.y)).toBeLessThan(2);
  expect(Math.abs(photoAfter.height - photoBefore.height)).toBeLessThan(2);
  // Who sees it, under the box.
  await expect(sheet.getByText("Everyone can see your comment and first name.")).toBeVisible();

  // A quick emoji, then Enter posts it.
  await sheet.getByRole("button", { name: "🔥" }).click();
  await expect(field).toHaveValue("🔥");
  await field.fill("That lawn 🔥");
  await field.press("Enter");
  await joinAs(page, "Avery");
  const mine = commentIn(sheet, "Avery", "That lawn 🔥");
  await expect(mine).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "1 comment" })).toBeVisible();

  // Reply points the same box at the comment; the reply opens under it.
  await mine.getByRole("button", { name: "Reply to your comment" }).click();
  const replyField = sheet.getByLabel("Reply to yourself");
  await expect(replyField).toBeFocused();
  await replyField.fill("And the trees.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  const replies = sheet.getByRole("list", { name: "Replies to Avery" });
  await expect(replies.getByText("And the trees.")).toBeVisible();
  // Back to a plain comment box, and replies fold away.
  await expect(sheet.getByLabel("Add a comment")).toBeVisible();
  await sheet.getByRole("button", { name: "Hide replies" }).click();
  await expect(replies).toBeHidden();
  await sheet.getByRole("button", { name: "View 1 reply" }).click();
  await expect(replies).toBeVisible();

  // Dragging the handle down closes it.
  const title = (await sheet.getByRole("heading", { name: "2 comments" }).boundingBox())!;
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(title.x + title.width / 2, title.y + i * 30);
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await expect(home.getByRole("button", { name: "Comments, 2" })).toBeVisible();

  // The rail's comment button opens it too, without the keyboard, at the
  // top of the thread (though the last word in it is yours).
  await home.getByRole("button", { name: "Comments, 2" }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Add a comment")).not.toBeFocused();
  await page.waitForTimeout(400);
  expect(await sheet.locator("div.overflow-y-auto").evaluate((body) => body.scrollTop)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  expect(pageErrors).toEqual([]);
});

test("on a desktop, the whole photo sits beside the words; press and hold to see it alone", async ({ browser }) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // The whole photo, on a stage of its own on the left, up to just short of
  // the panel (the buttons float on it).
  const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
  await expect.poll(async () => (await photo.boundingBox())!.width).toBeGreaterThan(800);
  const box = (await photo.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1440 - 24 - 400);
  expect(box.x).toBeGreaterThanOrEqual(23);
  expect(box.x + box.width).toBeLessThanOrEqual(1440 - 400 + 1);

  // The words are in a white panel down the right, read from the left, inside its padding.
  const panel = (await home.locator("[data-words]").boundingBox())!;
  expect(panel.x - (box.x + box.width)).toBeGreaterThanOrEqual(15);
  expect(panel.x).toBeGreaterThanOrEqual(1000);
  const description = home.getByText(/^Traditional brick-front home/);
  await expect(description).toHaveCSS("text-align", "start");
  expect(Math.abs((await description.boundingBox())!.x - (panel.x + 20))).toBeLessThan(2);
  const bar = (await home.getByRole("button", { name: "Add a comment…" }).boundingBox())!;
  expect(bar.x).toBeGreaterThanOrEqual(panel.x);

  // Pressing and holding the photo clears everything off it; letting go
  // brings it back, without opening anything where it was pressed.
  const price = home.getByText("$1,089,000");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.mouse.down();
  await expect(price).toBeHidden();
  await expect(home.getByRole("button", { name: /^Comments/ })).toBeHidden();
  await expect(page.getByRole("link", { name: "BuyBox Social" })).toBeHidden();
  // The photo stays just where it was while it's held.
  const held = (await photo.boundingBox())!;
  expect(Math.abs(held.x - box.x)).toBeLessThan(2);
  expect(Math.abs(held.y - box.y)).toBeLessThan(2);
  await page.mouse.up();
  await expect(price).toBeVisible();
  await expect(page.getByRole("link", { name: "BuyBox Social" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(home.getByRole("button", { name: "Close" })).toHaveCount(0);
  // The photo never moved.
  const after = (await photo.boundingBox())!;
  expect(Math.abs(after.x - box.x)).toBeLessThan(2);
  expect(Math.abs(after.y - box.y)).toBeLessThan(2);
});

test("on a desktop, comments dock beside the photo", async ({ browser }) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
  await expect.poll(async () => (await photo.boundingBox())!.width).toBeGreaterThan(800);
  const before = (await photo.boundingBox())!;
  await home.getByRole("button", { name: /^Comments/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  // In the white panel's place, the photo just as it was.
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.x)).toBe(1016);
  const box = (await sheet.boundingBox())!;
  expect(Math.abs(box.x + box.width - 1416)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.width - 400)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y - 72)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height - 876)).toBeLessThanOrEqual(2);
  const after = (await photo.boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(2);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});
