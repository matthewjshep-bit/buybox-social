// Runs after the other specs (alphabetically last) because it likes a lot of
// homes, which would throw off their counts.
import { expect, test, type Locator } from "@playwright/test";
import {
  heartOf,
  homeIn,
  joinAs,
  likeInPhoto,
  openComments,
  openMore,
  scrollToEnd,
  settle,
  signUpBuyer,
  tapPhoto,
} from "./helpers";

// Today's picks lead the home page: their old address still gets there.
test("the old picks address goes home", async ({ page }) => {
  await page.goto("/picks");
  await expect(page).toHaveURL((url) => url.pathname === "/");
});

test("the feed learns your taste from what you like and pass on", async ({ browser }) => {
  test.setTimeout(90_000);
  const pia = await signUpBuyer(browser, "pia@example.com", "Pia Lane");
  const pageErrors: string[] = [];
  pia.on("pageerror", (error) => pageErrors.push(error.message));
  const homes = pia.getByRole("article");

  // Like the first three homes, and say what else you like about the first two.
  for (let i = 0; i < 3; i++) {
    await heartOf(homes.nth(i)).click();
    await expect(heartOf(homes.nth(i))).toHaveAttribute("aria-pressed", "true");
  }
  for (let i = 0; i < 2; i++) {
    const more = await openMore(pia, homes.nth(i));
    const vibe = more.getByRole("group", { name: "What else do you like?" }).getByRole("button", { name: "Vibe" });
    await vibe.click();
    await expect(vibe).toHaveAttribute("aria-pressed", "true");
    await pia.keyboard.press("Escape");
    await expect(more).toBeHidden();
  }

  // Not for me, on the fourth.
  // (Each tap shows at once and saves behind it: wait for each to be saved,
  // not just shown, before the reload below.)
  const saved = () =>
    pia.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));
  let save = saved();
  await homes.nth(3).getByRole("button", { name: "Pass on this home" }).click();
  await save;
  await homes.nth(3).scrollIntoViewIfNeeded();
  const pass = await openMore(pia, homes.nth(3));
  const why = pass.getByRole("group", { name: "What made you pass?" });
  save = saved();
  await why.getByRole("button", { name: "Exterior" }).click();
  await expect(why.getByRole("button", { name: "Exterior" })).toHaveAttribute("aria-pressed", "true");
  await save;
  await pia.keyboard.press("Escape");

  // Your taste so far waits at the end of the feed, told as your own page
  // tells it: the same chips.
  await pia.reload();
  await scrollToEnd(pia);
  const taste = pia.getByRole("region", { name: "Your taste" });
  await expect(taste).not.toContainText("reactions");
  await expect(taste.getByRole("group", { name: "Loves" }).getByRole("link", { name: "Loves Vibe" })).toBeVisible();
  // Only the things they like: no headline, and no sentence about them.
  await expect(taste).not.toContainText(/ · |beds/);
  await expect(taste).not.toContainText("You tend to like");
  const own = await pia.context().newPage();
  await own.goto("/people/me");
  const ownTaste = own.getByRole("region", { name: "Your taste" });
  await expect(ownTaste.getByRole("group", { name: "Loves" }).getByRole("link", { name: "Loves Vibe" })).toBeVisible();
  await expect(ownTaste).not.toContainText(/ · |beds/);
  await own.close();

  // Her home has no homes picked for her any more: one feed, and Search.
  await pia.goto("/");
  await expect(pia.getByRole("group", { name: "Show" })).toHaveCount(0);
  await expect(pia.getByRole("region", { name: "Homes for you" })).toHaveCount(0);
  await expect(pia.getByRole("heading", { name: "Picked for you" })).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

// Spots of their own on the photo, liked, clear of the named things in it
// (the price and the facts are just words now: nothing there to like), and
// clear of its sides, which run a little past an upright phone's screen.
const SPOTS = [
  [0.3, 0.2],
  [0.8, 0.2],
  [0.2, 0.45],
  [0.82, 0.62],
] as const;
async function likeSpots(home: Locator) {
  for (const [x, y] of SPOTS) {
    await tapPhoto(home, "Stone and shingle home with a three-car garage", x, y);
    const card = home.locator("[data-spot-card]");
    await expect(card).toBeVisible();
    await settle(card);
    const like = card.getByRole("button", { name: /^Like / });
    await like.click();
    await expect(like).toHaveAttribute("aria-pressed", "true");
    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toBeHidden();
  }
}

test("replies, comment likes, the activity bell, trending, and who liked what", async ({ browser }) => {
  test.setTimeout(180_000);
  const FOXGLOVE = "24611 SE Foxglove Pl";
  const cleo = await signUpBuyer(browser, "cleo@example.com", "Cleo Ray");
  await cleo.goto("/homes/SAMPLE-1012");
  const cleoHome = homeIn(cleo, FOXGLOVE);
  await heartOf(cleoHome).click();
  await likeInPhoto(cleoHome, "the three-car garage");
  const cleoChat = await openComments(cleo, cleoHome);
  await cleoChat.getByLabel("Add a comment").fill("Love the cul-de-sac.");
  await cleoChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(cleoChat.getByText("Love the cul-de-sac.")).toBeVisible();

  // Who liked what is there for everyone to see.
  const dev = await signUpBuyer(browser, "dev@example.com", "Dev Shah");
  await dev.goto("/homes/SAMPLE-1012");
  const devHome = homeIn(dev, FOXGLOVE);
  let devChat = await openComments(dev, devHome);
  await expect(devChat.getByText("Cleo liked the three-car garage")).toBeVisible();
  await dev.keyboard.press("Escape");
  // (Counted up, it's in the Porchcard, which is an agent's: e2e/public.spec.ts.)
  await expect(dev.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
  devChat = await openComments(dev, devHome);

  // Dev likes Cleo's comment and replies to it.
  await devChat.getByRole("button", { name: "Like Cleo's comment" }).click();
  await expect(devChat.getByRole("button", { name: "Like Cleo's comment, 1 like" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await devChat.getByRole("button", { name: "Reply to Cleo", exact: true }).click();
  await devChat.getByLabel("Reply to Cleo").fill("Same here, so quiet.");
  await devChat.getByRole("button", { name: "Post", exact: true }).first().click();
  const replies = devChat.getByRole("list", { name: "Replies to Cleo" });
  await expect(replies.getByText("Same here, so quiet.")).toBeVisible();
  await dev.keyboard.press("Escape");
  await heartOf(devHome).click();
  await expect(heartOf(devHome)).toHaveAttribute("aria-pressed", "true");

  // Two more people like it, and plenty in its photo.
  // (Trending takes several people, and a place among the busiest homes this
  // week. The other tests make some homes busy too, so this one gets a clear
  // lead of its own: 22 things this week, well clear of theirs.)
  const fay = await signUpBuyer(browser, "fay@example.com", "Fay Lin");
  await fay.goto("/homes/SAMPLE-1012");
  const fayHome = homeIn(fay, FOXGLOVE);
  await heartOf(fayHome).click();
  await expect(heartOf(fayHome)).toHaveAttribute("aria-pressed", "true");
  for (const thing of ["the front door", "the front lawn", "the arched window", "the three-car garage"]) {
    const card = await likeInPhoto(fayHome, thing);
    await card.getByRole("button", { name: "Close" }).click();
  }
  await likeSpots(fayHome);
  const gus = await (await browser.newContext()).newPage();
  await gus.goto("/homes/SAMPLE-1012");
  const gusHome = homeIn(gus, FOXGLOVE);
  await heartOf(gusHome).click();
  await joinAs(gus, "Gus");
  await expect(heartOf(gusHome)).toHaveAttribute("aria-pressed", "true");
  for (const thing of ["the front door", "the front lawn", "the arched window"]) {
    const card = await likeInPhoto(gusHome, thing);
    await card.getByRole("button", { name: "Close" }).click();
  }
  await likeSpots(gusHome);

  // A third person comments on the home Cleo liked.
  const eli = await signUpBuyer(browser, "eli@example.com", "Eli Moss");
  await eli.goto("/homes/SAMPLE-1012");
  const eliHome = homeIn(eli, FOXGLOVE);
  // Real activity this week makes it trending.
  await expect(eliHome.getByText("Trending")).toBeVisible();
  // Liking just something in a photo counts toward the home's likes too.
  await expect(eliHome.getByRole("button", { name: `Like ${FOXGLOVE}, 4 likes` })).toBeVisible();
  await likeInPhoto(eliHome, "the stone and shingle");
  await expect(eliHome.getByRole("button", { name: `Like ${FOXGLOVE}, 5 likes` })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const eliChat = await openComments(eli, eliHome);
  await eliChat.getByLabel("Add a comment").fill("Is the garage heated?");
  // (Saved before Cleo looks: it shows here at once, before it is.)
  const posted = eli.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      Boolean(res.request().headers()["next-action"]) &&
      (res.request().postData() ?? "").includes("Is the garage heated?"),
  );
  await eliChat.getByRole("button", { name: "Post", exact: true }).click();
  await posted;
  await expect(eliChat.getByText("Is the garage heated?")).toBeVisible();

  // Cleo's bell counts all three, and the activity page explains each.
  await cleo.goto("/");
  const bell = cleo.getByRole("link", { name: "Notifications, 3 new" });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(cleo.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(cleo.getByText(`replied to your comment on ${FOXGLOVE}`)).toBeVisible();
  await expect(cleo.getByText(`liked your comment on ${FOXGLOVE}`)).toBeVisible();
  await expect(cleo.getByText(`commented on ${FOXGLOVE}, a home you liked`)).toBeVisible();
  await expect(cleo.getByText("(new)")).toHaveCount(3);

  // Once seen, the bell goes quiet (marking it seen happens just after the page loads).
  await expect(async () => {
    await cleo.goto("/search");
    await expect(cleo.getByRole("link", { name: "Notifications", exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass();

  // Tapping a name opens their profile: what they've liked and said. Only the
  // name: a tap on the words just under it stays on the words.
  await dev.goto("/homes/SAMPLE-1012");
  const devSheet = await openComments(dev, homeIn(dev, FOXGLOVE));
  await settle(devSheet);
  const cleoSaid = devSheet.locator("li[data-comment]").filter({ has: dev.getByRole("link", { name: "Cleo" }) }).first();
  const under = await cleoSaid.getByRole("link", { name: "Cleo" }).evaluate((el) => {
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + 4, box.bottom + 6);
    return hit ? (hit.closest("a")?.textContent ?? hit.tagName) : "nothing";
  });
  expect(under).not.toBe("Cleo");
  expect(under).not.toBe("nothing");
  await devSheet.getByRole("link", { name: "Cleo" }).first().click();
  await dev.waitForURL("**/people/**");
  await expect(dev.getByRole("heading", { level: 1 })).toHaveText("Cleo");
  await expect(dev.getByRole("link", { name: "Loves Three-car garage" })).toBeVisible();
  await expect(dev.getByRole("link", { name: `${FOXGLOVE}: liked the three-car garage` })).toBeVisible();
  const cleoPage = dev.url();
  await dev.goto(`${cleoPage}?show=comments`);
  await expect(dev.getByText("Love the cul-de-sac.")).toBeVisible();
  await dev.goto(`${cleoPage}?show=passed`);
  await expect(dev.getByText("Nothing passed on yet.")).toBeVisible();
  // Your own, from the header: you, then Your profile.
  await dev.getByRole("button", { name: "Account menu" }).click();
  await dev.getByRole("link", { name: "Your profile" }).click();
  await expect(dev.getByRole("heading", { level: 1 })).toHaveText("Dev (you)");
  await expect(dev.getByRole("link", { name: `${FOXGLOVE}: liked this` })).toBeVisible();

  // Signed-out visitors are asked to sign up, right there, on their first like.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/reel");
  await heartOf(anon.getByRole("article").first()).click();
  const join = anon.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(join.getByRole("textbox", { name: "First name" })).toBeVisible();
});
