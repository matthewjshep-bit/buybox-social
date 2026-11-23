import { expect, test } from "@playwright/test";
import { commentIn, commentsOf, homeIn, joinAs } from "./helpers";

const BRACKENFIELD = "2205 Brackenfield Ct NW";
// The phone settings carry over to new contexts, touch included; a desktop has none.
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

test("comments unfurl from the comment bar, under the head and over the photo, like a post's", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // The bar sits right under the words, at the bottom of the screen.
  const bar = home.getByRole("button", { name: "Add a comment…" });
  await expect(bar).toBeVisible();
  const address = (await home.locator('[data-fact="Address"]').boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  const { height } = page.viewportSize()!;
  expect(barBox.y).toBeGreaterThan(address.y);
  expect(barBox.y + barBox.height).toBeGreaterThan(height - 40);

  // Tapping it unfurls the comments where the latest of them were, ready to
  // type: the block grows up over the photo to just under the head, which
  // stays. No sheet: the same dark ground, one place for comments.
  const head = (await home.locator("[data-home-head]").boundingBox())!;
  // (Signed out, signing up comes first; then the comments, where they were going.)
  await bar.click();
  await joinAs(page, "Avery");
  const thread = commentsOf(home);
  await expect(thread).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  const field = thread.getByLabel("Add a comment");
  await expect(field).toBeFocused();
  await expect.poll(async () => Math.round((await thread.boundingBox())!.y)).toBe(Math.round(head.y + head.height));
  expect(Math.round((await thread.boundingBox())!.y + (await thread.boundingBox())!.height)).toBe(height);
  await expect(home.locator("[data-home-head]")).toBeVisible();
  await expect(thread.getByRole("heading", { name: "Comments" })).toBeVisible();
  // Who sees it, under the box.
  await expect(thread.getByText("Public, with your first name.")).toBeVisible();

  // A quick emoji, then Enter posts it.
  await thread.getByRole("button", { name: "🔥" }).click();
  await expect(field).toHaveValue("🔥");
  await field.fill("That lawn 🔥");
  await field.press("Enter");
  const mine = commentIn(thread, "Avery", "That lawn 🔥");
  await expect(mine).toBeVisible();
  await expect(thread.getByRole("heading", { name: "1 comment" })).toBeVisible();

  // Reply points the same box at the comment; the reply opens under it.
  await mine.getByRole("button", { name: "Reply to your comment" }).click();
  const replyField = thread.getByLabel("Reply to yourself");
  await expect(replyField).toBeFocused();
  await replyField.fill("And the trees.");
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  const replies = thread.getByRole("list", { name: "Replies to Avery" });
  await expect(replies.getByText("And the trees.")).toBeVisible();
  // Back to a plain comment box, and replies fold away.
  await expect(thread.getByLabel("Add a comment")).toBeVisible();
  await thread.getByRole("button", { name: "Hide replies" }).click();
  await expect(replies).toBeHidden();
  await thread.getByRole("button", { name: "View 1 reply" }).click();
  await expect(replies).toBeVisible();

  // The X at the top folds them away: the latest comments and the bar again.
  await expect(thread.getByRole("heading", { name: "2 comments" })).toBeVisible();
  await thread.getByRole("button", { name: "Hide comments" }).click();
  await expect(thread).toBeHidden();
  await expect(home.getByRole("button", { name: "Comments, 2" })).toBeVisible();
  await expect(home.getByRole("group", { name: "Latest comments" })).toContainText("That lawn 🔥");

  // The bar's comment button opens them too, without the keyboard, at the
  // top of the thread (though the last word in it is yours).
  await home.getByRole("button", { name: "Comments, 2" }).click();
  await expect(thread).toBeVisible();
  await expect(thread.getByLabel("Add a comment")).not.toBeFocused();
  await page.waitForTimeout(400);
  expect(await thread.locator("[data-thread-scroll]").evaluate((body) => body.scrollTop)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(thread).toBeHidden();
  await expect(home.getByRole("button", { name: "Comments, 2" })).toBeFocused();

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
  // (The comment box itself is in the panel, at its foot.)
  const bar = (await home.getByRole("textbox", { name: "Add a comment" }).boundingBox())!;
  expect(bar.x).toBeGreaterThanOrEqual(panel.x);

  // Pressing and holding the photo clears everything off it; letting go
  // brings it back, without opening anything where it was pressed.
  const price = home.getByText("$1,089,000");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3);
  await page.mouse.down();
  await expect(price).toBeHidden();
  await expect(home.getByRole("button", { name: /^Comments/ })).toBeHidden();
  await expect(page.getByRole("link", { name: "Porchcard" })).toBeHidden();
  // The photo stays just where it was while it's held.
  const held = (await photo.boundingBox())!;
  expect(Math.abs(held.x - box.x)).toBeLessThan(2);
  expect(Math.abs(held.y - box.y)).toBeLessThan(2);
  await page.mouse.up();
  await expect(price).toBeVisible();
  await expect(page.getByRole("link", { name: "Porchcard" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(home.getByRole("button", { name: "Close" })).toHaveCount(0);
  // The photo never moved.
  const after = (await photo.boundingBox())!;
  expect(Math.abs(after.x - box.x)).toBeLessThan(2);
  expect(Math.abs(after.y - box.y)).toBeLessThan(2);
});

test("on a desktop, comments unfurl in the panel beside the photo", async ({ browser }) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
  await expect.poll(async () => (await photo.boundingBox())!.width).toBeGreaterThan(800);
  const before = (await photo.boundingBox())!;
  const panel = (await home.locator("[data-words]").boundingBox())!;
  await home.getByRole("button", { name: /^Comments/ }).click();
  const thread = commentsOf(home);
  await expect(thread).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  // In the panel itself (level with the photos beside it), the photo just as it was.
  await expect.poll(async () => Math.round((await thread.boundingBox())!.x)).toBe(1016);
  const box = (await thread.boundingBox())!;
  expect(Math.abs(box.x + box.width - 1416)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.width - 400)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y - panel.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height - (panel.y + panel.height))).toBeLessThanOrEqual(2);
  const after = (await photo.boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(2);
  // The panel isn't shut off: its words and buttons stay in reach, with the
  // comment box at its foot, and "Hide comments" at the thread's end.
  await expect(home.locator("[data-words]")).not.toHaveAttribute("inert");
  await expect(thread.getByLabel("Add a comment")).toBeVisible();
  await expect(thread.getByRole("button", { name: "Hide comments" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(thread).toBeHidden();
  await expect(home.getByRole("group", { name: "Latest comments" })).toBeVisible();
});
