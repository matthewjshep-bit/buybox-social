// Runs after the other specs (alphabetically last) because it likes a lot of
// homes, which would throw off their counts.
import { expect, test } from "@playwright/test";
import {
  heartOf,
  homeIn,
  joinAs,
  likeInPhoto,
  openComments,
  openMore,
  openScorecard,
  scrollToEnd,
  signUpBuyer,
} from "./helpers";

test("the feed learns your taste from what you like and pass on", async ({ browser }) => {
  test.setTimeout(90_000);
  const pia = await signUpBuyer(browser, "pia@example.com", "Pia Lane");
  const pageErrors: string[] = [];
  pia.on("pageerror", (error) => pageErrors.push(error.message));
  const homes = pia.getByRole("article");

  // Like the first three homes, and say what else you like about the first.
  for (let i = 0; i < 3; i++) {
    await heartOf(homes.nth(i)).click();
    await expect(heartOf(homes.nth(i))).toHaveAttribute("aria-pressed", "true");
  }
  const more = await openMore(pia, homes.nth(0));
  await more.getByRole("group", { name: "What else do you like?" }).getByRole("button", { name: "Vibe" }).click();
  await expect(
    more.getByRole("group", { name: "What else do you like?" }).getByRole("button", { name: "Vibe" }),
  ).toHaveAttribute("aria-pressed", "true");
  await pia.keyboard.press("Escape");

  // Not for me, on the fourth.
  const pass = await openMore(pia, homes.nth(3));
  await pass.getByRole("button", { name: "Not for me" }).click();
  const why = pass.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Exterior" }).click();
  await expect(why.getByRole("button", { name: "Exterior" })).toHaveAttribute("aria-pressed", "true");
  await pia.keyboard.press("Escape");

  // Your taste so far waits at the end of the feed, and homes that match it say why.
  await pia.reload();
  await scrollToEnd(pia);
  const taste = pia.getByRole("region", { name: "Your taste" });
  await expect(taste).toContainText("From 4 reactions: liked 3, passed 1.");
  await expect(taste.getByText("Vibe 1")).toBeVisible();
  await expect(taste.getByText("Exterior 1")).toBeVisible();
  // Homes that match it say why, in the Scorecard, under your take.
  let fits = false;
  for (let i = 0; i < (await homes.count()) && !fits; i++) {
    const card = await openScorecard(pia, homes.nth(i));
    fits = (await card.getByText(/^For you:/).count()) > 0;
    if (fits) await expect(card.getByText(/^For you:/)).toBeVisible();
    await pia.keyboard.press("Escape");
    await expect(card).toBeHidden();
  }
  expect(fits).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("replies, comment likes, the activity bell, trending, and who liked what", async ({ browser }) => {
  test.setTimeout(120_000);
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
  const devCard = await openScorecard(dev, devHome);
  await expect(devCard.getByText("People like", { exact: true })).toBeVisible();
  await expect(devCard.getByText("Exterior 1")).toBeVisible();
  await dev.keyboard.press("Escape");
  await expect(devCard).toBeHidden();
  devChat = await openComments(dev, devHome);

  // Dev likes Cleo's comment and replies to it.
  await devChat.getByRole("button", { name: "Like Cleo's comment" }).click();
  await expect(devChat.getByRole("button", { name: "Like Cleo's comment, 1 like" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await devChat.getByRole("button", { name: "Reply to Cleo" }).click();
  await devChat.getByLabel("Reply to Cleo").fill("Same here, so quiet.");
  await devChat.getByRole("button", { name: "Post", exact: true }).first().click();
  const replies = devChat.getByRole("list", { name: "Replies to Cleo" });
  await expect(replies.getByText("Same here, so quiet.")).toBeVisible();
  await dev.keyboard.press("Escape");
  await heartOf(devHome).click();
  await expect(heartOf(devHome)).toHaveAttribute("aria-pressed", "true");

  // Two more people like it, and plenty in its photo. (Trending takes
  // several people, and a place among the busiest homes this week. The other
  // tests make some homes busy too, so this one gets a clear lead of its own:
  // 14 things this week, where the busiest of theirs has 12.)
  const fay = await signUpBuyer(browser, "fay@example.com", "Fay Lin");
  await fay.goto("/homes/SAMPLE-1012");
  const fayHome = homeIn(fay, FOXGLOVE);
  await heartOf(fayHome).click();
  await expect(heartOf(fayHome)).toHaveAttribute("aria-pressed", "true");
  for (const thing of ["the front door", "the front lawn", "the arched window", "the three-car garage"]) {
    const card = await likeInPhoto(fayHome, thing);
    await card.getByRole("button", { name: "Close" }).click();
  }
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
  await eliChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(eliChat.getByText("Is the garage heated?")).toBeVisible();

  // Cleo's bell counts all three, and the activity page explains each.
  await cleo.goto("/");
  const bell = cleo.getByRole("link", { name: "Activity, 3 new" });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(cleo.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(cleo.getByText(`replied to your comment on ${FOXGLOVE}`)).toBeVisible();
  await expect(cleo.getByText(`liked your comment on ${FOXGLOVE}`)).toBeVisible();
  await expect(cleo.getByText(`commented on ${FOXGLOVE}, a home you liked`)).toBeVisible();
  await expect(cleo.getByText("(new)")).toHaveCount(3);

  // Once seen, the bell goes quiet (marking it seen happens just after the page loads).
  await expect(async () => {
    await cleo.goto("/search");
    await expect(cleo.getByRole("link", { name: "Activity", exact: true })).toBeVisible({ timeout: 1000 });
  }).toPass();

  // Tapping a name opens their profile: what they've liked and said.
  await dev.goto("/homes/SAMPLE-1012");
  const devSheet = await openComments(dev, homeIn(dev, FOXGLOVE));
  await devSheet.getByRole("link", { name: "Cleo" }).first().click();
  await dev.waitForURL("**/people/**");
  await expect(dev.getByRole("heading", { level: 1 })).toHaveText("Cleo");
  await expect(dev.getByText("Three-car garage 1")).toBeVisible();
  await expect(dev.getByRole("link", { name: `${FOXGLOVE}: liked the three-car garage` })).toBeVisible();
  await dev.getByRole("link", { name: "Comments" }).click();
  await expect(dev.getByText("Love the cul-de-sac.")).toBeVisible();
  await dev.getByRole("link", { name: "Passed" }).click();
  await expect(dev.getByText("Nothing passed on yet.")).toBeVisible();
  // Your own, from the header.
  await dev.getByRole("link", { name: "Your profile" }).click();
  await expect(dev.getByRole("heading", { level: 1 })).toHaveText("Dev (you)");
  await expect(dev.getByRole("link", { name: `${FOXGLOVE}: liked this` })).toBeVisible();

  // Signed-out visitors get a name prompt on their first like.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  await heartOf(anon.getByRole("article").first()).click();
  await expect(anon.getByRole("textbox", { name: "First name" })).toBeVisible();
});
