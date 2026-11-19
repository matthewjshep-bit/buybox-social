import { expect, test, type Page } from "@playwright/test";
import {
  signedIn,
  commentIn,
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
} from "./helpers";

const SECRET = "We could go 50k over asking.";
const SHARED = "That fenced yard is perfect for our dog.";
const BRACKENFIELD = "2205 Brackenfield Ct NW";

test("public pages show activity, never private words, and private threads share only what buyers allow", async ({
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

  // A private client thread: a private comment, a like with a photo like, and
  // a comment the client chooses to share anonymously.
  const agent = await signInAgent(browser, "pat@example.com", "Pat Agent");
  const { urls } = await createShare(agent, ["2205 Brackenfield"], ["Riley", "Quinn"]);
  const client = await signedIn(browser);
  await client.goto(urls.Riley);
  const clientHome = homeIn(client, BRACKENFIELD);
  let chat = await openComments(client, clientHome);
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(SECRET)).toBeVisible();
  // Sharing publicly is only offered once you like the home.
  await expect(chat.getByLabel(/share publicly/)).toHaveCount(0);
  await client.keyboard.press("Escape");

  await heartOf(clientHome).click();
  await expect(heartOf(clientHome)).toHaveAttribute("aria-pressed", "true");
  await likeInPhoto(clientHome, "the brick front");
  chat = await openComments(client, clientHome);
  await chat.getByLabel(/share publicly/).check();
  await chat.getByLabel("Add a comment").fill(SHARED);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText("Shared anonymously on the public page")).toBeVisible();
  await client.keyboard.press("Escape");

  // A second person on the package passes on the yard, from their own link. That stays private.
  const quinn = await signedIn(browser);
  await quinn.goto(urls.Quinn);
  const quinnMore = await passOn(quinn, homeIn(quinn, BRACKENFIELD));
  const quinnWhy = quinnMore.getByRole("group", { name: "What made you pass?" });
  await quinnWhy.getByRole("button", { name: "Yard" }).click();
  await expect(quinnWhy.getByRole("button", { name: "Yard" })).toHaveAttribute("aria-pressed", "true");

  // The home's public page shows the activity: first the comment the client
  // chose to share, without her name; in its turn, the private one, without
  // its words.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1006");
  const post = homeIn(page, BRACKENFIELD);
  const activity = post.getByRole("group", { name: "Recent activity" });
  await expect(activity).toContainText(`A buyer commented\u201c${SHARED}\u201d`);
  await expect(post).toContainText("A buyer commented privately", { timeout: 30_000 });
  await expect(activity).not.toContainText(SECRET);
  await expect(post).toContainText("Listed by Priya Natarajan");
  await expect(post).toContainText(/Traditional brick-front home/);
  await expect(post.getByRole("button", { name: `Like ${BRACKENFIELD}, 1 like` })).toBeVisible();
  let sheet = await openComments(page, post);
  // The private pass shows nowhere: not in the comments...
  await expect(sheet.getByText("People pass on")).toHaveCount(0);
  await expect(sheet).not.toContainText(/pass/i);
  const thread = sheet.getByRole("list", { name: "Comments and likes" });
  await expect(thread).toContainText("A buyer liked the brick front");
  await expect(thread).toContainText(SHARED);
  await expect(thread).toContainText("Shared from a private chat");
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.getByText(/Riley|Quinn/)).toHaveCount(0);
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
  await expect(card.getByText(/Riley|Quinn/)).toHaveCount(0);
  // Nor in the comments beside it, nor anywhere in her page as it's sent.
  await card.getByRole("button", { name: /^See the \d+ comments?$/ }).click();
  const rivalSheet = rival.getByRole("dialog", { name: "Comments" });
  await expect(rivalSheet).toContainText(SHARED);
  await expect(rivalSheet).not.toContainText(/pass/i);
  await expect(rival.getByText(SECRET)).toHaveCount(0);
  await expect(rival.getByText(/Riley|Quinn/)).toHaveCount(0);
  const rivalHtml = await (await rival.request.get(rival.url())).text();
  expect(rivalHtml).not.toContain(SECRET);
  expect(rivalHtml).not.toMatch(/Riley|Quinn/);

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
  await expect(thread).toContainText("You liked the natural light");
  await page.keyboard.press("Escape");
  card = await porchcard();
  await expect(card.getByText("Natural light 1")).toBeVisible();
  await expect(post.getByRole("button", { name: `Like ${BRACKENFIELD}, 2 likes` })).toBeVisible();

  // Other visitors see it, by name.
  const other = await (await browser.newContext()).newPage();
  await other.goto("/homes/SAMPLE-1006");
  const otherPost = homeIn(other, BRACKENFIELD);
  let otherSheet = await openComments(other, otherPost);
  await expect(otherSheet.getByText("Love the quiet cul-de-sac.")).toBeVisible();
  await expect(otherSheet.getByText("Morgan liked the natural light")).toBeVisible();
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
  await other.reload();
  otherSheet = await openComments(other, otherPost);
  await expect(otherSheet.getByText("You passed, didn't like the price")).toBeVisible();
  await other.keyboard.press("Escape");
  // In the Porchcard too: the public pass and why, and still nobody from the link.
  card = await porchcard();
  await expect(card.getByText("Didn't like", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Price 1 person/ })).toBeVisible();
  await expect(card.getByRole("button", { name: /^Yard/ })).toHaveCount(0);
  await expect(card.getByText(/Riley|Quinn/)).toHaveCount(0);

  // Private words and names are not in the public HTML at all.
  for (const path of ["/", "/homes/SAMPLE-1006"]) {
    const html = await (await other.request.get(path)).text();
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("Riley");
    expect(html).not.toContain("Quinn");
  }

  // The client can take a shared comment back.
  chat = await openComments(client, clientHome);
  await chat.getByRole("button", { name: "Make private" }).click();
  await expect(chat.getByText("Shared anonymously on the public page")).toHaveCount(0);
  await other.reload();
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

test("a home sent on a link says so only to whoever sent it: an agent's went to a client, anyone else's just went", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const HALVARD = "10421 Halvard Way NE";
  const HERON = "88 Heron Bluff Rd";
  const sentLine = (page: Page, address: string) => homeIn(page, address).getByRole("group", { name: "Recent activity" });

  // An agent sends a home to a client: the newest thing about it.
  const agent = await signInAgent(browser, "sena-sent@example.com", "Sena Sent");
  await createShare(agent, ["10421 Halvard"], ["Pat"]);
  // And someone who isn't an agent sends another to a friend.
  const mo = await signUpBuyer(browser, "mo.sent@example.com", "Mo Sent");
  await mo.goto("/send");
  await pickHome(mo, HERON);
  await mo.getByRole("button", { name: "Next", exact: true }).click();
  const who = mo.getByRole("combobox", { name: "Who's it for?" });
  await who.fill("Sam");
  await who.press("Enter");
  await mo.getByRole("button", { name: "Next", exact: true }).click();
  await mo.waitForURL(/\/s\/[\w-]+\?step=thoughts$/);
  await mo.getByRole("link", { name: "Skip this step" }).click();
  await mo.waitForURL(/\/send\/[\w-]+$/);

  // Each is told about their own, in their own words.
  await agent.goto("/homes/SAMPLE-1005");
  await expect(sentLine(agent, HALVARD)).toContainText("You sent this to a client");
  await mo.goto("/homes/SAMPLE-1010");
  await expect(sentLine(mo, HERON)).toContainText("You sent this");
  await expect(sentLine(mo, HERON)).not.toContainText("client");

  // Nobody else is: not each other, not a visitor. That a home went out on
  // someone's link is theirs to know.
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
    await expect(guest.getByText(/sent this/)).toHaveCount(0);
  }
});
