import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, openMore, photoList, pin, signInAgent } from "./helpers";

test("agent shares, two people react and comment, agent sees and replies", async ({ browser }) => {
  const agent = await signInAgent(browser, "alex@example.com", "Alex Rivera");
  const { url } = await createShare(agent, ["4127 Larkmoor", "1880 Tamsen"]);
  expect(url).toMatch(/\/s\/[\w-]{32}$/);

  // Client opens the link in a fresh browser, with no account.
  const jamieContext = await browser.newContext();
  const jamie = await jamieContext.newPage();
  const pageErrors: string[] = [];
  jamie.on("pageerror", (error) => pageErrors.push(error.message));
  await jamie.goto(url);
  await expect(jamie.getByRole("heading", { level: 1 })).toHaveText(
    "Jamie, I picked these 2 homes for you",
  );
  await expect(jamie.getByText("Alex Rivera", { exact: true })).toBeVisible();
  await expect(jamie.getByText("Harbor & Pine Realty")).toBeVisible();
  await expect(jamie.getByText(/Sample listings, fictional and not for sale/)).toBeVisible();

  const house = homeIn(jamie, "4127 Larkmoor Ave NE");
  await house.getByRole("button", { name: "Next photo" }).click();
  await expect(house.getByText("Photo 2 of 4")).toBeAttached();

  // The first like asks for a name, then applies.
  await heartOf(house).click();
  await joinAs(jamie, "Jamie");
  await expect(heartOf(house)).toHaveAttribute("aria-pressed", "true");
  // On the kitchen photo, heart the kitchen and its marble counters.
  await house.getByRole("button", { name: "Next photo" }).click();
  // The kitchen itself, from the list on the heart; the counters, from their spot in the photo.
  await (await photoList(house)).getByRole("button", { name: /^Like the kitchen/ }).click();
  await pin(house, /^Like the marble counters/).click();
  await expect(pin(house, /^Like the marble counters/)).toHaveAttribute("aria-pressed", "true");

  const jamieChat = await openComments(jamie, house);
  await jamieChat.getByLabel("Add a comment").fill("That porch is perfect.");
  await jamieChat.getByRole("button", { name: "Post comment" }).click();
  await expect(jamieChat.getByText("That porch is perfect.")).toBeVisible();
  await jamie.keyboard.press("Escape");

  // A second person on the same link joins the same thread.
  const samContext = await browser.newContext();
  const sam = await samContext.newPage();
  await sam.goto(url);
  const samHouse = homeIn(sam, "4127 Larkmoor Ave NE");
  const samChat = await openComments(sam, samHouse);
  await expect(samChat.getByText("Jamie liked the kitchen and marble counters")).toBeVisible();
  await expect(samChat.getByText("That porch is perfect.")).toBeVisible();
  await samChat.getByLabel("Add a comment").fill("The kitchen feels small.");
  await samChat.getByRole("button", { name: "Post comment" }).click();
  await joinAs(sam, "Sam");
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

  // The agent can remove a comment.
  await panel.getByRole("button", { name: "Remove comment from Sam" }).click();
  await expect(panel.getByText("The kitchen feels small.")).toHaveCount(0);
  await jamie.reload();
  thread = await openComments(jamie, house);
  await expect(thread.getByText("The kitchen feels small.")).toHaveCount(0);

  // A comment containing markup is shown as plain text.
  await thread.getByLabel("Add a comment").fill("<img src=x onerror=alert(1)>");
  await thread.getByRole("button", { name: "Post comment" }).click();
  await expect(thread.getByText("<img src=x onerror=alert(1)>")).toBeVisible();

  // Includes hydration mismatches, which only show up as page errors.
  expect(pageErrors).toEqual([]);

  // The agent got one email, not one per event.
  const log = readFileSync("test-results-server.log", "utf8");
  const emails = log.split("\n").filter((line) => line.includes("[email] to=alex@example.com"));
  expect(emails).toHaveLength(1);
});

test("link preview tags and image are in place", async ({ browser, request }) => {
  const agent = await signInAgent(browser, "preview@example.com", "Priya Shah");
  const { url } = await createShare(agent, ["812 N Corbel"]);
  const html = await (await request.get(url)).text();
  const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
  expect(html).toContain("Priya Shah picked 812 N Corbel St for you");
  expect(html).toMatch(/name="robots" content="noindex/);
  expect(image).toBeTruthy();

  const res = await request.get(image!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
  expect((await res.body()).length).toBeGreaterThan(50_000);

  const headers = (await request.get(url)).headers();
  expect(headers["x-robots-tag"]).toContain("noindex");
  expect(headers["referrer-policy"]).toBe("no-referrer");
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

  // A device joined on one share is a stranger on another.
  const context = await browser.newContext();
  const client = await context.newPage();
  await client.goto(shareA.url);
  await heartOf(client.getByRole("article").first()).click();
  await joinAs(client, "Casey");
  await expect(heartOf(client.getByRole("article").first())).toHaveAttribute("aria-pressed", "true");
  await client.goto(shareB.url);
  await heartOf(client.getByRole("article").first()).click();
  await expect(client.getByRole("textbox", { name: "First name" })).toBeVisible();
});
