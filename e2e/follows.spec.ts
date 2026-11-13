import { expect, test, type Page } from "@playwright/test";
import { heartOf, homeIn, openMore, signUpBuyer } from "./helpers";

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

  // What she liked is in his Following stream (one person followed, so his
  // home opens on homes picked for him: Following is a tap away), by her
  // name, to her page.
  await bo.goto("/");
  await bo.getByRole("group", { name: "Show" }).getByRole("button", { name: "Following" }).click();
  await expect(bo).toHaveURL(/\?lens=following$/);
  const card = bo.getByRole("link", { name: `${address}: Ana liked this home`, exact: true });
  await expect(card).toBeVisible();
  const item = bo.getByRole("listitem").filter({ has: card });
  await expect(item.getByRole("link", { name: "Ana", exact: true })).toHaveAttribute("href", anaPage);
  // Tapped, the feed's homes open in a pop-out over it, on that one, saying
  // it's her; its X closes it, back to the feed.
  await card.click();
  await bo.waitForURL(/\/reel\?from=feed&home=/);
  const popout = bo.getByRole("dialog", { name: "Homes" });
  const opened = popout.getByRole("article", { name: address });
  await expect(opened).toBeInViewport({ ratio: 0.9 });
  await expect(opened).toContainText(/Ana, who you follow, liked/);
  await popout.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(popout).toHaveCount(0);
  await bo.waitForURL((u) => u.pathname === "/");
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

test("the Following stream: one card per home however many people liked it, only likes and words, never a pass", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const TAMSEN = "1880 Tamsen Ridge Pl SE";
  const LAKEVIEW = "5902 Lakeview Terrace SE";
  // Cy likes a home; then Bo likes it too, and passes on another.
  const cy = await signUpBuyer(browser, "cy.stream@example.com", "Cy Stream");
  const cyPage = await pageOf(cy);
  await cy.goto("/homes/SAMPLE-1002");
  await Promise.all([saved(cy), heartOf(homeIn(cy, TAMSEN)).click()]);
  const bo = await signUpBuyer(browser, "bo.stream@example.com", "Bo Stream");
  const boPage = await pageOf(bo);
  await bo.goto("/homes/SAMPLE-1002");
  await Promise.all([saved(bo), heartOf(homeIn(bo, TAMSEN)).click()]);
  await bo.goto("/homes/SAMPLE-1013");
  const more = await openMore(bo, homeIn(bo, LAKEVIEW));
  await Promise.all([saved(bo), more.getByRole("button", { name: "Not for me" }).click()]);
  await expect(more.getByRole("button", { name: "Not for me" })).toHaveAttribute("aria-pressed", "true");

  // Dee follows them both.
  const dee = await signUpBuyer(browser, "dee.stream@example.com", "Dee Stream");
  for (const [path, name] of [
    [boPage, "Bo"],
    [cyPage, "Cy"],
  ]) {
    await dee.goto(path);
    await Promise.all([saved(dee), dee.getByRole("button", { name: `Follow ${name}` }).click()]);
    await expect(dee.getByRole("button", { name: `Following ${name}` })).toBeVisible();
  }

  // One card for the home they both liked, newest first, each name to their
  // page; nothing at all about the home Bo passed on.
  await dee.goto("/?lens=following");
  const stream = dee.getByRole("region", { name: "What's new" });
  const card = stream.getByRole("link", { name: `${TAMSEN}: Bo and Cy liked this home`, exact: true });
  await expect(card).toBeVisible();
  await expect(stream.getByRole("link", { name: new RegExp(TAMSEN) })).toHaveCount(1);
  const item = stream
    .getByRole("listitem")
    .filter({ has: dee.getByRole("link", { name: `${TAMSEN}: Bo and Cy liked this home`, exact: true }) });
  await expect(item).toContainText("Bo and Cy liked this home");
  await expect(item.getByRole("link", { name: "Bo", exact: true })).toHaveAttribute("href", boPage);
  await expect(item.getByRole("link", { name: "Cy", exact: true })).toHaveAttribute("href", cyPage);
  await expect(stream.getByText(LAKEVIEW)).toHaveCount(0);
  await expect(stream.getByText(/passed/i)).toHaveCount(0);
  // Where what's new ends, it says so.
  await expect(stream.getByRole("note")).toBeVisible();

  // Its heart likes it right there, and the page stays where it is.
  const heart = item.getByRole("button", { name: `Like ${TAMSEN}` });
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await Promise.all([saved(dee), heart.click()]);
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await dee.reload();
  await expect(heart).toHaveAttribute("aria-pressed", "true");

  // The card opens the stream's homes in the pop-out, on that one.
  await card.click();
  await dee.waitForURL(/\/reel\?from=feed&home=SAMPLE-1002/);
  await expect(dee.getByRole("dialog", { name: "Homes" }).getByRole("article", { name: TAMSEN })).toBeInViewport({
    ratio: 0.9,
  });
});
