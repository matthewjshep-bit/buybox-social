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

test("on a desktop, the photo and the words are one centred column, as on a phone; press and hold to see the photo alone", async ({
  browser,
}) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // One layout at every width: the whole photo in a column 44rem wide,
  // centred in the window, under the head; no panel beside it.
  const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
  await expect.poll(async () => (await photo.boundingBox())!.width).toBeLessThanOrEqual(704 + 1);
  const box = (await photo.boundingBox())!;
  expect(box.width).toBeGreaterThan(600);
  expect(Math.abs(box.x + box.width / 2 - 1440 / 2)).toBeLessThanOrEqual(2);
  const head = (await home.locator("[data-home-head]").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(head.y + head.height - 1);

  // The words are under the photo, in the same column, on the dark ground:
  // first the row of things to do, then the comments, then the comment bar.
  const words = (await home.locator("[data-words]").boundingBox())!;
  expect(words.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
  expect(Math.abs(words.width - 704)).toBeLessThanOrEqual(1);
  expect(Math.abs(words.x + words.width / 2 - 1440 / 2)).toBeLessThanOrEqual(2);
  const actions = (await home.locator("[data-actions]").boundingBox())!;
  expect(actions.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
  const latest = (await home.getByRole("group", { name: "Latest comments" }).boundingBox())!;
  expect(latest.y).toBeGreaterThanOrEqual(actions.y + actions.height - 1);
  // (The comment bar is the one thing in its row, at the column's foot.)
  await expect(home.locator("[data-bar-row] button")).toHaveCount(1);
  const bar = (await home.getByRole("button", { name: "Add a comment…" }).boundingBox())!;
  expect(bar.y).toBeGreaterThanOrEqual(latest.y + latest.height - 1);
  expect(bar.x).toBeGreaterThanOrEqual(words.x);
  expect(bar.x + bar.width).toBeLessThanOrEqual(words.x + words.width + 1);
  await expect(home.getByRole("textbox", { name: "Add a comment" })).toHaveCount(0);

  // The description isn't under the photo: it opens from the head, over the
  // photo, read from the left inside its padding.
  await expect(home.getByText(/^Traditional brick-front home/)).toBeHidden();
  await home.getByRole("button", { name: "About this home" }).click();
  const about = home.getByRole("region", { name: "About this home" });
  await expect(about).toBeVisible();
  const description = about.getByText(/^Traditional brick-front home/);
  await expect(description).toBeVisible();
  await expect(description).toHaveCSS("text-align", "start");
  const aboutBox = (await about.boundingBox())!;
  expect(aboutBox.x).toBeGreaterThanOrEqual(words.x - 1);
  expect(aboutBox.x + aboutBox.width).toBeLessThanOrEqual(words.x + words.width + 1);
  expect(aboutBox.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
  expect(Math.abs((await description.boundingBox())!.x - (aboutBox.x + 16))).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();

  // Pressing and holding the photo clears everything off it; letting go
  // brings it back, without opening anything where it was pressed.
  const price = home.locator('[data-fact="Price"]');
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

test("on a desktop, comments unfurl over the photo in the same column, from the Comments button", async ({ browser }) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/homes/SAMPLE-1006");
  const home = homeIn(page, BRACKENFIELD);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  const photo = home.getByRole("img", { name: "Brick-front home with a wide lawn" });
  await expect.poll(async () => (await photo.boundingBox())!.width).toBeLessThanOrEqual(704 + 1);
  const before = (await photo.boundingBox())!;
  const head = (await home.locator("[data-home-head]").boundingBox())!;
  const words = (await home.locator("[data-words]").boundingBox())!;
  const { height } = page.viewportSize()!;
  await home.getByRole("button", { name: /^Comments/ }).click();
  const thread = commentsOf(home);
  await expect(thread).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Comments" })).toHaveCount(0);
  // The words' block itself, grown up over the photo to just under the head,
  // which stays, down to the window's foot, in the column; the photo keeps its
  // place under it.
  await expect.poll(async () => Math.round((await thread.boundingBox())!.y)).toBe(Math.round(head.y + head.height));
  const box = (await thread.boundingBox())!;
  expect(Math.round(box.y + box.height)).toBe(height);
  expect(Math.abs(box.x - words.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - words.width)).toBeLessThanOrEqual(1);
  expect(box.y).toBeLessThanOrEqual(before.y + 1);
  await expect(home.locator("[data-home-head]")).toBeVisible();
  const after = (await photo.boundingBox())!;
  for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(2);
  // Nothing in it is shut off: the heading, the comment box at its foot, and
  // its own X; the row of buttons waits under it.
  await expect(home.locator("[data-words]")).not.toHaveAttribute("inert");
  await expect(thread.getByRole("heading", { name: /comments$/i })).toBeVisible();
  await expect(thread.getByLabel("Add a comment")).toBeVisible();
  const hide = thread.getByRole("button", { name: "Hide comments" });
  await expect(hide).toBeVisible();
  expect((await hide.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(home.locator("[data-actions]")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(thread).toBeHidden();
  await expect(home.getByRole("group", { name: "Latest comments" })).toBeVisible();
  await expect(home.locator("[data-actions]")).toBeVisible();
});
