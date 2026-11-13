import { expect, test, type Page } from "@playwright/test";
import { heartOf, signUpBuyer } from "./helpers";

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

// Someone's own page, from wherever they are.
async function pageOf(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  return new URL(page.url()).pathname;
}

test("following: from someone's page, what they like comes first in your feed, and both lists say who", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Ana likes a home.
  const ana = await signUpBuyer(browser, "ana.follows@example.com", "Ana Follows");
  const home = ana.getByRole("article").first();
  const address = (await home.getAttribute("aria-label"))!;
  await Promise.all([saved(ana), heartOf(home).click()]);
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  const anaPage = await pageOf(ana);
  await expect(ana.getByRole("link", { name: "0 followers" })).toBeVisible();
  // Nobody follows themselves.
  await expect(ana.getByRole("button", { name: /^Follow/ })).toHaveCount(0);

  // Bo follows her, from her page.
  const bo = await signUpBuyer(browser, "bo.follows@example.com", "Bo Follows");
  const boPage = await pageOf(bo);
  await bo.goto(anaPage);
  const follow = bo.getByRole("button", { name: "Follow Ana" });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await Promise.all([saved(bo), follow.click()]);
  await expect(bo.getByRole("button", { name: "Following Ana" })).toHaveAttribute("aria-pressed", "true");
  await bo.reload();
  await expect(bo.getByRole("button", { name: "Following Ana" })).toHaveAttribute("aria-pressed", "true");
  await expect(bo.getByRole("link", { name: "1 follower" })).toBeVisible();

  // What she liked is in his feed, by her name, to her page.
  await bo.goto("/");
  const card = bo.getByRole("link", { name: `${address}: liked this`, exact: true });
  await expect(card).toBeVisible();
  const item = bo.getByRole("listitem").filter({ has: card });
  await expect(item.getByRole("link", { name: "Ana", exact: true })).toHaveAttribute("href", anaPage);
  // Tapped, the feed's homes open full screen on it, and it says it's her.
  await card.click();
  await bo.waitForURL(/\/reel\?from=feed&home=/);
  const opened = bo.getByRole("article", { name: address });
  await expect(opened).toBeInViewport({ ratio: 0.9 });
  await expect(opened).toContainText(/Ana, who you follow, liked/);
  await expect(bo.getByRole("link", { name: "Back to your feed" }).first()).toBeVisible();
  // And on Browse homes, what she liked comes first.
  await bo.goto("/reel");
  await expect(bo.getByRole("article").first()).toHaveAttribute("aria-label", address);

  // Ana sees he follows her, and follows him back.
  await ana.goto(boPage);
  await expect(ana.getByText("Follows you")).toBeVisible();
  await Promise.all([saved(ana), ana.getByRole("button", { name: "Follow Bo" }).click()]);
  await expect(ana.getByRole("button", { name: "Following Bo" })).toBeVisible();

  // Her followers: Bo, to his page, and she follows him.
  await ana.goto(`${anaPage}/followers`);
  await expect(ana.getByRole("heading", { level: 1 })).toHaveText("Your followers");
  const followers = ana.getByRole("list", { name: "Your followers" });
  await expect(followers.getByRole("link", { name: "Bo" })).toHaveAttribute("href", boPage);
  await expect(followers.getByRole("button", { name: "Following Bo" })).toHaveAttribute("aria-pressed", "true");

  // Bo's: whom he follows, and he can stop right there.
  await bo.goto(`${boPage}/following`);
  await expect(bo.getByRole("heading", { level: 1 })).toHaveText("People you follow");
  const following = bo.getByRole("list", { name: "People you follow" });
  await Promise.all([saved(bo), following.getByRole("button", { name: "Following Ana" }).click()]);
  await expect(following.getByRole("button", { name: "Follow Ana" })).toHaveAttribute("aria-pressed", "false");
  await bo.reload();
  await expect(bo.getByText("You're not following anyone yet")).toBeVisible();
  await expect(bo.getByRole("navigation", { name: "Followers and following" })).toContainText("0 Following");

  // Signed out, Follow is the way to sign in, back to her page.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(anaPage);
  await expect(guest.getByRole("link", { name: "Follow Ana" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(anaPage)}`,
  );
});
