import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, likeInPhoto, openComments, openMore, photoList, pick, signInAgent } from "./helpers";

test("one package, a link for each person: they react, the agent compares and replies", async ({ browser }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "alex@example.com", "Alex Rivera");
  const { urls } = await createShare(agent, ["4127 Larkmoor", "1880 Tamsen"], ["Jamie", "Sam"]);
  expect(urls.Jamie).toMatch(/\/s\/[\w-]{32}$/);
  expect(urls.Sam).toMatch(/\/s\/[\w-]{32}$/);
  expect(urls.Sam).not.toBe(urls.Jamie);
  const url = urls.Jamie;

  // Jamie opens her own link in a fresh browser, with no account.
  const jamieContext = await browser.newContext();
  const jamie = await jamieContext.newPage();
  const pageErrors: string[] = [];
  jamie.on("pageerror", (error) => pageErrors.push(error.message));
  await jamie.goto(url);
  await expect(jamie.getByRole("heading", { level: 1 })).toHaveText(
    "Jamie, I picked these 2 homes for you",
  );
  // The agent is named on the welcome screen (and in the header over every screen).
  const welcome = jamie.getByRole("region", { name: "Welcome" });
  await expect(welcome.getByText("Alex Rivera", { exact: true })).toBeVisible();
  await expect(welcome.getByText("Harbor & Pine Realty")).toBeVisible();
  await expect(jamie.getByText(/Sample listings, fictional and not for sale/)).toBeVisible();

  const house = homeIn(jamie, "4127 Larkmoor Ave NE");
  await house.getByRole("button", { name: "Next photo" }).click();
  await expect(house.getByText("Photo 2 of 4")).toBeAttached();

  // Her link already knows who she is: no name to type.
  await heartOf(house).click();
  await expect(heartOf(house)).toHaveAttribute("aria-pressed", "true");
  await expect(jamie.getByRole("textbox", { name: "First name" })).toBeHidden();
  // On the kitchen photo, heart the kitchen and its marble counters.
  await house.getByRole("button", { name: "Next photo" }).click();
  // The kitchen itself, from the list on the heart; the counters, from their spot in the photo.
  await (await photoList(house)).getByRole("button", { name: /^Like the kitchen(,|$)/ }).click();
  await likeInPhoto(house, "the marble counters");

  const jamieChat = await openComments(jamie, house);
  await jamieChat.getByLabel("Add a comment").fill("That porch is perfect.");
  await jamieChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(jamieChat.getByText("That porch is perfect.")).toBeVisible();
  await jamie.keyboard.press("Escape");

  // Sam opens his own link to the same package, and the same conversation.
  const samContext = await browser.newContext();
  const sam = await samContext.newPage();
  await sam.goto(urls.Sam);
  await expect(sam.getByRole("heading", { level: 1 })).toHaveText("Sam, I picked these 2 homes for you");
  const samHouse = homeIn(sam, "4127 Larkmoor Ave NE");
  const samChat = await openComments(sam, samHouse);
  await expect(samChat.getByText("Jamie liked the kitchen and marble counters")).toBeVisible();
  await expect(samChat.getByText("That porch is perfect.")).toBeVisible();
  await samChat.getByLabel("Add a comment").fill("The kitchen feels small.");
  await samChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(samChat.getByText("The kitchen feels small.")).toBeVisible();
  await sam.keyboard.press("Escape");

  // Not for me, and why.
  const samMore = await openMore(sam, samHouse);
  const notForMe = samMore.getByRole("button", { name: "Not for me" });
  await notForMe.click();
  await samMore.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Yard" }).click();
  await expect(notForMe).toHaveAttribute("aria-pressed", "true");

  // Reactions persist across a reload; tapping again switches one off.
  await jamie.reload();
  await expect(heartOf(house)).toHaveAttribute("aria-pressed", "true");
  let thread = await openComments(jamie, house);
  await expect(thread.getByText("You liked the kitchen and marble counters")).toBeVisible();
  await expect(thread.getByText("Sam passed, didn't like the yard")).toBeVisible();
  await notForMe.click();
  await expect(notForMe).toHaveAttribute("aria-pressed", "false");
  await jamie.reload();
  thread = await openComments(jamie, house);
  await expect(thread.getByText(/Sam passed/)).toHaveCount(0);
  await notForMe.click();
  await expect(notForMe).toHaveAttribute("aria-pressed", "true");

  // The agent sees all of it in plain words, and replies.
  await agent.reload();
  const panel = agent.getByRole("region", { name: "4127 Larkmoor Ave NE" });
  await expect(panel.getByText("liked the kitchen and marble counters")).toBeVisible();
  await expect(panel.getByText("passed on this")).toBeVisible();
  await expect(panel.getByText("That porch is perfect.")).toBeVisible();
  await expect(panel.getByText("The kitchen feels small.")).toBeVisible();
  await panel.getByLabel("Reply to your client").fill("We can measure it at the showing.");
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText("We can measure it at the showing.")).toBeVisible();

  await jamie.reload();
  thread = await openComments(jamie, house);
  await expect(thread.getByText("We can measure it at the showing.")).toBeVisible();

  // The agent can remove a comment, from its "…" menu, asked once more.
  await panel.getByRole("button", { name: "More for Sam's comment" }).click();
  await panel.getByRole("button", { name: "Remove comment from Sam" }).click();
  await expect(panel.getByText("The kitchen feels small.")).toHaveCount(0);
  await jamie.reload();
  thread = await openComments(jamie, house);
  await expect(thread.getByText("The kitchen feels small.")).toHaveCount(0);
  await jamie.keyboard.press("Escape");

  // Sam passed on the house, but liked its kitchen too.
  await sam.keyboard.press("Escape");
  await samHouse.getByRole("button", { name: "Next photo" }).click();
  await samHouse.getByRole("button", { name: "Next photo" }).click();
  await (await photoList(samHouse)).getByRole("button", { name: /^Like the kitchen(,|$)/ }).click();
  await pick(samHouse, "the marble counters");

  // The agent sees them side by side: where they agree, and where they don't.
  await agent.reload();
  const compare = agent.getByRole("region", { name: "What they each want" });
  await expect(compare).toContainText("Both like: Kitchen");
  await expect(compare).toContainText("Only Jamie: Marble counters");
  // Home by home, on a phone a card each, with a line per person, one tap away.
  await compare.locator("summary").filter({ hasText: "Home by home" }).click();
  const larkmoor = compare.getByRole("listitem").filter({ hasText: "4127 Larkmoor Ave NE" });
  await expect(larkmoor.getByRole("listitem").filter({ hasText: "Jamie" })).toContainText("liked Kitchen · Marble counters");
  await expect(larkmoor.getByRole("listitem").filter({ hasText: "Sam" })).toContainText("Passed but liked Kitchen");
  // ...and homes they might both like, one tap from their links.
  const suggested = agent.getByRole("region", { name: "Homes they might both like" });
  await expect(suggested).toContainText("812 N Corbel St");
  await suggested.getByRole("button", { name: "Add 812 N Corbel St" }).click();
  await expect(agent.getByRole("region", { name: "812 N Corbel St" })).toBeVisible();
  await sam.reload();
  await expect(homeIn(sam, "812 N Corbel St")).toBeAttached();

  // Someone else can be added later, with a link of their own.
  await agent.getByPlaceholder("Their first name").fill("Robin");
  await agent.getByRole("button", { name: "Add a person" }).click();
  const robinUrl = await agent.getByLabel("Robin's link").inputValue();
  const robin = await (await browser.newContext()).newPage();
  await robin.goto(robinUrl);
  await expect(robin.getByRole("heading", { level: 1 })).toHaveText("Robin, I picked these 3 homes for you");

  // A comment containing markup is shown as plain text.
  thread = await openComments(jamie, house);
  await thread.getByLabel("Add a comment").fill("<img src=x onerror=alert(1)>");
  await thread.getByRole("button", { name: "Post", exact: true }).click();
  await expect(thread.getByText("<img src=x onerror=alert(1)>")).toBeVisible();

  // Includes hydration mismatches, which only show up as page errors.
  expect(pageErrors).toEqual([]);

  // The agent got one email that the link was opened and one about the first
  // thing done on it, not one per event.
  const log = readFileSync("test-results-server.log", "utf8");
  const emails = log.split("\n").filter((line) => line.includes("[email] to=alex@example.com"));
  expect(emails).toHaveLength(2);
  expect(emails.filter((email) => email.includes("Jamie opened your link to 2 homes"))).toHaveLength(1);
  expect(emails.filter((email) => email.includes("Jamie liked this at 4127 Larkmoor Ave NE"))).toHaveLength(1);
});

test("link preview tags and image are in place", async ({ browser, request }) => {
  const agent = await signInAgent(browser, "preview@example.com", "Priya Shah");
  const { url } = await createShare(agent, ["812 N Corbel"]);
  const html = await (await request.get(url)).text();
  const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  expect(html).toContain("Priya Shah picked 812 N Corbel St for you");
  // One home: what it is and where, then the agent's ask.
  const description = "4 bd · 3 ba · 2,650 sq ft · Tacoma. Take a look and tell me what you think.";
  expect(html).toContain(`<meta name="description" content="${description}"/>`);
  expect(html).toContain(`<meta property="og:description" content="${description}"/>`);
  expect(html).toMatch(/name="robots" content="noindex/);
  expect(image).toBeTruthy();
  // [P] Previews show on lock screens and in group chats: never who it's for,
  // the note, or anything said.
  const previewTags = (page: string) => (page.match(/<title>[^<]*<\/title>|<meta [^>]*>/g) ?? []).join("\n");
  expect(previewTags(html)).not.toContain("Jamie");
  expect(previewTags(html)).not.toContain("yard you mentioned");

  const res = await request.get(image!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  expect((await res.body()).length).toBeGreaterThan(50_000);

  const headers = (await request.get(url)).headers();
  expect(headers["x-robots-tag"]).toContain("noindex");
  expect(headers["referrer-policy"]).toBe("no-referrer");

  // A home's own page has a picture of its own: the home, with no agent or people.
  const homeHtml = await (await request.get("/homes/SAMPLE-1004")).text();
  expect(homeHtml).toContain("$839,000 · 3 bd · 2 ba · 2,120 sq ft. See what people think.");
  const homeImage = homeHtml.match(/property="og:image" content="([^"]+)"/)?.[1];
  expect(homeImage).toContain("/homes/SAMPLE-1004/opengraph-image");
  const homeRes = await request.get(homeImage!);
  expect(homeRes.status()).toBe(200);
  expect(homeRes.headers()["content-type"]).toContain("image/png");
  expect((await homeRes.body()).length).toBeGreaterThan(50_000);
});

test("isolation: tokens, agents and signed-out visitors stay in their lane", async ({ browser, request }) => {
  const alice = await signInAgent(browser, "alice@example.com", "Alice Agent");
  const bob = await signInAgent(browser, "bob@example.com", "Bob Agent");
  const shareA = await createShare(alice, ["96 Fernhollow"]);
  const shareB = await createShare(bob, ["10421 Halvard"]);

  // Another agent can't open a share, and bad IDs and tokens are clean 404s.
  await bob.goto(shareA.dashboardUrl);
  await expect(bob.getByRole("heading", { name: "Alice" })).toHaveCount(0);
  expect((await bob.request.get(shareA.dashboardUrl)).status()).toBe(404);
  expect((await bob.request.get("/dashboard/shares/not-a-uuid")).status()).toBe(404);
  expect((await request.get(`/s/${"x".repeat(32)}`)).status()).toBe(404);
  expect((await request.get("/s/short")).status()).toBe(404);

  // A share page only carries its own listing, and no private details.
  const htmlA = await (await request.get(shareA.url)).text();
  expect(htmlA).toContain("96 Fernhollow Ln");
  expect(htmlA).not.toContain("10421 Halvard");
  expect(htmlA).not.toContain("alice@example.com");
  expect(htmlA).not.toContain(shareB.url.split("/s/")[1]);

  // Signed-out visitors are sent to sign in.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(shareA.dashboardUrl);
  await expect(anonPage).toHaveURL(/\/login$/);
  await anonPage.goto("/dashboard");
  await expect(anonPage).toHaveURL(/\/login$/);

  // Each link acts as its own person, on its own package only.
  const context = await browser.newContext();
  const client = await context.newPage();
  await client.goto(shareA.url);
  await heartOf(client.getByRole("article").first()).click();
  await expect(heartOf(client.getByRole("article").first())).toHaveAttribute("aria-pressed", "true");
  await client.goto(shareB.url);
  await expect(heartOf(client.getByRole("article").first())).toHaveAttribute("aria-pressed", "false");
});
