import { expect, test, type Page } from "@playwright/test";
import {
  signedIn,
  commentIn,
  commentsOf,
  createShare,
  heartOf,
  homeIn,
  joinAs,
  likeInPhoto,
  linkHomes,
  openComments,
  openScorecard,
  pickHome,
  signInAgent,
  signUpBuyer,
  passOn,
  openMore,
  toLinkReady,
  toWho,
} from "./helpers";

const SECRET = "We could go 50k over asking.";
const SHARED = "That fenced yard is perfect for our dog.";
const BRACKENFIELD = "2205 Brackenfield Ct NW";

test("public pages show the latest comments, never private words; a link shares by name only what its client leaves public", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  // Another agent, with a link of her own that has the same home on it (sent
  // first, so it's the oldest news about the home). Going through its homes
  // she has the home's Porchcard (nobody else has one): what everyone thinks
  // of it, which may say only what the public page may.
  const rival = await signInAgent(browser, "rhea-rival@example.com", "Rhea Rival");
  const hers = await createShare(rival, ["2205 Brackenfield"], ["Sam"]);
  const porchcard = async () => openScorecard(rival, await linkHomes(rival, hers.dashboardUrl, "SAMPLE-1006", BRACKENFIELD));

  // A client on a link: a comment kept to the link, a like with a photo like
  // (public, by name, as everything on a link is by default), and a comment
  // she says in public.
  const agent = await signInAgent(browser, "pat@example.com", "Pat Agent");
  const { urls } = await createShare(agent, ["2205 Brackenfield"], ["Riley", "Quinn"]);
  const client = await signedIn(browser);
  await client.goto(urls.Riley);
  const clientHome = homeIn(client, BRACKENFIELD);
  let chat = await openComments(client, clientHome);
  await chat.getByRole("button", { name: "Keep it to this link" }).click();
  await expect(chat.getByText("Only Pat Agent and people on this link see this.")).toBeVisible();
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(SECRET)).toBeVisible();
  await client.keyboard.press("Escape");

  await heartOf(clientHome).click();
  await expect(heartOf(clientHome)).toHaveAttribute("aria-pressed", "true");
  await likeInPhoto(clientHome, "the brick front");
  chat = await openComments(client, clientHome);
  // (The box's own choice, not the row's "Make public" on what she kept.)
  const makePublic = chat.locator("form").getByRole("button", { name: "Make public" });
  if (await makePublic.isVisible()) await makePublic.click();
  await expect(chat.getByText("Public, with your first name.")).toBeVisible();
  await chat.getByLabel("Add a comment").fill(SHARED);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.locator("li[data-comment]").filter({ hasText: SHARED }).getByRole("button", { name: "Make private" })).toBeVisible();
  await client.keyboard.press("Escape");

  // A second person on the package passes on the yard, from their own link. That stays private.
  const quinn = await signedIn(browser);
  await quinn.goto(urls.Quinn);
  const quinnMore = await passOn(quinn, homeIn(quinn, BRACKENFIELD));
  const quinnWhy = quinnMore.getByRole("group", { name: "What made you pass?" });
  await quinnWhy.getByRole("button", { name: "Yard" }).click();
  await expect(quinnWhy.getByRole("button", { name: "Yard" })).toHaveAttribute("aria-pressed", "true");

  // The home's public page reads like a post: under the photo, how many like
  // it and the latest comments. The client's public comment is there, by
  // her first name. The one she kept to the link isn't there at all: not its
  // words, not even a row for it.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1006");
  const post = homeIn(page, BRACKENFIELD);
  const latest = post.getByRole("group", { name: "Latest comments" });
  await expect(latest).toContainText(/1 like|Liked by/);
  // (Other tests may have said things here too: hers is there, by name, and
  // the one she kept to the link has no row at all.)
  await expect(latest.getByRole("listitem").filter({ hasText: SHARED })).toContainText("Riley");
  await expect(latest).not.toContainText(SECRET);
  await expect(latest).not.toContainText(/privately/);
  await expect(post).not.toContainText(SECRET);
  // The description is in the home's words, shown when the head is tapped:
  // all of it, and who listed it.
  await expect(post).toContainText(/Traditional brick-front home/);
  const head = post.getByRole("button", { name: "About this home" });
  const about = post.getByRole("region", { name: "About this home" });
  await expect(about).toBeHidden();
  await head.click();
  await expect(about).toBeVisible();
  await expect(about).toContainText(/Traditional brick-front home/);
  await expect(about).toContainText("Listed by Priya Natarajan");
  await expect(about).not.toContainText(SECRET);
  await page.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await expect(post.getByRole("button", { name: `Like ${BRACKENFIELD}, 1 like` })).toBeVisible();
  let sheet = await openComments(page, post);
  // The private pass shows nowhere: not in the comments...
  await expect(sheet.getByText("People pass on")).toHaveCount(0);
  await expect(sheet).not.toContainText(/pass/i);
  // (Who liked it is a count, never a row: the one like so far is the private one.)
  await expect(sheet.getByText(/^1 like$|^Liked by Riley/)).toBeVisible();
  const thread = sheet.getByRole("list", { name: "Comments" });
  await expect(commentIn(thread, "Riley", SHARED)).toBeVisible();
  await expect(thread).not.toContainText("Shared from a private chat");
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.getByText(/Quinn/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  // (No Porchcard for a visitor: Save is where it was.)
  await expect(page.getByRole("button", { name: "Feedback", exact: true })).toHaveCount(0);
  await expect(post.getByRole("button", { name: `Save ${BRACKENFIELD}`, exact: true })).toBeVisible();
  // ...nor in the Porchcard the other agent has, which has what people like
  // and the quiet signals.
  let card = await porchcard();
  await expect(card.getByText("Liked", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Exterior 1 person/ })).toBeVisible();
  await expect(card.getByText("Didn't like", { exact: true })).toHaveCount(0);
  await expect(card.getByLabel(/passed$/)).toHaveCount(0);
  await expect(card).not.toContainText(/pass/i);
  const buzz = card.getByLabel("Activity");
  await expect(buzz).toContainText("agents sent it to 2 buyers");
  // (The one shared here shows among the comments, so isn't counted again.)
  await expect(buzz).toContainText("1 comment in private chats");
  await expect(buzz).not.toContainText("pass");
  await expect(card.getByText(SECRET)).toHaveCount(0);
  await expect(card.getByText(/Quinn/)).toHaveCount(0);
  // Nor in the comments beside it, nor anywhere in her page as it's sent.
  await card.getByRole("button", { name: /^See the \d+ comments?$/ }).click();
  const rivalSheet = commentsOf(homeIn(rival, BRACKENFIELD));
  await expect(rivalSheet).toContainText(SHARED);
  await expect(rivalSheet).not.toContainText(/pass/i);
  await expect(rival.getByText(SECRET)).toHaveCount(0);
  await expect(rival.getByText(/Quinn/)).toHaveCount(0);
  const rivalHtml = await (await rival.request.get(rival.url())).text();
  expect(rivalHtml).not.toContain(SECRET);
  expect(rivalHtml).not.toMatch(/Quinn/);

  // Any visitor can react and comment in public.
  await heartOf(post).click();
  await joinAs(page, "Morgan");
  await expect(heartOf(post)).toHaveAttribute("aria-pressed", "true");
  await post.getByRole("button", { name: "Next photo" }).click();
  await likeInPhoto(post, "the natural light");
  sheet = await openComments(page, post);
  await expect(sheet.getByLabel(/share publicly/)).toHaveCount(0);
  await sheet.getByLabel("Add a comment").fill("Love the quiet cul-de-sac.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(commentIn(thread, "Morgan", "Love the quiet cul-de-sac.")).toBeVisible();
  // (Morgan's like counts with the buyer's: two.)
  await expect(sheet.getByText(/^2 likes$/)).toBeVisible();
  await page.keyboard.press("Escape");
  // Under the photo now too, by name, newest first, and a row is a fingertip to tap.
  await expect(latest).toContainText("2 likes");
  const morganRow = latest.getByRole("button", { name: /^Morgan .*Love the quiet cul-de-sac\./ });
  await expect(morganRow).toBeVisible();
  expect((await morganRow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // (Morgan's, just said, leads; the shared one is still there; other tests'
  // words may be among them.)
  await expect(latest.getByRole("listitem").first()).toContainText("Morgan");
  await expect(latest.getByRole("listitem").filter({ hasText: SHARED })).toHaveCount(1);
  await expect(latest.getByText(/Quinn/)).toHaveCount(0);
  card = await porchcard();
  await expect(card.getByText("Natural light 1")).toBeVisible();
  await expect(post.getByRole("button", { name: `Like ${BRACKENFIELD}, 2 likes` })).toBeVisible();

  // Other visitors see it, by name.
  const other = await (await browser.newContext()).newPage();
  await other.goto("/homes/SAMPLE-1006");
  const otherPost = homeIn(other, BRACKENFIELD);
  let otherSheet = await openComments(other, otherPost);
  await expect(otherSheet.getByText("Love the quiet cul-de-sac.")).toBeVisible();
  await expect(otherSheet.getByText(/^2 likes$/)).toBeVisible();
  await expect(otherSheet.getByText(SHARED)).toBeVisible();
  await other.keyboard.press("Escape");

  // Passes made in public do show, with their specifics.
  // (Asked who they are first, once; then the X has passed, and gone on to the next home.)
  await otherPost.getByRole("button", { name: "Pass on this home" }).click();
  await joinAs(other, "Drew");
  await expect(otherPost.getByRole("button", { name: "Pass on this home" })).toHaveAttribute("aria-pressed", "true");
  await otherPost.scrollIntoViewIfNeeded();
  const otherMore = await openMore(other, otherPost);
  // (Saved before the page is loaded again.)
  const priceSaved = other.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      Boolean(res.request().headers()["next-action"]) &&
      /price/i.test(res.request().postData() ?? ""),
  );
  await otherMore.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }).click();
  await expect(
    otherMore.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }),
  ).toHaveAttribute("aria-pressed", "true");
  await priceSaved;
  // (The comments say nothing of passes, public or not: what people think of
  // the home is the Porchcard's.)
  await other.reload();
  otherSheet = await openComments(other, otherPost);
  await expect(otherSheet).not.toContainText(/pass/i);
  await other.keyboard.press("Escape");
  // In the Porchcard: the public pass and why, and still nobody from the link.
  card = await porchcard();
  await expect(card.getByText("Didn't like", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Price 1 person/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Yard/ })).toHaveCount(0);
  await expect(card.getByText(/Quinn/)).toHaveCount(0);

  // Private words, and the one who only passed, are not in the public HTML at all.
  for (const path of ["/", "/homes/SAMPLE-1006"]) {
    const html = await (await other.request.get(path)).text();
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("Quinn");
  }

  // The client can make her public comment private: it leaves the public
  // page whole, the comments under the photo included.
  chat = await openComments(client, clientHome);
  const sharedRow = chat.locator("li[data-comment]").filter({ hasText: SHARED });
  await sharedRow.getByRole("button", { name: "Make private" }).click();
  await expect(sharedRow.getByRole("button", { name: "Make public" })).toBeVisible();
  await other.reload();
  const otherLatest = otherPost.getByRole("group", { name: "Latest comments" });
  await expect(otherLatest).toContainText("Morgan");
  await expect(otherLatest).not.toContainText(SHARED);
  otherSheet = await openComments(other, otherPost);
  await expect(otherSheet.getByText("Love the quiet cul-de-sac.")).toBeVisible();
  await expect(other.getByText(SHARED)).toHaveCount(0);

  // Public comments don't leak into the private thread.
  await client.reload();
  await expect(client.getByText("Love the quiet cul-de-sac.")).toHaveCount(0);
  await expect(client.getByText("Morgan")).toHaveCount(0);

  expect((await other.request.get("/homes/NOT-A-LISTING")).status()).toBe(404);
  expect(pageErrors).toEqual([]);
});

test("a home sent on a link never says so on its page: not to anyone else, and, with the rotating line gone, not to whoever sent it either", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const HALVARD = "10421 Halvard Way NE";
  const HERON = "88 Heron Bluff Rd";
  // Under a home's photo: how many like it and the latest comments. A home
  // going out on a link is neither, so it never shows up there.
  const latestOf = (page: Page, address: string) => homeIn(page, address).getByRole("group", { name: "Latest comments" });

  // An agent sends a home to a client.
  const agent = await signInAgent(browser, "sena-sent@example.com", "Sena Sent");
  await createShare(agent, ["10421 Halvard"], ["Pat"]);
  // And someone who isn't an agent sends another to a friend.
  const mo = await signUpBuyer(browser, "mo.sent@example.com", "Mo Sent");
  // (In the box: the home, Someone, a first name, Send; the conversation opens.)
  await mo.goto("/send");
  await pickHome(mo, HERON);
  await toWho(mo);
  const who = mo.getByRole("combobox", { name: "Who's it for?" });
  await who.fill("Sam");
  await who.press("Enter");
  await toLinkReady(mo);

  // The home's page says nothing of it, even to the one who sent it: the
  // line that used to say "You sent this" went with the rotating activity.
  await agent.goto("/homes/SAMPLE-1005");
  await expect(latestOf(agent, HALVARD)).toBeVisible();
  await expect(latestOf(agent, HALVARD)).not.toContainText(/sent/i);
  await expect(agent.getByText(/sent this/)).toHaveCount(0);
  await mo.goto("/homes/SAMPLE-1010");
  await expect(latestOf(mo, HERON)).toBeVisible();
  await expect(latestOf(mo, HERON)).not.toContainText(/sent/i);
  await expect(mo.getByText(/sent this/)).toHaveCount(0);

  // And never to anyone else: not each other, not a visitor. That a home
  // went out on someone's link is theirs alone to know.
  await agent.goto("/homes/SAMPLE-1010");
  await expect(homeIn(agent, HERON)).toBeVisible();
  await expect(agent.getByText(/sent this/)).toHaveCount(0);
  await mo.goto("/homes/SAMPLE-1005");
  await expect(homeIn(mo, HALVARD)).toBeVisible();
  await expect(mo.getByText(/sent this/)).toHaveCount(0);
  const guest = await (await browser.newContext()).newPage();
  for (const [key, address] of [
    ["SAMPLE-1005", HALVARD],
    ["SAMPLE-1010", HERON],
  ]) {
    await guest.goto(`/homes/${key}`);
    await expect(homeIn(guest, address)).toBeVisible();
    await expect(latestOf(guest, address)).not.toContainText(/sent/i);
    await expect(guest.getByText(/sent this/)).toHaveCount(0);
    // Nor is it in the page as it's sent.
    const html = await (await guest.request.get(`/homes/${key}`)).text();
    expect(html).not.toMatch(/sent this/);
  }
});
