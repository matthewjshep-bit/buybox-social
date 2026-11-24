// Every link the agent has sent, as Messages has them: one conversation per
// person, newest first, and a link nobody is named on as a conversation of
// its own, called for its home ("Link for 96 Fernhollow Ln"). Each row says
// in a line how it's gone, "Waiting" when they're waiting on the agent, and
// is marked new until the agent looks. Inside, each home is a card with what
// was done to it; the link's own page is a tap from the top, and leads back
// to the conversation it belongs to. (The old Links page leads here.)
import { expect, test, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, openComments, signedIn, signInAgent, threadHome, threadRow } from "./helpers";

// A link with nobody named on it: the one anyone can join.
async function namelessLink(agent: Page, address: string) {
  const { dashboardUrl } = await createShare(agent, [address], []);
  return { url: await agent.getByLabel("Your link is ready").inputValue(), dashboardUrl };
}

const actionAnswered = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

const rows = (page: Page) => page.getByRole("list", { name: "Conversations" }).getByRole("listitem");

test("every link sent is a conversation, newest first: who it's for, how it's gone, what's new, and its page a tap away", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const lina = await signInAgent(browser, "lina.links@example.com", "Lina Links");
  const forJo = await createShare(lina, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);
  const forMax = await createShare(lina, ["812 N Corbel"], ["Max"]);
  const forKit = await createShare(lina, ["10421 Halvard"], ["Kit"]);
  // Two with nobody on them, to the same home, one after the other.
  const older = await namelessLink(lina, "96 Fernhollow");
  const newer = await namelessLink(lina, "96 Fernhollow");
  const pathOf = (url: string) => new URL(url).pathname;
  const idOf = (url: string) => pathOf(url).split("/").pop()!;

  // A link nobody has opened says so in one line, in place of four boxes of
  // nothing; and "Wants" (what they want) isn't a tab until someone has liked or
  // passed on a home (it's still there when asked for, about nobody by name).
  await expect(lina).toHaveTitle("Link for 96 Fernhollow Ln · Porchcard");
  const glance = lina.getByLabel("At a glance");
  await expect(glance.getByRole("definition")).toHaveText(["Not opened yet"]);
  const parts = lina.getByRole("navigation", { name: "Parts of this page" });
  await expect(parts.getByRole("link")).toHaveText([/^Homes/, /^People & link/]);
  await lina.goto(`${newer.dashboardUrl}?tab=want`);
  await expect(parts.getByRole("link", { name: "Wants", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(lina.getByRole("heading", { level: 2, name: "What they want" })).toBeVisible();

  // Jo says something about a home (so she's waiting for Lina); Kit likes one.
  const jo = await signedIn(browser);
  await jo.goto(forJo.url);
  const chat = await openComments(jo, homeIn(jo, "1204 Quillan St SE"));
  await chat.getByLabel("Add a comment").fill("Is the roof new?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");
  // (Signed in with a name, so the link takes the like without asking for one.)
  const kit = await signedIn(browser, undefined, "Kit");
  await kit.goto(forKit.url);
  const halvard = homeIn(kit, "10421 Halvard Way NE");
  // (The heart fills at once; the like is saved a moment later. Lina's
  // Messages must read it, so wait until Kit's own Rated homes has it.)
  await heartOf(halvard).click();
  await expect(heartOf(halvard)).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await kit.request.get("/people/me/rated")).text(), { timeout: 15_000 })
    .toContain("10421 Halvard Way NE");

  // The Links page is Messages now.
  await lina.goto("/dashboard/links");
  await lina.waitForURL(/\/messages$/);
  await expect(lina).toHaveTitle("Messages · Porchcard");
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Messages");
  await expect(lina.getByRole("link", { name: "Send homes" })).toHaveAttribute("href", "/dashboard/new");

  // Every link, newest thing first, each called by who it's for: Kit and Jo,
  // who just did something, then the two with nobody on them (by their
  // home), then Max.
  await expect(rows(lina)).toHaveCount(5);
  for (const [i, name] of ["Kit", "Jo", "Link for 96 Fernhollow Ln", "Link for 96 Fernhollow Ln", "Max"].entries()) {
    await expect(rows(lina).nth(i).getByText(name, { exact: true })).toBeVisible();
  }

  // Jo's: that she's waiting, and that it's new; Kit's is new too; Max's,
  // with nothing done on it, is neither.
  const joRow = threadRow(lina, "Jo");
  await expect(joRow).toContainText(/“Is the roof new\?”\s*·\s*today/);
  await expect(joRow.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(joRow.getByText("New", { exact: true })).toBeVisible();
  await expect(threadRow(lina, "Kit")).toContainText(/Liked 1 of 1 home\s*·\s*today/);
  await expect(threadRow(lina, "Kit").getByText("New", { exact: true })).toBeVisible();
  await expect(threadRow(lina, "Kit").getByText("Waiting", { exact: true })).toHaveCount(0);
  await expect(threadRow(lina, "Max")).toContainText(/Not opened yet\s*·\s*today/);
  await expect(threadRow(lina, "Max").getByText("New", { exact: true })).toHaveCount(0);
  await expect(threadRow(lina, "Max").getByRole("button")).toHaveCount(0);

  // Jo's conversation: her two homes, her words under the one she asked
  // about, and the link's page from the top, which comes back here.
  await joRow.getByRole("link").click();
  await lina.waitForURL(/\/messages\/.+/);
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Jo");
  const joThread = lina.url();
  await expect(lina.getByRole("list", { name: "Messages" }).locator("li[id^='home-']")).toHaveCount(2);
  const quillan = threadHome(lina, "1204 Quillan St SE");
  await expect(quillan).toContainText("1 comment");
  await expect(quillan.getByRole("list", { name: "Comments on 1204 Quillan St SE" })).toContainText("Is the roof new?");
  await expect(threadHome(lina, "719 Saltmarsh Ln")).not.toContainText("comment");
  await expect(lina.getByRole("link", { name: "Link details" })).toHaveAttribute("href", pathOf(forJo.dashboardUrl));
  await lina.getByRole("link", { name: "Link details" }).click();
  await lina.waitForURL(/\/dashboard\/shares\/[\w-]+\?tab=homes$/);
  await expect(lina).toHaveTitle("Jo · Porchcard");
  await expect(lina.getByRole("navigation", { name: "Clients" })).toHaveCount(0);
  const back = lina.getByRole("main").getByRole("link").first();
  await expect(back).toHaveText("Jo");
  await back.click();
  await lina.waitForURL(joThread);
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Jo");

  // Kit's: what he made of it, on the home.
  await lina.goto("/messages");
  await threadRow(lina, "Kit").getByRole("link").click();
  await lina.waitForURL(/\/messages\/.+/);
  await expect(threadHome(lina, "10421 Halvard Way NE")).toContainText("Kit liked it");
  await expect(threadHome(lina, "10421 Halvard Way NE")).not.toContainText("comment");

  // Max's: not opened, so his home says so; his link, to send again, is on
  // the link's page.
  await lina.goto("/messages");
  await threadRow(lina, "Max").getByRole("link").click();
  await lina.waitForURL(/\/messages\/.+/);
  await expect(threadHome(lina, "812 N Corbel St")).toContainText("Not opened yet");
  await lina.getByRole("link", { name: "Link details" }).click();
  await lina.waitForURL(/\/dashboard\/shares\/[\w-]+\?tab=people$/);
  await expect(lina.locator("input[readonly]").first()).toHaveValue(forMax.url);

  // The two with no name are each a conversation named for the home, not
  // opened yet; each one's page is its own.
  await lina.goto("/messages");
  const nameless = rows(lina).filter({ hasText: "Link for 96 Fernhollow Ln" });
  await expect(nameless).toHaveCount(2);
  for (const row of await nameless.all()) {
    await expect(row).toContainText(/Not opened yet\s*·\s*today/);
    await expect(row.getByText("New", { exact: true })).toHaveCount(0);
  }
  await expect(nameless.nth(0).getByRole("link")).toHaveAttribute("href", `/messages/link%3A${idOf(newer.dashboardUrl)}`);
  await expect(nameless.nth(1).getByRole("link")).toHaveAttribute("href", `/messages/link%3A${idOf(older.dashboardUrl)}`);
  await expect(lina.getByText("No name yet")).toHaveCount(0);
  await expect(lina.getByText("Unnamed client")).toHaveCount(0);

  // Someone opens the older one: its row says so.
  const visitor = await (await browser.newContext()).newPage();
  await Promise.all([actionAnswered(visitor), visitor.goto(older.url)]);
  await expect(homeIn(visitor, "96 Fernhollow Ln")).toBeVisible();
  await lina.reload();
  const opened = nameless.filter({ hasText: /Opened\s*·\s*today/ });
  await expect(opened).toHaveCount(1);
  await expect(nameless.filter({ hasText: "Not opened yet" })).toHaveCount(1);

  // One with nobody on it belongs to no client: its page leads back to its
  // own conversation.
  await lina.goto(older.dashboardUrl);
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Link for 96 Fernhollow Ln");
  await expect(back).toHaveText("Link for 96 Fernhollow Ln");
  await back.click();
  await lina.waitForURL(`/messages/link%3A${idOf(older.dashboardUrl)}`);
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Link for 96 Fernhollow Ln");
  await expect(threadHome(lina, "96 Fernhollow Ln")).toBeVisible();
});

test("with nine conversations, Messages lists them all, newest first, whoever is waiting marked", async ({ browser }) => {
  test.setTimeout(240_000);
  const nora = await signInAgent(browser, "nora.nine@example.com", "Nora Nine");
  const names = ["Ada", "Bea", "Cal", "Dot", "Eve", "Flo", "Gus", "Hal"];
  for (const [i, name] of names.entries()) {
    await createShare(nora, [i % 2 ? "719 Saltmarsh" : "1204 Quillan"], [name]);
  }

  // Eight, none opened: every one listed, the newest first, none waiting or new.
  await nora.goto("/messages");
  await expect(rows(nora)).toHaveCount(8);
  await expect(rows(nora).first()).toContainText("Hal");
  await expect(rows(nora).last()).toContainText("Ada");
  await expect(rows(nora).getByText("Waiting", { exact: true })).toHaveCount(0);
  await expect(rows(nora).getByText("New", { exact: true })).toHaveCount(0);
  for (const row of await rows(nora).all()) {
    await expect(row).toContainText(/Not opened yet\s*·\s*today/);
  }

  // A ninth, and she says something on it.
  const forIvy = await createShare(nora, ["812 N Corbel"], ["Ivy"]);
  const ivy = await signedIn(browser);
  await ivy.goto(forIvy.url);
  const chat = await openComments(ivy, homeIn(ivy, "812 N Corbel St"));
  await chat.getByLabel("Add a comment").fill("How old is the furnace?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // Nine: Ivy first, waiting and new, with what she said; everyone else as before.
  await nora.goto("/messages");
  await expect(rows(nora)).toHaveCount(9);
  await expect(rows(nora).first()).toContainText("Ivy");
  const ivyRow = threadRow(nora, "Ivy");
  await expect(ivyRow).toContainText("“How old is the furnace?”");
  await expect(ivyRow.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(ivyRow.getByText("New", { exact: true })).toBeVisible();
  await expect(rows(nora).getByText("Waiting", { exact: true })).toHaveCount(1);
  await expect(rows(nora).getByText("New", { exact: true })).toHaveCount(1);
  await expect(rows(nora).filter({ hasText: "Not opened yet" })).toHaveCount(8);
  // Each row a fingertip tall.
  for (const link of await rows(nora).getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // Hers: her words under the home, and Reply right there.
  await ivyRow.getByRole("link").click();
  await nora.waitForURL(/\/messages\/.+/);
  await expect(nora.getByRole("heading", { level: 1 })).toHaveText("Ivy");
  const corbel = threadHome(nora, "812 N Corbel St");
  await expect(corbel).toContainText("1 comment");
  await expect(corbel).toContainText("How old is the furnace?");
  await expect(corbel.getByRole("button", { name: "Reply about 812 N Corbel St" })).toBeVisible();
});
