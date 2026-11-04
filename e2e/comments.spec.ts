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

  // Tapping it raises the comments from the bottom, ready to type.
  await bar.click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  const field = sheet.getByLabel("Add a comment");
  await expect(field).toBeFocused();
  await expect.poll(async () => Math.round((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height)).toBe(height);
  const sheetTop = (await sheet.boundingBox())!.y;
  expect(sheetTop).toBeGreaterThan(height * 0.2);
  expect(sheetTop).toBeLessThan(height * 0.35);
  // The photo glides up into the space above them.
  const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
  await expect.poll(async () => (await photo.boundingBox())!.y + (await photo.boundingBox())!.height).toBeLessThanOrEqual(sheetTop);

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

  // Dragging the handle down closes it, and the photo settles back.
  const title = (await sheet.getByRole("heading", { name: "2 comments" }).boundingBox())!;
  await page.mouse.move(title.x + title.width / 2, title.y + title.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(title.x + title.width / 2, title.y + i * 30);
  await page.mouse.up();
  await expect(sheet).toBeHidden();
  await expect(home.getByRole("button", { name: "Comments, 2" })).toBeVisible();

  // The rail's comment button opens it too, without the keyboard.
  await home.getByRole("button", { name: "Comments, 2" }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Add a comment")).not.toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  expect(pageErrors).toEqual([]);
});

test("on a desktop, comments rise from the bottom too, over the home, and over its pane beside the map", async ({
  browser,
}) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await home.getByRole("button", { name: /^Comments/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height).toBe(900);
  const box = (await sheet.boundingBox())!;
  // Centred under the home, not a panel down the side.
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
  expect(box.width).toBeLessThanOrEqual(672);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Beside the map, they rise over the home's pane, not the map.
  await page.goto("/search?home=SAMPLE-1006");
  const pane = page.getByRole("region", { name: "Homes" });
  const paneBox = (await pane.boundingBox())!;
  await homeIn(page, BRACKENFIELD).getByRole("button", { name: "Add a comment…" }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Add a comment")).toBeFocused();
  const inPane = (await sheet.boundingBox())!;
  expect(inPane.x).toBeGreaterThanOrEqual(paneBox.x - 1);
  expect(inPane.x + inPane.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
});
