import { expect, test } from "@playwright/test";
import {
  signedIn,
  commentsOf,
  createShare,
  heartOf,
  homeIn,
  joinAs,
  linkHomes,
  openComments,
  openMore,
  openScorecard,
  signInAgent,
  signUpBuyer,
} from "./helpers";

// No other test after this one counts anything on this home. (Named to run
// after taste-and-picks: all this makes Halvard one of the week's busiest
// homes, and there a home has to be among the busiest few to be trending.)
const HALVARD = "10421 Halvard Way NE";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

test("a reply answers a comment, and a reply to a reply names who it answers; likes are a count, not a row", async ({ browser }) => {
  test.setTimeout(90_000);
  const nadia = await signUpBuyer(browser, "nadia.replies@example.com", "Nadia Brooks");
  const pageErrors: string[] = [];
  nadia.on("pageerror", (error) => pageErrors.push(error.message));
  await nadia.goto("/homes/SAMPLE-1005");
  const nadiaHome = homeIn(nadia, HALVARD);
  await heartOf(nadiaHome).click();
  await expect(heartOf(nadiaHome)).toHaveAttribute("aria-pressed", "true");
  let hers = await openComments(nadia, nadiaHome);
  await hers.getByLabel("Add a comment").fill("That yard is the whole reason.");
  await hers.getByRole("button", { name: "Post", exact: true }).click();
  await expect(hers.getByText("That yard is the whole reason.")).toBeVisible();
  // Her like is counted above the comments, never a row of its own to answer.
  await expect(hers.getByText(/^\d+ likes?$/)).toBeVisible();
  await expect(hers.getByRole("button", { name: /likes$/ })).toHaveCount(0);
  await nadia.keyboard.press("Escape");

  // Someone else answers her, right under what she said.
  const rory = await (await browser.newContext()).newPage();
  rory.on("pageerror", (error) => pageErrors.push(error.message));
  await rory.goto("/homes/SAMPLE-1005");
  let sheet = await openComments(rory, homeIn(rory, HALVARD));
  await sheet.getByRole("button", { name: "Reply to Nadia", exact: true }).click();
  const field = sheet.getByLabel("Reply to Nadia");
  await expect(field).toBeFocused();
  await field.fill("Same, that yard.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await joinAs(rory, "Rory");
  await expect(sheet.getByRole("list", { name: "Replies to Nadia" }).getByText("Same, that yard.")).toBeVisible();

  // Kept: there on coming back, folded under her comment, which has a heart.
  await rory.reload();
  sheet = await openComments(rory, homeIn(rory, HALVARD));
  const herComment = sheet.getByRole("listitem").filter({ hasText: "That yard is the whole reason." });
  await expect(herComment.getByRole("button", { name: /^Like Nadia's comment/ })).toBeVisible();
  await herComment.getByRole("button", { name: "View 1 reply" }).click();
  await expect(sheet.getByRole("list", { name: "Replies to Nadia" }).getByText("Same, that yard.")).toBeVisible();

  // She's told, and answers him back under her own comment: the box starts with his name.
  await expect(async () => {
    await nadia.goto("/activity");
    await expect(nadia.getByRole("listitem").filter({ hasText: `Rory replied to your comment on ${HALVARD}` })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
  await expect(nadia.getByRole("listitem").filter({ hasText: `Rory replied to your comment on ${HALVARD}` })).toContainText(
    "Same, that yard.",
  );
  await nadia.goto("/homes/SAMPLE-1005");
  hers = await openComments(nadia, nadiaHome);
  await hers.getByRole("button", { name: "View 1 reply" }).click();
  const thread = hers.getByRole("list", { name: "Replies to Nadia" });
  await thread.getByRole("button", { name: "Reply to Rory", exact: true }).click();
  const back = hers.getByLabel("Reply to Rory");
  await expect(back).toBeFocused();
  await expect(back).toHaveValue("@Rory ");
  await back.pressSequentially("it's huge");
  await hers.getByRole("button", { name: "Post", exact: true }).click();
  // One level: it goes under her comment, after his.
  await expect(thread.getByRole("listitem")).toHaveCount(2);
  await expect(thread.getByRole("listitem").nth(1)).toContainText("@Rory it's huge");

  // A reply isn't news about the home: the latest comments under the photo
  // never say who replied, and never carry a reply itself.
  await nadia.keyboard.press("Escape");
  const latest = nadiaHome.getByRole("group", { name: "Latest comments" });
  await expect(latest).toBeVisible();
  await expect(latest).toContainText("That yard is the whole reason.");
  await expect(latest).not.toContainText("replied");
  await expect(latest).not.toContainText("Same, that yard.");
  await expect(latest).not.toContainText("@Rory it's huge");
  expect(pageErrors).toEqual([]);
});

test("on a link, a reply to someone's comment stays on the link", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "replies-agent@example.com", "Jordan Rivera");
  const { urls, dashboardUrl } = await createShare(agent, ["10421 Halvard"], ["Owen", "Pat"]);

  const owen = await signedIn(browser);
  await owen.goto(urls.Owen);
  const owenHome = homeIn(owen, HALVARD);
  await heartOf(owenHome).click();
  await expect(heartOf(owenHome)).toHaveAttribute("aria-pressed", "true");
  const owenSheet = await openComments(owen, owenHome);
  await owenSheet.getByLabel("Add a comment").fill("Could we see it Saturday?");
  await owenSheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(owenSheet.getByText("Could we see it Saturday?")).toBeVisible();

  // Pat sees who liked it (by name, on a link), and answers what he said.
  const pat = await (await browser.newContext()).newPage();
  await pat.goto(urls.Pat);
  const sheet = await openComments(pat, homeIn(pat, HALVARD));
  await expect(sheet.getByText(/^Liked by Owen/)).toBeVisible();
  await expect(sheet.getByRole("button", { name: /likes$/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Reply to Owen", exact: true }).click();
  await sheet.getByLabel("Reply to Owen").fill("Saturday works for me too");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  // His first word asks him to sign up, and then it posts.
  await joinAs(pat, "Pat");
  await expect(sheet.getByRole("list", { name: "Replies to Owen" }).getByText("Saturday works for me too")).toBeVisible();

  // The agent sees what it answers.
  await agent.goto(dashboardUrl);
  await expect(agent.getByText(/replying to Owen$/)).toBeVisible();

  // Nothing of it on the public page: not on screen, not in its code, and
  // nobody from the link can be answered there.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/homes/SAMPLE-1005");
  const publicComments = await openComments(anon, homeIn(anon, HALVARD));
  await expect(publicComments.getByText("Could we see it Saturday?")).toHaveCount(0);
  await expect(publicComments.getByText("Saturday works for me too")).toHaveCount(0);
  await expect(publicComments.getByRole("button", { name: /^Reply to Owen/ })).toHaveCount(0);
  await expect(publicComments).not.toContainText(/Owen|Pat/);
  for (const path of ["/homes/SAMPLE-1005", "/"]) {
    const html = await (await anon.request.get(path)).text();
    expect(html).not.toContain("Could we see it Saturday?");
    expect(html).not.toContain("Saturday works for me too");
  }
});

test("the year built, the description and who listed it are words to read; what someone thinks of them goes in a comment", async ({ browser }) => {
  test.setTimeout(90_000);
  const page = await (await browser.newContext(DESKTOP)).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1005");
  const home = homeIn(page, HALVARD);
  await expect(home).toBeInViewport({ ratio: 0.9 });

  // Beside the photo, the description is two lines and "more" reads it all
  // in place, with who listed it and the details. They're plain words:
  // nothing on them to like or dislike, and no card.
  const details = home.getByRole("list", { name: "The details" });
  await expect(details).toHaveCount(0);
  await home.getByRole("button", { name: "more", exact: true }).click();
  await expect(home.getByRole("button", { name: "less", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(details).toContainText("Year built");
  await expect(details).toContainText("2016");
  await expect(details.getByRole("button")).toHaveCount(0);
  await expect(home.getByRole("button", { name: /^Year built/ })).toHaveCount(0);
  await expect(home.locator('[data-fact="Description"]')).toHaveCount(0);
  await expect(home.getByText(/^Listed by Luis Romero/)).toBeVisible();
  await expect(home.getByRole("button", { name: /^Listed by/ })).toHaveCount(0);
  await expect(home.getByRole("button", { name: /^Like the (year built|description|listing agent)/ })).toHaveCount(0);
  await home.getByText(/^Listed by Luis Romero/).click();
  await expect(home.locator("[data-spot-card]")).toHaveCount(0);
  expect(pageErrors).toEqual([]);

  // On a phone: the price, size and address head the photo, and tapping the
  // head opens what the home is over the photo, with all of the description,
  // every detail and who listed it. Nothing of that is in More any more.
  const phone = await (await browser.newContext()).newPage();
  phone.on("pageerror", (error) => pageErrors.push(error.message));
  await phone.goto("/homes/SAMPLE-1005");
  const onPhone = homeIn(phone, HALVARD);
  await expect(onPhone).toBeInViewport({ ratio: 0.9 });
  await expect(onPhone.getByRole("button", { name: "more", exact: true })).toHaveCount(0);
  const head = onPhone.getByRole("button", { name: "About this home" });
  await head.click();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  const about = onPhone.getByRole("region", { name: "About this home" });
  await expect(about).toBeVisible();
  await expect(about.getByText(/^Listed by Luis Romero/)).toBeVisible();
  await expect(about.getByText("Year built", { exact: true })).toBeVisible();
  await expect(about).toContainText("2016");
  await expect(about.getByRole("button")).toHaveCount(0);
  await expect(onPhone.locator("[data-spot-card]")).toHaveCount(0);
  await phone.keyboard.press("Escape");
  await expect(about).toBeHidden();
  const more = await openMore(phone, onPhone);
  await expect(more.getByText("Year built", { exact: true })).toHaveCount(0);
  await expect(more.getByText(/^Listed by/)).toHaveCount(0);
  await phone.keyboard.press("Escape");
  await expect(more).toBeHidden();
  // (No Porchcard there for a visitor.)
  await expect(phone.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);

  // An agent, going through a link's homes on a phone, has the Porchcard, and
  // a fact there opens what's been said about it.
  const fay = await signInAgent(browser, "fay-facts@example.com", "Fay Facts");
  fay.on("pageerror", (error) => pageErrors.push(error.message));
  const { dashboardUrl } = await createShare(fay, ["Halvard"]);
  const theirs = await linkHomes(fay, dashboardUrl, "SAMPLE-1005", HALVARD);
  const scorecard = await openScorecard(fay, theirs);
  await scorecard.getByRole("button", { name: /^On the market since, / }).click();
  const phoneSheet = commentsOf(theirs);
  await expect(phoneSheet.getByRole("heading", { name: "On the time on the market" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
