// Clients' Links tab: every link the agent has sent, newest first,
// whoever it went to. Each says who it's for ("No name yet", with nobody on
// it), its homes and when it went (to the minute, when two would otherwise
// read the same), and how it's gone, in a few words; with one button: the
// link to copy while nobody has opened it, otherwise its page. A link nobody
// has opened and nobody is named on can be deleted, there and only there. A
// link's own page leads back to the client it belongs to, or to Links.
import { expect, test, type Page } from "@playwright/test";
import { clientRow, createShare, heartOf, homeIn, openComments, signedIn, signInAgent } from "./helpers";

// A link with nobody named on it: the one anyone can join.
async function namelessLink(agent: Page, address: string) {
  const { dashboardUrl } = await createShare(agent, [address], []);
  return { url: await agent.getByLabel("Your link is ready").inputValue(), dashboardUrl };
}

const actionAnswered = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

const linkRows = (page: Page) => page.getByRole("list", { name: "Links" }).getByRole("listitem");

test("every link sent, newest first: who it's for, how it's gone, one button, and Delete only while nobody has used it", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const lina = await signInAgent(browser, "lina.links@example.com", "Lina Links");
  await lina.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const forJo = await createShare(lina, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);
  const forMax = await createShare(lina, ["812 N Corbel"], ["Max"]);
  const forKit = await createShare(lina, ["10421 Halvard"], ["Kit"]);
  // Two with nobody on them, to the same home, one after the other.
  const older = await namelessLink(lina, "96 Fernhollow");
  const newer = await namelessLink(lina, "96 Fernhollow");
  const pathOf = (url: string) => new URL(url).pathname;

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
  const kit = await signedIn(browser);
  await kit.goto(forKit.url);
  const halvard = homeIn(kit, "10421 Halvard Way NE");
  await heartOf(halvard).click();
  await expect(heartOf(halvard)).toHaveAttribute("aria-pressed", "true");

  // Clients' second tab.
  await lina.goto("/dashboard");
  // (Jo's row there has the mark Home has: something new since Lina looked.)
  await expect(clientRow(lina, "Jo")).toContainText("New since you last looked");
  const tabs = lina.getByRole("navigation", { name: "Clients" });
  await tabs.getByRole("link", { name: "Links" }).click();
  await lina.waitForURL(/\/dashboard\/links$/);
  await expect(lina).toHaveTitle("Clients · Porchcard");
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Links");
  await expect(tabs.getByRole("link", { name: "Links" })).toHaveAttribute("aria-current", "page");
  await expect(lina.getByRole("main").getByRole("link", { name: "Send homes" })).toHaveAttribute("href", "/dashboard/new");

  // Every link, newest first, each called by who it's for.
  const rows = linkRows(lina);
  await expect(rows.getByRole("link", { name: /^(No name yet|Jo|Max|Kit)$/ })).toHaveText([
    "No name yet",
    "No name yet",
    "Kit",
    "Max",
    "Jo",
  ]);
  const rowFor = (name: string) => rows.filter({ has: lina.getByRole("link", { name, exact: true }) });

  // Jo's: its homes and when it went, that she's waiting, that it's new; and
  // Open, to its page. (Nothing to copy: she has it.)
  await expect(rowFor("Jo")).toContainText("1204 Quillan St SE and 1 more · Sent today");
  await expect(rowFor("Jo")).toContainText("Waiting for you");
  await expect(rowFor("Jo").getByText("New", { exact: true })).toBeVisible();
  await expect(rowFor("Kit").getByText("New", { exact: true })).toBeVisible();
  await expect(rowFor("Max").getByText("New", { exact: true })).toHaveCount(0);
  await expect(rowFor("Jo").getByRole("link", { name: "Jo", exact: true })).toHaveAttribute("href", pathOf(forJo.dashboardUrl));
  await expect(rowFor("Jo").getByRole("link", { name: "Open the link for 1204 Quillan St SE and 1 more" })).toHaveAttribute(
    "href",
    pathOf(forJo.dashboardUrl),
  );
  await expect(rowFor("Jo").getByRole("button")).toHaveCount(0);

  // Kit's: what he made of it. Open.
  await expect(rowFor("Kit")).toContainText("Liked 1");
  await expect(rowFor("Kit")).not.toContainText("comment");
  await expect(rowFor("Kit").getByRole("link", { name: /^Open the link for/ })).toBeVisible();
  await expect(rowFor("Kit").getByRole("button")).toHaveCount(0);

  // Max's: not opened, so the one button is his link, to send again. No
  // time of day (nothing else reads like it), and it can't be deleted: it
  // has his name on it.
  await expect(rowFor("Max")).toContainText("812 N Corbel St · Sent today");
  await expect(rowFor("Max")).toContainText("Not opened yet");
  await expect(rowFor("Max")).not.toContainText(/Sent today, \d/);
  await expect(rowFor("Max").getByRole("link", { name: /^Open/ })).toHaveCount(0);
  await expect(rowFor("Max").getByRole("button")).toHaveCount(1);
  await rowFor("Max").getByRole("button", { name: "Copy link for Max" }).click();
  await expect(rowFor("Max").getByRole("button", { name: /^Copied/ })).toBeVisible();
  expect(await lina.evaluate(() => navigator.clipboard.readText())).toBe(forMax.url);

  // The two with no name went to the same home on the same day, so each says
  // what time; each has its link to copy, and Delete.
  const nameless = rows.filter({ hasText: "No name yet" });
  await expect(nameless).toHaveCount(2);
  for (const row of await nameless.all()) {
    await expect(row).toContainText(/96 Fernhollow Ln · Sent today, \d{1,2}:\d{2} [ap]m/);
    await expect(row).toContainText("Not opened yet");
    await expect(row.getByRole("button", { name: "Copy link for 96 Fernhollow Ln" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete the link for 96 Fernhollow Ln" })).toBeVisible();
  }
  await nameless.first().getByRole("button", { name: /^Copy link/ }).click();
  expect(await lina.evaluate(() => navigator.clipboard.readText())).toBe(newer.url);

  // Delete asks first, and Keep keeps it.
  const ask = lina.getByRole("group", { name: "Delete the link for 96 Fernhollow Ln?" });
  await nameless.first().getByRole("button", { name: /^Delete the link/ }).click();
  await expect(ask).toBeFocused();
  await ask.getByRole("button", { name: "Keep" }).click();
  await expect(ask).toHaveCount(0);
  await expect(nameless.first().getByRole("button", { name: /^Delete the link/ })).toBeFocused();
  await expect(rows).toHaveCount(5);

  // Yes: it's gone from the list, and the link itself no longer opens. The
  // one left reads like no other now, so it says only the day.
  await nameless.first().getByRole("button", { name: /^Delete the link/ }).click();
  await ask.getByRole("button", { name: "Yes, delete" }).click();
  await expect(rows).toHaveCount(4);
  await expect(nameless).toHaveCount(1);
  await expect(nameless).toContainText("96 Fernhollow Ln · Sent today");
  await expect(nameless).not.toContainText(/Sent today, \d/);
  expect((await request.get(newer.url)).status()).toBe(404);
  expect((await request.get(older.url)).status()).toBe(200);

  // Someone opens the one that's left while Lina's list still offers Delete
  // (her page left open, not catching up): the server won't delete it.
  await lina.evaluate(() => Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }));
  const visitor = await (await browser.newContext()).newPage();
  await Promise.all([actionAnswered(visitor), visitor.goto(older.url)]);
  await expect(homeIn(visitor, "96 Fernhollow Ln")).toBeVisible();
  await nameless.getByRole("button", { name: /^Delete the link/ }).click();
  await ask.getByRole("button", { name: "Yes, delete" }).click();
  await expect(ask.getByRole("alert")).toHaveText("This link has been opened or named, so it stays.");
  expect((await request.get(older.url)).status()).toBe(200);

  // And once the list has caught up, Delete isn't offered: it says when it
  // was opened, and the button is Open.
  await lina.reload();
  await expect(rows).toHaveCount(4);
  await expect(nameless).toContainText("Opened today");
  await expect(nameless.getByRole("button")).toHaveCount(0);
  await expect(nameless.getByRole("link", { name: "Open the link for 96 Fernhollow Ln" })).toBeVisible();

  // A link's page leads back to the client it belongs to: Jo's, to Jo. The
  // Dashboard's tabs aren't on it.
  await rowFor("Jo").getByRole("link", { name: "Jo", exact: true }).click();
  await lina.waitForURL(/\/dashboard\/shares\/[\w-]+\?tab=homes$/);
  await expect(lina).toHaveTitle("Jo · Porchcard");
  await expect(tabs).toHaveCount(0);
  const back = lina.getByRole("main").getByRole("link").first();
  await expect(back).toHaveText("Jo");
  await back.click();
  await lina.waitForURL(/\/dashboard\/clients\//);
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Jo");

  // One with nobody on it belongs to no client: back to Links.
  await lina.goto(older.dashboardUrl);
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Link for 96 Fernhollow Ln");
  await expect(back).toHaveText("Links");
  await back.click();
  await lina.waitForURL(/\/dashboard\/links$/);
  await expect(lina.getByRole("heading", { level: 1 })).toHaveText("Links");
});

test("with more than eight, a box finds a link or a client, and the links can be narrowed to who's waiting or what's unopened", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const nora = await signInAgent(browser, "nora.nine@example.com", "Nora Nine");
  const names = ["Ada", "Bea", "Cal", "Dot", "Eve", "Flo", "Gus", "Hal"];
  for (const [i, name] of names.entries()) {
    await createShare(nora, [i % 2 ? "719 Saltmarsh" : "1204 Quillan"], [name]);
  }
  const findLink = nora.getByRole("searchbox", { name: "Find a link" });
  const findClient = nora.getByRole("searchbox", { name: "Find a client" });
  const show = nora.getByRole("navigation", { name: "Which links to show" });
  const rows = linkRows(nora);

  // Eight is few enough to look down: no box, no choices, on either page.
  await nora.goto("/dashboard/links");
  await expect(rows).toHaveCount(8);
  await expect(findLink).toHaveCount(0);
  await expect(show).toHaveCount(0);
  await nora.goto("/dashboard");
  await expect(clientRow(nora, "Ada")).toBeVisible();
  await expect(findClient).toHaveCount(0);

  // A ninth, and she says something on it.
  const forIvy = await createShare(nora, ["812 N Corbel"], ["Ivy"]);
  const ivy = await signedIn(browser);
  await ivy.goto(forIvy.url);
  const chat = await openComments(ivy, homeIn(ivy, "812 N Corbel St"));
  await chat.getByLabel("Add a comment").fill("How old is the furnace?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // Links: found by a name, or by the first home's address, as it's typed.
  await nora.goto("/dashboard/links");
  await expect(rows).toHaveCount(9);
  await findLink.fill("gus");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Gus");
  await findLink.fill("Saltmarsh");
  await expect(rows).toHaveCount(4);
  await findLink.fill("zzz");
  await expect(rows).toHaveCount(0);
  await expect(nora.getByRole("status").filter({ hasText: "No link" })).toHaveText("No link by that name or address.");
  await findLink.fill("");
  await expect(rows).toHaveCount(9);

  // Three choices of which to show, kept in the address.
  await expect(show.getByRole("link")).toHaveText(["All", "Waiting for you", "Not opened"]);
  await expect(show.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "true");
  await show.getByRole("link", { name: "Waiting for you" }).click();
  await nora.waitForURL(/\/dashboard\/links\?show=waiting$/);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Ivy");
  await expect(rows).toContainText("Waiting for you");
  await show.getByRole("link", { name: "Not opened" }).click();
  await nora.waitForURL(/\/dashboard\/links\?show=unopened$/);
  await expect(show.getByRole("link", { name: "Not opened" })).toHaveAttribute("aria-current", "true");
  await expect(rows).toHaveCount(8);
  await expect(rows.filter({ hasText: "Ivy" })).toHaveCount(0);
  for (const choice of await show.getByRole("link").all()) {
    // (A 36px pill in a 44px touch area.)
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  }

  // Clients: found by name; a group with nobody found in it goes, heading and all.
  await nora.goto("/dashboard");
  await expect(nora.getByRole("heading", { level: 2 })).toHaveText([/^Waiting for you\s*1$/, /^Haven't opened yet\s*8$/]);
  expect((await findClient.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await findClient.fill("iv");
  await expect(nora.getByRole("heading", { level: 2 })).toHaveText([/^Waiting for you\s*1$/]);
  await expect(clientRow(nora, "Ivy")).toBeVisible();
  await expect(clientRow(nora, "Gus")).toHaveCount(0);
  await findClient.fill("a");
  await expect(nora.getByRole("heading", { level: 2 })).toHaveText([/^Haven't opened yet\s*4$/]);
  await findClient.fill("zzz");
  await expect(nora.getByRole("heading", { level: 2 })).toHaveCount(0);
  await expect(nora.getByRole("status").filter({ hasText: "No client" })).toHaveText("No client by that name.");
  await findClient.fill("");
  await expect(clientRow(nora, "Gus")).toBeVisible();
});
