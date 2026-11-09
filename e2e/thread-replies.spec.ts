import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, openScorecard, settle, signInAgent, signUpBuyer } from "./helpers";

// No other test after this one counts anything on this home. (Named to run
// after taste-and-picks: all this makes Halvard one of the week's busiest
// homes, and there a home has to be among the busiest few to be trending.)
const HALVARD = "10421 Halvard Way NE";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

test("a reply can answer someone's likes, and a reply to a reply names who it answers", async ({ browser }) => {
  test.setTimeout(90_000);
  const nadia = await signUpBuyer(browser, "nadia.replies@example.com", "Nadia Brooks");
  const pageErrors: string[] = [];
  nadia.on("pageerror", (error) => pageErrors.push(error.message));
  await nadia.goto("/homes/SAMPLE-1005");
  const nadiaHome = homeIn(nadia, HALVARD);
  await heartOf(nadiaHome).click();
  await expect(heartOf(nadiaHome)).toHaveAttribute("aria-pressed", "true");

  // Someone else answers her like, right where it is in the comments.
  const rory = await (await browser.newContext()).newPage();
  rory.on("pageerror", (error) => pageErrors.push(error.message));
  await rory.goto("/homes/SAMPLE-1005");
  let sheet = await openComments(rory, homeIn(rory, HALVARD));
  await sheet.getByRole("button", { name: "Reply to Nadia's likes", exact: true }).click();
  const field = sheet.getByLabel("Reply to Nadia");
  await expect(field).toBeFocused();
  await field.fill("That yard is the whole reason.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await joinAs(rory, "Rory");
  await expect(sheet.getByRole("list", { name: "Replies to Nadia's likes" }).getByText("That yard is the whole reason.")).toBeVisible();

  // Kept: there on coming back, folded under her like.
  await rory.reload();
  sheet = await openComments(rory, homeIn(rory, HALVARD));
  const herLikes = sheet.getByRole("listitem").filter({ has: rory.getByRole("button", { name: "Reply to Nadia's likes", exact: true }) });
  await herLikes.getByRole("button", { name: "View 1 reply" }).click();
  await expect(sheet.getByRole("list", { name: "Replies to Nadia's likes" }).getByText("That yard is the whole reason.")).toBeVisible();

  // She's told, and answers him back under her own like: the box starts with his name.
  await expect(async () => {
    await nadia.goto("/activity");
    await expect(nadia.getByRole("listitem").filter({ hasText: `Rory replied to your likes on ${HALVARD}` })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(nadia.getByRole("listitem").filter({ hasText: `Rory replied to your likes on ${HALVARD}` })).toContainText(
    "That yard is the whole reason.",
  );
  await nadia.goto("/homes/SAMPLE-1005");
  sheet = await openComments(nadia, homeIn(nadia, HALVARD));
  await sheet.getByRole("button", { name: "View 1 reply" }).click();
  const thread = sheet.getByRole("list", { name: "Replies to your likes" });
  await thread.getByRole("button", { name: "Reply to Rory", exact: true }).click();
  const back = sheet.getByLabel("Reply to Rory");
  await expect(back).toBeFocused();
  await expect(back).toHaveValue("@Rory ");
  await back.pressSequentially("it's huge");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  // One level: it goes under her like, after his.
  await expect(thread.getByRole("listitem")).toHaveCount(2);
  await expect(thread.getByRole("listitem").nth(1)).toContainText("@Rory it's huge");

  // A reply isn't news about the home: never on the line over the photo.
  await nadia.keyboard.press("Escape");
  await expect(nadia.locator("[data-photo-caption]")).not.toContainText("replied");
  expect(pageErrors).toEqual([]);
});

test("on a link, a reply to someone's likes or their comment stays on the link", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "replies-agent@example.com", "Jordan Rivera");
  const { urls, dashboardUrl } = await createShare(agent, ["10421 Halvard"], ["Owen", "Pat"]);

  const owen = await (await browser.newContext()).newPage();
  await owen.goto(urls.Owen);
  const owenHome = homeIn(owen, HALVARD);
  await heartOf(owenHome).click();
  await expect(heartOf(owenHome)).toHaveAttribute("aria-pressed", "true");
  const owenSheet = await openComments(owen, owenHome);
  await owenSheet.getByLabel("Add a comment").fill("Could we see it Saturday?");
  await owenSheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(owenSheet.getByText("Could we see it Saturday?")).toBeVisible();

  // Pat answers both: his likes, and what he said.
  const pat = await (await browser.newContext()).newPage();
  await pat.goto(urls.Pat);
  const sheet = await openComments(pat, homeIn(pat, HALVARD));
  await sheet.getByRole("button", { name: "Reply to Owen's likes", exact: true }).click();
  await sheet.getByLabel("Reply to Owen").fill("Me too, that porch!");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet.getByRole("list", { name: "Replies to Owen's likes" }).getByText("Me too, that porch!")).toBeVisible();
  await sheet.getByRole("button", { name: "Reply to Owen", exact: true }).click();
  await sheet.getByLabel("Reply to Owen").fill("Saturday works for me too");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet.getByRole("list", { name: "Replies to Owen" }).getByText("Saturday works for me too")).toBeVisible();

  // The agent sees what each one answers.
  await agent.goto(dashboardUrl);
  await expect(agent.getByText(/replying to Owen's likes/)).toBeVisible();
  await expect(agent.getByText(/replying to Owen$/)).toBeVisible();

  // Nothing of it on the public page: not on screen, not in its code, and
  // the link's likes (there only as "a buyer") can't be answered there.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/homes/SAMPLE-1005");
  const publicComments = await openComments(anon, homeIn(anon, HALVARD));
  await expect(publicComments.getByText("Me too, that porch!")).toHaveCount(0);
  await expect(publicComments.getByText("Saturday works for me too")).toHaveCount(0);
  await expect(publicComments.getByRole("button", { name: /^Reply to Owen/ })).toHaveCount(0);
  for (const path of ["/homes/SAMPLE-1005", "/"]) {
    const html = await (await anon.request.get(path)).text();
    expect(html).not.toContain("Me too, that porch!");
    expect(html).not.toContain("Saturday works for me too");
  }
});

test("the year built, the description and who listed it are each something to like or talk about", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await (await browser.newContext(DESKTOP)).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1005");
  const home = homeIn(page, HALVARD);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // Beside the photo, each detail is a tap away from its card.
  await home.getByRole("button", { name: /^Year built, 2016/ }).click();
  const year = home.getByRole("group", { name: "Year built" });
  await expect(year).toBeVisible();
  await settle(year);
  await year.getByRole("button", { name: "Like the year built", exact: true }).click();
  await joinAs(page, "Lee");
  await expect(year.getByRole("button", { name: "Like the year built, 1 like", exact: true })).toHaveAttribute("aria-pressed", "true");
  await year.getByLabel("Comment on the year built").fill("Barely ten years old, nice");
  await year.getByLabel("Comment on the year built").press("Enter");
  await expect(home.getByRole("button", { name: /^Year built, 2016, 1 like, 1 comment$/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // The description as a whole, and the agent who listed it.
  await home.locator('[data-fact="Description"]').click();
  const description = home.getByRole("group", { name: "Description" });
  await expect(description).toBeVisible();
  await settle(description);
  await description.getByRole("button", { name: "Like the description", exact: true }).click();
  await expect(description.getByRole("button", { name: "Like the description, 1 like", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await description.getByRole("button", { name: "Close" }).click();
  await home.getByRole("button", { name: /^Listed by Luis Romero/ }).click();
  const agent = home.getByRole("group", { name: "Listing agent" });
  await expect(agent).toBeVisible();
  await settle(agent);
  await agent.getByRole("button", { name: "Dislike the listing agent", exact: true }).click();
  await expect(agent.getByRole("button", { name: "Dislike the listing agent, 1 dislike", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await agent.getByRole("button", { name: "Close" }).click();

  // In the comments, what was said comes with what it's about.
  await home.getByRole("button", { name: /comments?\. Read them$/ }).click();
  const sheet = page.getByRole("dialog", { name: "Comments" });
  const said = sheet.getByRole("listitem").filter({ hasText: "Barely ten years old, nice" });
  await expect(said).toBeVisible();
  await expect(said.getByRole("button", { name: /^About the year built/ })).toBeVisible();
  expect(pageErrors).toEqual([]);

  // On a phone: the description over the photo takes a tap, and the
  // Scorecard's facts open their cards too.
  const phone = await (await browser.newContext()).newPage();
  phone.on("pageerror", (error) => pageErrors.push(error.message));
  await phone.goto("/homes/SAMPLE-1005");
  const onPhone = homeIn(phone, HALVARD);
  await onPhone.locator('[data-fact="Description"]').click();
  const card = onPhone.getByRole("group", { name: "Description" });
  await expect(card).toBeVisible();
  await settle(card);
  // (The line at the photo's foot steps aside for it.)
  await expect(onPhone.locator("[data-photo-caption]")).toBeHidden();
  await card.getByRole("button", { name: "Close" }).click();
  const scorecard = await openScorecard(phone, onPhone);
  await scorecard.getByRole("button", { name: /^On the market since, / }).click();
  const market = onPhone.getByRole("group", { name: "Days on market" });
  await expect(market).toBeVisible();
  await settle(market);
  await market.getByRole("button", { name: /^Comment on the time on the market/ }).click();
  const phoneSheet = phone.getByRole("dialog", { name: "Comments" });
  await expect(phoneSheet.getByRole("heading", { name: "On the time on the market" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
