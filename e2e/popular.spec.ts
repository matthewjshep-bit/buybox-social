// Popular, in the bar: the homes people like and talk about most, number one
// first, and (its other half) the people who like and comment the most.
// Over this week, this month, or all time. A home's place counts what was
// done on a link too, as a number only; a person's place is only what they
// did in public, so a client who has only ever been on their agent's link is
// never listed. And the agents, by how many listings they have.
import { expect, test, type Page } from "@playwright/test";
import {
  createShare,
  enterListingYourself,
  heartOf,
  homeIn,
  joinAs,
  openComments,
  signInAgent,
  signUpBuyer,
} from "./helpers";

// A tiny PNG, as a photo would arrive.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);

const QUILLAN = "1204 Quillan St SE";

// Each row's likes and comments, down the list.
const scores = (page: Page, list: string) =>
  page
    .getByRole("list", { name: list })
    .getByRole("listitem")
    .evaluateAll((rows) =>
      rows.map((row) => {
        const text = row.textContent ?? "";
        const n = (word: string) => Number(new RegExp(`(\\d+) ${word}`).exec(text)?.[1] ?? 0);
        return n("like") + n("comment");
      }),
    );

test("Popular: homes by their likes and comments, most first; a home opens full screen in that order; people the same way, in public only", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const pop = await signUpBuyer(browser, `pop.${stamp}@example.com`, "Poppy");
  await pop.setViewportSize({ width: 1280, height: 900 });

  // Poppy likes a home in public and says something about it.
  await pop.goto("/homes/SAMPLE-1009");
  const home = homeIn(pop, QUILLAN);
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  const chat = await openComments(pop, home);
  await chat.getByLabel("Add a comment").fill(`Popular ${stamp}: that porch.`);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // Someone's client, on her agent's link and nowhere else, likes it too.
  const agent = await signInAgent(browser, `pop.agent.${stamp}@example.com`, "Ag Popular");
  const { url } = await createShare(agent, ["1204 Quillan"], ["Privvy"]);
  const client = await (await browser.newContext()).newPage();
  await client.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await client.goto(url);
  await heartOf(homeIn(client, QUILLAN)).click();
  await joinAs(client, "Privvy", `privvy.${stamp}@example.com`);
  await expect(heartOf(homeIn(client, QUILLAN))).toHaveAttribute("aria-pressed", "true");

  // Popular is in the bar, and it's a page of its own.
  await pop.goto("/");
  const bar = pop.getByRole("banner");
  await bar.getByRole("link", { name: "Popular", exact: true }).click();
  await pop.waitForURL(/\/popular$/);
  await expect(pop).toHaveTitle("Popular · Porchcard");
  await expect(pop.getByRole("heading", { level: 1 })).toHaveText("Popular");
  await expect(bar.getByRole("link", { name: "Popular", exact: true })).toHaveAttribute("aria-current", "page");
  // Three times to look over, one of them on.
  const over = pop.getByRole("group", { name: "Over" });
  await expect(over.getByRole("link")).toHaveText(["This week", "This month", "All time"]);
  await expect(over.locator("[aria-current]")).toHaveCount(1);

  // This week: the home she liked is on it, with its likes (hers, and the
  // client's as a number) and what she said; and the list runs from the most
  // to the least.
  await over.getByRole("link", { name: "This week" }).click();
  await pop.waitForURL(/\/popular\?period=week$/);
  await expect(over.getByRole("link", { name: "This week" })).toHaveAttribute("aria-current", "true");
  const homes = pop.getByRole("list", { name: "Popular homes" });
  const row = homes.getByRole("listitem").filter({ hasText: QUILLAN });
  await expect(row).toHaveCount(1);
  const text = (await row.textContent())!;
  expect(Number(/(\d+) likes?/.exec(text)![1])).toBeGreaterThanOrEqual(2);
  expect(Number(/(\d+) comments?/.exec(text)![1])).toBeGreaterThanOrEqual(1);
  // (A pass is never counted, and the client is never named.)
  await expect(homes).not.toContainText("Privvy");
  await expect(homes).not.toContainText(/pass/i);
  const homeScores = await scores(pop, "Popular homes");
  expect(homeScores.length).toBeGreaterThan(0);
  expect(homeScores).toEqual([...homeScores].sort((a, b) => b - a));
  expect(homeScores.at(-1)).toBeGreaterThan(0);
  expect(homeScores.length).toBeLessThanOrEqual(25);
  // (A nothing is never said: no "0 likes", no "0 comments".)
  await expect(homes).not.toContainText(/\b0 (likes|comments)\b/);
  // Each row is one link, a fingertip tall, and nothing runs off a phone's side.
  await pop.setViewportSize({ width: 390, height: 844 });
  expect((await row.getByRole("link").boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await pop.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await pop.setViewportSize({ width: 1280, height: 900 });

  // A home opens full screen over the list, and the homes go on in its order.
  const order = await homes.getByRole("link").evaluateAll((links) =>
    links.map((link) => new URL((link as HTMLAnchorElement).href).searchParams.get("home")),
  );
  await homes.getByRole("link").first().click();
  await pop.waitForURL(/\/reel\?from=popular%3Aweek&home=/);
  const stage = pop.getByRole("dialog", { name: "Homes" });
  await expect(stage.locator("article[data-home]").first()).toHaveAttribute("data-home", order[0]!);
  if (order.length > 1) {
    await expect(stage.locator("article[data-home]").nth(1)).toHaveAttribute("data-home", order[1]!);
  }
  await pop.keyboard.press("Escape");
  await expect(stage).toHaveCount(0);

  // People, a tap away, over the same time: Poppy is on it as herself, with
  // what she did, and no Follow beside her own name.
  await pop.getByRole("group", { name: "Popular" }).getByRole("link", { name: "People" }).click();
  await pop.waitForURL(/\/popular\/people\?period=week$/);
  await expect(pop).toHaveTitle("Popular people · Porchcard");
  const people = pop.getByRole("list", { name: "Popular people" });
  const me = people.getByRole("listitem").filter({ hasText: "Poppy (you)" });
  await expect(me).toHaveCount(1);
  await expect(me).toContainText("1 like · 1 comment");
  await expect(me.getByRole("button")).toHaveCount(0);
  const peopleScores = await scores(pop, "Popular people");
  expect(peopleScores).toEqual([...peopleScores].sort((a, b) => b - a));
  expect(peopleScores.at(-1)).toBeGreaterThan(0);
  // [P] The client, who has only ever been on her agent's link, isn't listed:
  // not this week, and not for all time.
  await expect(people).not.toContainText("Privvy");
  await pop.goto("/popular/people?period=all");
  await expect(pop.getByRole("list", { name: "Popular people" })).not.toContainText("Privvy");
  await expect(pop.getByRole("list", { name: "Popular people" })).toContainText("Poppy (you)");
  // Someone else on it can be followed right there.
  const other = pop.getByRole("list", { name: "Popular people" }).getByRole("listitem").filter({ hasNotText: "(you)" }).first();
  if ((await other.count()) > 0) await expect(other.getByRole("button", { name: /^Follow / })).toBeVisible();

  // Signed out: the homes are there for anyone, with no People half; the
  // people ask you to sign in.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/popular?period=all");
  await expect(guest.getByRole("list", { name: "Popular homes" }).getByRole("listitem").first()).toBeVisible();
  await expect(guest.getByRole("group", { name: "Popular" }).getByRole("link")).toHaveText(["Homes", "Agents"]);
  await guest.goto("/popular/people");
  await expect(guest).toHaveURL(/\/login\?next=/);
  await guest.context().close();
});

test("Popular's agents: by the listings that are their own, for sale and closed; for anyone", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const agent = await signInAgent(browser, `lister.${stamp}@example.com`, "Lena Lister");
  // Two listings of her own.
  for (const street of ["1 Popular Ct", "2 Popular Ct"]) {
    await agent.goto("/dashboard/listings/new");
    const form = await enterListingYourself(agent);
    await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
    await form.getByLabel("Street address").fill(street);
    await form.getByLabel("City").fill("Kent");
    await form.getByLabel("ZIP").fill("98030");
    await form.getByLabel("Price", { exact: true }).fill("510000");
    await form.getByLabel("Beds").fill("4");
    await form.getByLabel("Baths").fill("2");
    await form.getByLabel("Sq ft", { exact: true }).fill("1900");
    await form.getByRole("button", { name: "Add listing" }).click();
    await agent.waitForURL(/\/dashboard\/listings$/);
  }

  // And one someone else listed, found and put on her page: it's on her
  // page, but it isn't hers, so it doesn't count.
  await agent.goto("/dashboard/listings/new");
  const find = agent.getByRole("region", { name: "Find it" });
  await find.getByRole("searchbox", { name: "Find it by address, city, ZIP or MLS number" }).fill("Quillan");
  await find.getByRole("button", { name: "Add 1204 Quillan St SE" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  await expect(agent.getByRole("list", { name: "Your listings" })).toContainText("1204 Quillan St SE");

  // Agents, beside Homes and People: no times to pick (listings are what she
  // has now), and she's on it, as herself, with how many.
  await agent.goto("/popular");
  await agent.getByRole("group", { name: "Popular" }).getByRole("link", { name: "Agents" }).click();
  await agent.waitForURL(/\/popular\/agents$/);
  await expect(agent).toHaveTitle("Popular agents · Porchcard");
  await expect(agent.getByRole("group", { name: "Popular" }).getByRole("link")).toHaveText(["Homes", "People", "Agents"]);
  await expect(agent.getByRole("group", { name: "Over" })).toHaveCount(0);
  const agents = agent.getByRole("list", { name: "Popular agents" });
  const me = agents.getByRole("listitem").filter({ hasText: "Lena Lister (you)" });
  await expect(me).toContainText("2 for sale");
  await expect(me.getByRole("button")).toHaveCount(0);
  // Her row goes to her listings.
  await expect(me.getByRole("link").last()).toHaveAttribute("href", /^\/people\/[\w-]+\?tab=listings$/);
  // Most listings first.
  const counts = await agents.getByRole("listitem").evaluateAll((rows) =>
    rows.map((row) => {
      const text = row.textContent ?? "";
      const n = (pattern: RegExp) => Number(pattern.exec(text)?.[1] ?? 0);
      return n(/(\d+) for sale/) + n(/(\d+) closed/);
    }),
  );
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  expect(counts.at(-1)).toBeGreaterThan(0);

  // Signed out: the same list, by name, with nothing to tap but her page.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/popular/agents");
  const hers = guest.getByRole("list", { name: "Popular agents" }).getByRole("listitem").filter({ hasText: "Lena Lister" });
  await expect(hers).toContainText("2 for sale");
  await expect(hers).not.toContainText("(you)");
  await expect(hers.getByRole("button")).toHaveCount(0);
  await guest.context().close();
});

test("Top, beside an agent's feed: the head of Popular, a tab apart, each line to its place and See all to its list", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "tara.top@example.com", "Tara Top");
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.goto("/");
  const rail = agent.getByRole("complementary", { name: "Beside your feed" });
  const top = rail.getByRole("region", { name: "Top", exact: true });
  await expect(top).toBeVisible();
  // What her clients do is in Notifications and Messages, not here.
  await expect(rail.getByRole("region", { name: /Client activity|People to follow/ })).toHaveCount(0);

  // Homes: each opens full screen in Popular's order; See all is Popular.
  const homesTab = top.getByRole("tab", { name: "Homes" });
  await homesTab.click();
  await expect(homesTab).toHaveAttribute("aria-selected", "true");
  const homes = top.getByRole("list", { name: "Top homes" });
  await expect(homes.getByRole("link").first()).toHaveAttribute("href", /^\/reel\?from=popular%3A(week|month|all)&home=/);
  await expect(top.getByRole("link", { name: "See all top homes" })).toHaveAttribute(
    "href",
    /^\/popular\?period=(week|month|all)$/,
  );
  // Once picked it stays put: it no longer turns by itself.
  await agent.waitForTimeout(9_000);
  await expect(homesTab).toHaveAttribute("aria-selected", "true");
  // Arrow keys go along the tabs, and See all follows.
  await homesTab.focus();
  await agent.keyboard.press("ArrowRight");
  await expect(homesTab).toHaveAttribute("aria-selected", "false");
  await expect(top.getByRole("link", { name: /^See all top (people|agents)$/ })).toBeVisible();
  await agent.context().close();
});
