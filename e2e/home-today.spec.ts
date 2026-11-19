import { expect, test, type Locator, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer } from "./helpers";

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

test("an agent's home is calm: their clients near the top, whoever is waiting with Reply right there; then the feed and homes, as anyone has; and what a client did is on her own page", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "tess-today@example.com", "Tess Today");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Kit"]);

  // Kit likes a home on her link and asks something about it.
  const kit = await (await browser.newContext()).newPage();
  await kit.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await kit.goto(url);
  const quillan = homeIn(kit, "1204 Quillan St SE");
  await heartOf(quillan).click();
  await joinAs(kit, "Kit", "kit.today@example.com");
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
  const chat = await openComments(kit, quillan);
  await chat.getByLabel("Add a comment").fill("Does it get afternoon sun?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");

  // On a phone: the box to send homes, then her, with what she said, near
  // the top; nothing wider than the screen; and no list of things to do.
  await agent.setViewportSize({ width: 390, height: 844 });
  await agent.goto("/");
  await expect(agent.getByRole("link", { name: "Send homes to a client" })).toHaveAttribute("href", "/dashboard/new");
  const clients = agent.getByRole("region", { name: "Your clients" });
  const kitThere = clients.getByRole("link", { name: /^Kit\b/ });
  await expect(kitThere).toContainText("“Does it get afternoon sun?”");
  expect((await kitThere.boundingBox())!.y).toBeLessThan(400);
  expect(await agent.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(agent.getByRole("region", { name: "Needs you" })).toHaveCount(0);
  await expect(agent.getByRole("button", { name: "Mark done" })).toHaveCount(0);
  // Who's waiting is said once, in the card; Reply is a fingertip tall, beside her.
  await expect(clients).toContainText("1 waiting");
  const replyTo = clients.getByRole("button", { name: "Reply to Kit" });
  expect((await replyTo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // No stream of her photos on Home: that's on her own page now.
  await expect(agent.getByRole("heading", { name: "Client activity" })).toHaveCount(0);
  await expect(agent.getByRole("listitem").filter({ hasText: "Does it get afternoon sun?" })).toHaveCount(1);
  await expect(agent.getByRole("region", { name: "Waiting for you" })).toHaveCount(0);
  // Under her clients, on the same phone: the pills, then homes.
  const lenses = agent.getByRole("group", { name: "Show" });
  const picked = agent.getByRole("region", { name: "Homes for you" });
  const top = async (part: Locator) => (await part.boundingBox())!.y;
  expect(await top(clients)).toBeLessThan(await top(lenses));
  expect(await top(lenses)).toBeLessThan(await top(picked));

  // On a desktop: them down the left, with only the places the bar doesn't
  // have; their clients once, in the middle; and what a buyer's home has.
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.reload();
  const you = agent.getByRole("complementary", { name: "Your profile" });
  await expect(you.getByRole("link", { name: "Tess Today" })).toHaveAttribute("href", /^\/people\/[\w-]+$/);
  await expect(you.getByRole("link", { name: /^Clients/ }).first()).toHaveAttribute("href", "/dashboard");
  await expect(you.getByRole("navigation", { name: "Your places" }).getByRole("link")).toHaveText([
    "Listings",
    "Saved homes",
    "Find people",
  ]);
  await expect(you.getByRole("link", { name: "Browse homes" })).toHaveCount(0);
  await expect(agent.getByRole("region", { name: "Your clients" })).toHaveCount(1);
  await expect(
    agent.getByRole("complementary", { name: "Beside your feed" }).getByRole("region", { name: "Your clients" }),
  ).toHaveCount(0);
  await expect(clients.getByRole("link", { name: "See all clients", exact: true })).toHaveAttribute("href", "/dashboard");
  expect(await picked.getByRole("listitem").count()).toBeGreaterThanOrEqual(6);
  await expect(lenses.getByRole("button", { name: "Following" })).toBeVisible();

  // Reply, beside her name while she's waiting, opens the box under it,
  // ringed in amber. Once answered, it says so and goes on saying so; she
  // isn't waiting any more, and her line is how she's doing.
  await replyTo.click();
  const reply = clients.getByRole("textbox", { name: "Reply to Kit" });
  await expect(reply).toBeFocused();
  await expect(reply).toHaveClass(/ring-amber/);
  await reply.fill("Plenty: it faces west.");
  await clients.getByRole("button", { name: "Send", exact: true }).click();
  await expect(clients.getByRole("status")).toContainText("Sent to Kit");
  await expect(kitThere).toContainText("Liked 1 of 2 homes");
  await expect(replyTo).toHaveCount(0);
  await expect(clients).not.toContainText("waiting");
  await expect(reply).not.toHaveClass(/ring-amber/);
  await expect(clients.getByRole("status")).toContainText("Sent to Kit");
  await agent.reload();
  await expect(kitThere).toContainText("Liked 1 of 2 homes");
  await expect(clients.getByRole("textbox")).toHaveCount(0);

  // Her own page, from her name: her day as a card with the home's photo
  // large, what she said, the answer under it, and Reply for more.
  await agent.setViewportSize({ width: 390, height: 844 });
  await kitThere.click();
  await agent.waitForURL(/\/dashboard\/clients\//);
  const card = agent.getByRole("listitem").filter({ hasText: "Only you see this" }).filter({ hasText: "Does it get afternoon sun?" });
  await expect(card).toContainText("Kit");
  await expect(card.getByRole("img").first()).toBeVisible();
  expect((await card.getByRole("img").first().boundingBox())!.width).toBeGreaterThan(300);
  await expect(card.getByRole("list", { name: "Your replies" })).toContainText("Plenty: it faces west.");
  await expect(card.getByRole("textbox", { name: "Reply to Kit" })).not.toHaveClass(/ring-amber/);
  await expect(agent.getByRole("region", { name: "Waiting for you" })).toHaveCount(0);
});

test("a quiet day on an agent's home: first the one thing to do, send homes; then where their newest clients stand, the pills, and homes", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agent = await signInAgent(browser, "quinn-quiet@example.com", "Quinn Quiet");
  // Nothing sent yet: the card says what to do, with one filled button.
  await agent.goto("/");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Your home");
  const firstSend = agent.getByRole("region", { name: "Send your first homes" });
  const send = firstSend.getByRole("link", { name: "Send homes", exact: true });
  await expect(send).toHaveAttribute("href", "/dashboard/new");
  expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(agent.getByRole("region", { name: "Your clients" })).toHaveCount(0);
  // Never an empty page: the pills and homes are there from the first day.
  const lenses = agent.getByRole("group", { name: "Show" });
  const picked = agent.getByRole("region", { name: "Homes for you" });
  await expect(lenses.getByRole("button", { name: "For you" })).toHaveAttribute("aria-pressed", "true");
  expect(await picked.getByRole("listitem").count()).toBeGreaterThanOrEqual(6);

  // Four clients, none of whom has opened anything.
  for (const name of ["Ansel", "Blythe", "Cosmo", "Delphine"]) await createShare(agent, ["1204 Quillan"], [name]);
  await agent.goto("/");
  await expect(firstSend).toHaveCount(0);
  const clients = agent.getByRole("region", { name: "Your clients" });
  // Three of them, the newest first, each with where they stand; all four a tap away.
  const rows = clients.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Delphine");
  await expect(rows.nth(1)).toContainText("Cosmo");
  await expect(rows.nth(2)).toContainText("Blythe");
  for (const row of await rows.all()) await expect(row).toContainText("Not opened yet · sent today");
  // Nobody is waiting: no count of them, and no Reply.
  await expect(clients).not.toContainText("waiting");
  await expect(clients.getByRole("button")).toHaveCount(0);
  await expect(clients.getByRole("link", { name: "See all clients", exact: true })).toHaveAttribute("href", "/dashboard");
  // Then the pills, then at least six homes.
  const top = async (part: Locator) => (await part.boundingBox())!.y;
  expect(await top(clients)).toBeLessThan(await top(lenses));
  expect(await top(lenses)).toBeLessThan(await top(picked));
  expect(await picked.getByRole("listitem").count()).toBeGreaterThanOrEqual(6);
  await expect(picked.getByRole("link", { name: "Browse homes" })).toHaveAttribute("href", "/browse");
});

test("everyone who's waiting shows on an agent's home, past the usual three; one answered stays put, still saying it was sent, until the page is left", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const agent = await signInAgent(browser, "wren-waiting@example.com", "Wren Waiting");
  // Four clients, each on a link of their own, each asking something.
  const asked = ["Odalys", "Percival", "Quenby", "Rosalind"];
  for (const name of asked) {
    const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], [name]);
    const page = await (await browser.newContext()).newPage();
    await page.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
    await page.goto(url);
    const quillan = homeIn(page, "1204 Quillan St SE");
    await heartOf(quillan).click();
    await joinAs(page, name, `${name.toLowerCase()}.waiting@example.com`);
    await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
    const chat = await openComments(page, quillan);
    await chat.getByLabel("Add a comment").fill(`${name} here: is it still for sale?`);
    await chat.getByRole("button", { name: "Post", exact: true }).click();
    await expect(chat.getByLabel("Add a comment")).toHaveValue("");
    await page.context().close();
  }
  // And one more, sent homes since, who hasn't opened them.
  await createShare(agent, ["1204 Quillan"], ["Sunniva"]);

  // All four who are waiting, whoever asked last first; not the one who isn't.
  await agent.goto("/");
  const clients = agent.getByRole("region", { name: "Your clients" });
  const rows = clients.getByRole("listitem");
  await expect(clients).toContainText("4 waiting");
  await expect(rows).toHaveCount(4);
  for (const [i, name] of [...asked].reverse().entries()) await expect(rows.nth(i)).toContainText(name);
  await expect(clients.getByRole("button", { name: /^Reply to / })).toHaveCount(4);
  await expect(clients).not.toContainText("Sunniva");
  expect(await agent.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    agent.viewportSize()!.width,
  );

  // The last of them, answered: three are waiting now, and her row is where
  // it was, saying it was sent, though she'd no longer be among the first three.
  const hers = rows.filter({ hasText: "Odalys" });
  await hers.getByRole("button", { name: "Reply to Odalys" }).click();
  const box = hers.getByRole("textbox", { name: "Reply to Odalys" });
  await expect(box).toBeFocused();
  await box.fill("It is. Want to see it Saturday?");
  await box.press("Enter");
  await expect(hers.getByRole("status")).toContainText("Sent to Odalys");
  await expect(clients).toContainText("3 waiting");
  await expect(hers).toContainText("Liked 1 of 2 homes");
  await expect(hers.getByRole("button", { name: "Reply to Odalys" })).toHaveCount(0);
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toContainText("Odalys");
  await expect(hers.getByRole("status")).toContainText("Sent to Odalys");
  // The others' boxes were never opened: one box, hers.
  await expect(clients.getByRole("textbox")).toHaveCount(1);

  // Next time, it's whoever is waiting: three of them.
  await agent.reload();
  await expect(clients).toContainText("3 waiting");
  await expect(rows).toHaveCount(3);
  await expect(clients).not.toContainText("Odalys");
  await expect(clients.getByRole("button", { name: /^Reply to / })).toHaveCount(3);
});

test("homes for you are never fewer than six, however many the people you follow have liked", async ({ browser }) => {
  test.setTimeout(150_000);
  // Hesper likes eight of the thirteen homes in public. (Not SAMPLE-1006:
  // e2e/public.spec.ts, which runs after this in the same database, counts
  // that home's likes.)
  const hesper = await signUpBuyer(browser, "hesper-today@example.com", "Hesper Today");
  for (const n of [1001, 1002, 1003, 1004, 1005, 1007, 1008, 1009]) {
    await hesper.goto(`/homes/SAMPLE-${n}`);
    const heart = heartOf(hesper.getByRole("article").first());
    await Promise.all([saved(hesper), heart.click()]);
    await expect(heart).toHaveAttribute("aria-pressed", "true");
  }
  await hesper.goto("/people/me");
  await hesper.waitForURL(/\/people\/[\w-]+$/);
  const hesperPage = new URL(hesper.url()).pathname;

  // Ivo follows her: all eight are in his feed, which leaves five to pick from.
  const ivo = await signUpBuyer(browser, "ivo-today@example.com", "Ivo Today");
  await ivo.goto(hesperPage);
  await Promise.all([saved(ivo), ivo.getByRole("button", { name: "Follow Hesper" }).click()]);
  await expect(ivo.getByRole("button", { name: "Following Hesper" })).toHaveAttribute("aria-pressed", "true");
  await ivo.goto("/?lens=following");
  await expect(ivo.getByRole("region", { name: "What's new" }).getByRole("listitem").first()).toContainText("Hesper");
  // Still six homes for him, each once.
  const pins = ivo.getByRole("region", { name: "Homes for you" }).getByRole("listitem").getByRole("link");
  expect(await pins.count()).toBeGreaterThanOrEqual(6);
  const hrefs = await pins.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  // And the first opens them full screen, as before.
  await pins.first().click();
  await ivo.waitForURL(/\/reel\?from=picks&home=SAMPLE-/);
  await expect(ivo.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
});

test("someone who follows nobody yet starts on homes picked for them, with people to follow over them on a phone; Following waits a tap away, with the way to find people", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const page = await signUpBuyer(browser, "una-today@example.com", "Una Today");
  // Someone follows her already, so there's someone to offer her.
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  const unaPage = new URL(page.url()).pathname;
  const ottoline = await signUpBuyer(browser, "ottoline-today@example.com", "Ottoline Today");
  await ottoline.goto(unaPage);
  await ottoline.getByRole("button", { name: "Follow Una" }).click();
  await expect(ottoline.getByRole("button", { name: "Following Una" })).toHaveAttribute("aria-pressed", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, Una");
  const lenses = page.getByRole("group", { name: "Show" });
  await expect(lenses.getByRole("button", { name: "For you" })).toHaveAttribute("aria-pressed", "true");
  await expect(lenses.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "false");
  const picks = page.getByRole("region", { name: "Homes for you" });
  await expect(picks.getByRole("listitem").first().getByRole("link")).toHaveAttribute(
    "href",
    /^\/reel\?from=picks&home=SAMPLE-\d+$/,
  );
  await expect(picks.getByRole("link", { name: "Browse homes" })).toHaveAttribute("href", "/browse");
  // On a phone there's no rail beside the feed: people to follow are in the
  // middle, once, under the pills and above the homes picked for her. Whoever
  // follows her is first, and it says so.
  const people = page.getByRole("region", { name: "People to follow" });
  await expect(people).toHaveCount(1);
  await expect(people.getByRole("listitem").first()).toContainText("Ottoline");
  await expect(people.getByRole("listitem").first()).toContainText("Follows you");
  expect(await people.getByRole("listitem").count()).toBeLessThanOrEqual(3);
  await expect(people.getByRole("link", { name: "See all people to follow", exact: true })).toHaveAttribute(
    "href",
    "/search/people",
  );
  const top = async (part: Locator) => (await part.boundingBox())!.y;
  expect(await top(people)).toBeGreaterThan(await top(lenses));
  expect(await top(people)).toBeLessThan(await top(picks));
  // Following: nobody yet, and what to do about it: one button, to people.
  await lenses.getByRole("button", { name: "Following" }).click();
  const stream = page.getByRole("region", { name: "What's new" });
  await expect(stream.getByText("Follow people to see what they like.")).toBeVisible();
  const find = stream.getByRole("link", { name: "Find people", exact: true });
  await expect(find).toHaveAttribute("href", "/search/people");
  expect((await find.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // The people to follow are still there, under it.
  await expect(people).toHaveCount(1);
  expect(await top(people)).toBeGreaterThan(await top(find));
  expect(await top(people)).toBeLessThan(await top(picks));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
