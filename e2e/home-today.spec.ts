import { expect, test, type Locator } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer } from "./helpers";

test("an agent's home is calm: their clients near the top, whoever is waiting with Reply right there; then the feed, Following or Clients; and what a client did is on her own page", async ({
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
  // Under her clients, on the same phone: two ways to look at the feed, and
  // it opens on Following. No homes picked for her.
  const lenses = agent.getByRole("group", { name: "Show" });
  const top = async (part: Locator) => (await part.boundingBox())!.y;
  expect(await top(clients)).toBeLessThan(await top(lenses));
  await expect(lenses.getByRole("button")).toHaveText(["Following", "Clients"]);
  await expect(lenses.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
  await expect(agent.getByRole("region", { name: "Homes for you" })).toHaveCount(0);

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

  // Clients, beside Following: everything her clients did on the homes she
  // sent, what Kit asked and her answer among it.
  const stream = agent.getByRole("region", { name: "What's new" });
  await expect(stream.getByText("Does it get afternoon sun?").filter({ visible: true })).toHaveCount(0);
  await lenses.getByRole("button", { name: "Clients" }).click();
  await expect(lenses.getByRole("button", { name: "Clients" })).toHaveAttribute("aria-pressed", "true");
  await expect(stream.getByText("Does it get afternoon sun?").filter({ visible: true })).toHaveCount(1);
  await expect(stream.getByRole("list", { name: "Your replies" })).toContainText("Plenty: it faces west.");

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

test("a quiet day on an agent's home: first the one thing to do, send homes; then where their newest clients stand, and the pills", async ({
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
  // The pills are there from the first day, on Following; and following
  // nobody yet, it says what to do about that.
  const lenses = agent.getByRole("group", { name: "Show" });
  await expect(lenses.getByRole("button", { name: "Following" })).toHaveAttribute("aria-pressed", "true");
  const stream = agent.getByRole("region", { name: "What's new" });
  await expect(stream.getByRole("link", { name: "Find people", exact: true })).toHaveAttribute("href", "/search/people");
  await expect(stream.getByRole("link", { name: "Search homes", exact: true })).toHaveAttribute("href", "/search");
  await expect(agent.getByRole("region", { name: "Homes for you" })).toHaveCount(0);

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
  // Then the pills.
  const top = async (part: Locator) => (await part.boundingBox())!.y;
  expect(await top(clients)).toBeLessThan(await top(lenses));
  // None of the four has signed up, so none has a profile to go to: on the
  // Clients page they're as they were, by the name she gave them.
  await agent.goto("/dashboard");
  await expect(agent.getByRole("main").getByRole("heading", { name: "Delphine", exact: true })).toBeVisible();
  await expect(agent.getByRole("link", { name: /^View profile/ })).toHaveCount(0);
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

test("someone who follows nobody yet: one feed, no homes picked for them; what to do about it, with people to follow under it on a phone", async ({
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
  // One feed: nothing to choose between, and no homes picked for her.
  await expect(page.getByRole("group", { name: "Show" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Homes for you" })).toHaveCount(0);
  // Nobody followed yet, and what to do about it: people, or homes.
  const stream = page.getByRole("region", { name: "What's new" });
  await expect(stream.getByText("Follow people to see what they like.")).toBeVisible();
  const find = stream.getByRole("link", { name: "Find people", exact: true });
  await expect(find).toHaveAttribute("href", "/search/people");
  expect((await find.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(stream.getByRole("link", { name: "Search homes", exact: true })).toHaveAttribute("href", "/search");
  // On a phone there's no rail beside the feed: people to follow are in the
  // middle, once, under it. Whoever follows her is first, and it says so.
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
  expect(await top(people)).toBeGreaterThan(await top(find));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
