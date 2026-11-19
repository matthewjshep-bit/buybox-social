import { expect, test, type Locator, type Page } from "@playwright/test";
import { createShare, detailsForm, heartOf, homeIn, joinAs, saveDetails, signInAgent, signUpBuyer, toDetails } from "./helpers";

// Search's other side: people, by name. (The names here are unusual on
// purpose: every test shares one database, and a name finds anyone with it.)

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

// The Name box on Find people: a name typed, and searched for.
async function lookFor(page: Page, name: string) {
  const form = page.getByRole("search", { name: "Find people" });
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/search/people" && url.searchParams.get("q") === name);
}

const found = (page: Page) => page.getByRole("main").getByRole("listitem");

// Someone's own page, from wherever they are.
async function pageOf(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  return new URL(page.url()).pathname;
}

test("people in Search: a buyer by first name only, an agent by name or company, never by an email, and only signed in", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  // Wren has only just signed up: nothing liked, nobody followed.
  const wren = await signUpBuyer(browser, "wren.search@example.com", "Wren Looker");
  const wrenPage = await pageOf(wren);
  // Quillon, a buyer, follows her. Xanthippe, another, signed up and has done
  // nothing at all, not even opened her own page. Orla is an agent, whose
  // company is her own.
  const quillon = await signUpBuyer(browser, "quillon.search@example.com", "Quillon Zephyrine");
  await quillon.goto(wrenPage);
  await Promise.all([saved(quillon), quillon.getByRole("button", { name: "Follow Wren" }).click()]);
  await expect(quillon.getByRole("button", { name: "Following Wren" })).toHaveAttribute("aria-pressed", "true");
  const quillonPage = await pageOf(quillon);
  await (await signUpBuyer(browser, "xanthippe.search@example.com", "Xanthippe Idler")).context().close();
  const orla = await signInAgent(browser, "orla.search@example.com", "Orla Vantongeren");
  await toDetails(orla);
  await detailsForm(orla).getByLabel("Company (optional)").fill("Zinnwald & Thrush Homes");
  await saveDetails(orla);

  await wren.goto("/search");
  await expect(wren).toHaveTitle("Search homes · Porchcard");
  // Search is homes or people, a tap apart, and the filters are still the homes'.
  const which = wren.getByRole("search", { name: "Filter homes" }).getByRole("group", { name: "Search for" });
  await expect(which.getByRole("link", { name: "Homes", exact: true })).toHaveAttribute("aria-current", "page");
  for (const name of ["Homes", "People"]) {
    const box = (await which.getByRole("link", { name, exact: true }).boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.width, name).toBeGreaterThanOrEqual(44);
  }
  await which.getByRole("link", { name: "People", exact: true }).click();
  await wren.waitForURL((url) => url.pathname === "/search/people");
  await expect(wren).toHaveTitle("Find people · Porchcard");
  await expect(wren.getByRole("heading", { level: 1 })).toHaveText("Find people");
  const there = wren.getByRole("group", { name: "Search for" });
  await expect(there.getByRole("link", { name: "People", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(there.getByRole("link", { name: "Homes", exact: true })).toHaveAttribute("href", "/search");
  // Still Search, in the bar.
  await expect(wren.getByRole("banner").getByRole("link", { name: "Search", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );

  // Nothing typed: people to follow. Quillon follows her and she doesn't
  // follow him, so he's first, and it says why; by first name, with Follow.
  await expect(wren.getByRole("heading", { name: "People to follow" })).toBeVisible();
  const suggested = wren.getByRole("list", { name: "People to follow" });
  const first = suggested.getByRole("listitem").first();
  await expect(first.getByRole("link", { name: /^Quillon\b/ })).toHaveAttribute("href", quillonPage);
  await expect(first).toContainText("Follows you");
  await expect(first.getByRole("button", { name: "Follow Quillon" })).toHaveAttribute("aria-pressed", "false");
  // Never herself. (Her own page, not her name: another spec's Wren may be
  // in the same database, and is someone else.)
  await expect(suggested.locator(`a[href="${wrenPage}"]`)).toHaveCount(0);
  expect(await suggested.getByRole("listitem").count()).toBeLessThanOrEqual(12);

  // The start of his first name finds him: his face, his first name, Follow.
  // (Enough of it that it's his alone: other specs' Quill and Quinn may be
  // in the same database.)
  await lookFor(wren, "Quillo");
  const results = wren.getByRole("list", { name: "People matching “Quillo”" });
  await expect(results.getByRole("listitem")).toHaveCount(1);
  await expect(results.getByRole("link", { name: /^Quillon\b/ })).toHaveAttribute("href", quillonPage);
  await expect(results).toContainText("Follows you");
  await expect(results).not.toContainText("Agent");
  // [P] Nothing private comes with him: not his email, not his last name.
  // (Her own email is in her own menu; nobody else's is anywhere.)
  for (const secret of ["quillon.search@example.com", "Zephyrine", "orla.search@example.com"]) {
    expect(await wren.content()).not.toContain(secret);
  }
  // Follow, right there; it's kept.
  await Promise.all([saved(wren), results.getByRole("button", { name: "Follow Quillon" }).click()]);
  await expect(results.getByRole("button", { name: "Following Quillon" })).toHaveAttribute("aria-pressed", "true");
  await wren.reload();
  await expect(results.getByRole("button", { name: "Following Quillon" })).toHaveAttribute("aria-pressed", "true");
  // Followed, he's no longer someone to follow.
  await wren.goto("/search/people");
  await expect(wren.getByRole("heading", { level: 1 })).toHaveText("Find people");
  await expect(wren.getByRole("main").getByRole("link", { name: /^Quillon\b/ })).toHaveCount(0);
  // The box is a fingertip tall, and nothing runs off the side of a phone.
  expect((await wren.getByLabel("Name", { exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await wren.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(wren.viewportSize()!.width);

  // Any case; but never his surname, in part or whole, nor a middle of his name.
  await lookFor(wren, "quILLO");
  await expect(found(wren)).toHaveCount(1);
  // Someone who signed up and did nothing more is found too: everyone with a
  // name has a page from the moment they sign in.
  await lookFor(wren, "Xanth");
  await expect(found(wren)).toHaveCount(1);
  await expect(found(wren).getByRole("link", { name: "Xanthippe", exact: true })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
  expect(await wren.content()).not.toContain("Idler");
  for (const name of ["Zephyrine", "Zeph", "Quillon Zephyrine", "illon"]) {
    await lookFor(wren, name);
    await expect(wren.getByRole("main")).toContainText("No one by that name.");
    await expect(found(wren)).toHaveCount(0);
  }

  // An agent, by her surname or a word of her company: her whole name,
  // "Agent" and the company, as her own page gives them.
  for (const name of ["Vantong", "orla van", "Zinnwald", "thrush"]) {
    await lookFor(wren, name);
    const row = found(wren).filter({ hasText: "Orla Vantongeren" });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("link", { name: /^Orla Vantongeren\b/ })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
    await expect(row).toContainText("Agent");
    await expect(row).toContainText("Zinnwald & Thrush Homes");
    await expect(row.getByRole("button", { name: "Follow Orla Vantongeren" })).toBeVisible();
    expect(await wren.content()).not.toContain("orla.search@example.com");
  }

  // An email finds nobody, whoever's it is, and one letter isn't enough.
  for (const email of ["quillon.search@example.com", "orla.search@example.com", "nobody@example.com", "@"]) {
    await lookFor(wren, email);
    await expect(wren.getByRole("main")).toContainText("Search by name, not email.");
    await expect(found(wren)).toHaveCount(0);
  }
  await lookFor(wren, "Q");
  await expect(wren.getByRole("main")).toContainText("Type at least two letters.");
  await expect(found(wren)).toHaveCount(0);
  // Nor a number, nor a wildcard.
  for (const name of ["12345", "%%", "__"]) {
    await lookFor(wren, name);
    await expect(found(wren)).toHaveCount(0);
  }

  // A name that finds no homes on the map is one tap from the people by it.
  await wren.goto("/search?q=Quillon");
  await expect(wren.getByText("No homes match “Quillon”.").filter({ visible: true })).toHaveCount(1);
  await wren.getByRole("link", { name: "Search people for “Quillon”" }).filter({ visible: true }).click();
  await wren.waitForURL((url) => url.pathname === "/search/people" && url.searchParams.get("q") === "Quillon");
  await expect(found(wren)).toHaveCount(1);
  await expect(wren.getByLabel("Name", { exact: true })).toHaveValue("Quillon");

  // Orla finds Quillon too (an agent looks people up the same way), and
  // he's no client of hers.
  await orla.goto("/search/people?q=Quillo");
  await expect(found(orla).getByRole("link", { name: "Quillon", exact: true })).toBeVisible();
  await expect(orla.getByRole("banner").getByRole("link", { name: "Search", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(found(orla)).not.toContainText("Your client");

  // Signed out, there are no people to search: sign in, then back here. And
  // Search is only the homes.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto("/search/people?q=Qui");
  await expect(guest).toHaveURL(/\/login\?next=(\/|%2F)search(\/|%2F)people$/);
  await expect(guest.locator("body")).not.toContainText("Quillon");
  await guest.goto("/search?q=Quillon");
  await expect(guest.getByText("No homes match “Quillon”.").filter({ visible: true })).toHaveCount(1);
  await expect(guest.getByRole("group", { name: "Search for" })).toHaveCount(0);
  await expect(guest.getByRole("link", { name: /^Search people for/ })).toHaveCount(0);
});

test("an agent's client isn't found by anyone else until they like something in public; their agent finds them, as their client", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  // (Halvard, a home other specs like already: others must stay quiet for them.)
  const HALVARD = "10421 Halvard Way NE";
  // Ysolde signs up right on the link Reva sent her, to like a home on it:
  // all she has done is between her and Reva.
  const reva = await signInAgent(browser, "reva.search@example.com", "Reva Ullswater");
  const { url } = await createShare(reva, ["1204 Quillan", "719 Saltmarsh"], ["Ysolde"]);
  const ysolde = await (await browser.newContext()).newPage();
  await ysolde.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await ysolde.goto(url);
  const quillan = homeIn(ysolde, "1204 Quillan St SE");
  await heartOf(quillan).click();
  await joinAs(ysolde, "Ysolde", "ysolde.search@example.com");
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");

  // A stranger doesn't find her, and she's not offered to them to follow.
  const tamsin = await signUpBuyer(browser, "tamsin.search@example.com", "Tamsin Looker");
  await tamsin.goto("/search/people?q=Yso");
  await expect(tamsin.getByRole("main")).toContainText("No one by that name.");
  await expect(found(tamsin)).toHaveCount(0);
  await tamsin.goto("/search/people");
  await expect(tamsin.getByRole("main")).not.toContainText("Ysolde");
  // Nor does another agent.
  const other = await signInAgent(browser, "odile.search@example.com", "Odile Ullapool");
  await other.goto("/search/people?q=Yso");
  await expect(found(other)).toHaveCount(0);

  // Reva does: her own client, and the page says so, to her alone.
  await reva.goto("/search/people?q=Yso");
  const hers = found(reva).filter({ hasText: "Ysolde" });
  await expect(hers).toHaveCount(1);
  await expect(hers).toContainText("Your client");
  await expect(hers.getByRole("button", { name: "Following Ysolde" })).toHaveAttribute("aria-pressed", "true");
  expect(await reva.content()).not.toContain("ysolde.search@example.com");

  // And Ysolde finds Reva, her agent, whom she follows from the link.
  await ysolde.goto("/search/people?q=Ullsw");
  const agent = found(ysolde).filter({ hasText: "Reva Ullswater" });
  await expect(agent).toContainText("Agent");
  await expect(agent.getByRole("button", { name: "Following Reva Ullswater" })).toHaveAttribute("aria-pressed", "true");

  // She likes a home in public: now she's someone on Porchcard, and anyone
  // finds her, by her first name. That she's Reva's client is still only Reva's to see.
  await ysolde.goto("/homes/SAMPLE-1005");
  await Promise.all([saved(ysolde), heartOf(homeIn(ysolde, HALVARD)).click()]);
  await expect(heartOf(homeIn(ysolde, HALVARD))).toHaveAttribute("aria-pressed", "true");
  for (const page of [tamsin, other]) {
    await page.goto("/search/people?q=Yso");
    const row = found(page).filter({ hasText: "Ysolde" });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("link", { name: "Ysolde", exact: true })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
    await expect(page.getByRole("main")).not.toContainText(/Your client|Reva/);
    expect(await page.content()).not.toContain("ysolde.search@example.com");
  }
  await reva.reload();
  await expect(hers).toContainText("Your client");
});

test("people to follow on a buyer's home: whoever follows them first, with why; Follow right there; See all; and on a phone, in the feed after what's new", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  // (Halvard, as above: a home other specs like already.)
  const HALVARD = "10421 Halvard Way NE";
  const thisbe = await signUpBuyer(browser, "thisbe.home@example.com", "Thisbe Looker");
  const thisbePage = await pageOf(thisbe);
  // Ignatius likes a home in public and follows her; Leocadia only follows her.
  const ignatius = await signUpBuyer(browser, "ignatius.home@example.com", "Ignatius Farrowdale");
  await ignatius.goto("/homes/SAMPLE-1005");
  await Promise.all([saved(ignatius), heartOf(homeIn(ignatius, HALVARD)).click()]);
  await expect(heartOf(homeIn(ignatius, HALVARD))).toHaveAttribute("aria-pressed", "true");
  const ignatiusPage = await pageOf(ignatius);
  const leocadia = await signUpBuyer(browser, "leocadia.home@example.com", "Leocadia Marshgrove");
  for (const follower of [ignatius, leocadia]) {
    await follower.goto(thisbePage);
    await Promise.all([saved(follower), follower.getByRole("button", { name: "Follow Thisbe" }).click()]);
    await expect(follower.getByRole("button", { name: "Following Thisbe" })).toHaveAttribute("aria-pressed", "true");
  }

  // On a wide screen: one card beside her feed, "People to follow". Three at
  // most; the two who follow her first (the busier of them before the other),
  // each saying why, by first name, with a quiet Follow a fingertip tall.
  await thisbe.setViewportSize({ width: 1280, height: 900 });
  await thisbe.goto("/");
  const beside = thisbe.getByRole("complementary", { name: "Beside your feed" });
  const card = beside.getByRole("region", { name: "People to follow" });
  await expect(thisbe.getByRole("region", { name: "People to follow" })).toHaveCount(1);
  const rows = card.getByRole("listitem");
  expect(await rows.count()).toBeLessThanOrEqual(3);
  await expect(rows.nth(0).getByRole("link", { name: /^Ignatius\b/ })).toHaveAttribute("href", ignatiusPage);
  await expect(rows.nth(0)).toContainText("Follows you");
  await expect(rows.nth(1)).toContainText("Leocadia");
  await expect(rows.nth(1)).toContainText("Follows you");
  const follow = rows.nth(0).getByRole("button", { name: "Follow Ignatius" });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  expect((await follow.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await follow.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  // The old name for it is gone, and the feed doesn't open on a "Nothing new" line.
  await expect(thisbe.getByRole("main")).not.toContainText("People with your taste");
  await expect(thisbe.getByRole("note", { name: "Nothing new" })).toHaveCount(0);
  // [P] Nothing private comes with them: no surname, no email.
  for (const secret of ["Farrowdale", "Marshgrove", "ignatius.home@example.com", "leocadia.home@example.com"]) {
    expect(await thisbe.content()).not.toContain(secret);
  }

  // "See all" is everyone worth following, in Search.
  const all = card.getByRole("link", { name: "See all people to follow", exact: true });
  await expect(all).toHaveAttribute("href", "/search/people");
  expect((await all.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await all.click();
  await thisbe.waitForURL((url) => url.pathname === "/search/people");
  await expect(thisbe.getByRole("heading", { level: 1 })).toHaveText("Find people");
  await expect(thisbe.getByRole("list", { name: "People to follow" }).getByRole("listitem").first()).toContainText("Ignatius");

  // Follow, right on the card: it stays where it is, to undo. Next time,
  // he's not someone to follow any more, and Leocadia is first.
  await thisbe.goto("/");
  await Promise.all([saved(thisbe), follow.click()]);
  await expect(rows.nth(0).getByRole("button", { name: "Following Ignatius" })).toHaveAttribute("aria-pressed", "true");
  await thisbe.reload();
  await expect(card.getByRole("link", { name: /^Ignatius\b/ })).toHaveCount(0);
  await expect(rows.nth(0)).toContainText("Leocadia");

  // On a phone there's no rail: the same card is in her feed, once, straight
  // after where what's new ends, so a long feed doesn't bury it.
  await thisbe.setViewportSize({ width: 390, height: 844 });
  await thisbe.goto("/?lens=following");
  const feed = thisbe.getByRole("region", { name: "What's new" });
  await expect(feed.getByRole("listitem").filter({ hasText: HALVARD }).first()).toContainText("Ignatius");
  const caughtUp = feed.getByRole("note", { name: "You're all caught up" });
  await expect(caughtUp).toBeVisible();
  const inFeed = thisbe.getByRole("region", { name: "People to follow" });
  await expect(inFeed).toHaveCount(1);
  await expect(feed.getByRole("region", { name: "People to follow" })).toHaveCount(1);
  await expect(inFeed.getByRole("listitem").first()).toContainText("Leocadia");
  const top = async (part: Locator) => (await part.boundingBox())!.y;
  expect(await top(inFeed)).toBeGreaterThan(await top(caughtUp));
  await expect(inFeed.getByRole("link", { name: "See all people to follow", exact: true })).toBeVisible();
  expect(await thisbe.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
