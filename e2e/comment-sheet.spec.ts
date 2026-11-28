// Full screen on a phone, the comments come up as a sheet from the foot, as
// on a reel: the home's head and its photo (smaller) stay in sight above it,
// so it's always clear which home they're about. A tap on the photo, or a
// pull down on the sheet's top, puts them away; a short pull springs back.
import { expect, test } from "@playwright/test";
import { atRest, commentsOf, homeIn, openComments } from "./helpers";

const WEXFORD = "3518 Wexford Ave N";

test("the comments are a sheet under the photo, which stays in sight; a tap on the photo or a pull down puts them away", async ({
  browser,
}) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })).newPage();
  await page.goto("/homes/SAMPLE-1007");
  const home = homeIn(page, WEXFORD);
  const frame = home.locator("[data-photo-frame]").first();
  await expect(frame).toBeVisible();
  const before = (await frame.boundingBox())!;

  // Up: the photo smaller, whole and in sight above the sheet; the head (the
  // price and the address) still at the top.
  const sheet = await openComments(page, home);
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeLessThan(before.height - 20);
  // (Once it has come all the way up.)
  await atRest(sheet);
  const photo = (await frame.boundingBox())!;
  const top = (await sheet.boundingBox())!;
  expect(photo.height).toBeGreaterThanOrEqual(100);
  expect(photo.y).toBeGreaterThanOrEqual(0);
  expect(photo.y + photo.height).toBeLessThanOrEqual(top.y + 1);
  expect(top.height).toBeGreaterThan(780 * 0.45);
  await expect(home.getByRole("button", { name: "About this home" })).toBeInViewport();
  await expect(sheet.getByRole("button", { name: "Hide comments" })).toBeVisible();

  // A tap on the photo: the comments go, and the photo is its full size again.
  await page.mouse.click(photo.x + photo.width / 2, photo.y + photo.height / 2);
  await expect(commentsOf(home)).toBeHidden();
  await expect.poll(async () => Math.round((await frame.boundingBox())!.height)).toBe(Math.round(before.height));

  // A short pull on its top springs back; a long one puts it away.
  const again = await openComments(page, home);
  await atRest(again);
  const grip = again.locator("[data-sheet-grip]");
  const pull = async (by: number) => {
    const at = (await grip.boundingBox())!;
    await page.mouse.move(at.x + 40, at.y + 6);
    await page.mouse.down();
    await page.mouse.move(at.x + 40, at.y + 6 + by, { steps: 8 });
    await page.mouse.up();
  };
  await pull(30);
  await expect(again).toBeVisible();
  await expect.poll(async () => Math.round((await again.boundingBox())!.y)).toBe(Math.round(top.y));
  await pull(220);
  await expect(commentsOf(home)).toBeHidden();
});
