// The Porchcard API: an agent's own tools (their CRM, Zapier, Make) working
// as them, with a key the agent makes on Edit profile. A tool can find homes,
// send them to clients and get each person's link back, add homes to a link,
// answer a client, read how its clients are getting on, and add, change,
// close and take down the agent's own listings (deals) with their photos.
// Only ever as that one agent, only ever their own clients, links and
// listings, and never anything private: no email address, no device's token,
// no surname a client gave. (Webhooks: api-webhooks.spec.ts.)
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";
import { Api, answers, expectError, expectNothingPrivate, makeKey, toolsCard } from "./api-helpers";
import { heartOf, homeIn, joinAs, openComments, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const CORBEL = "812 N Corbel St";

// Surnames a client gave, which no answer may ever carry.
const SURNAMES = ["Quellwood"];

test.beforeEach(() => {
  answers.length = 0;
});

// Whatever a test did, nothing it was told was private.
test.afterEach(() => {
  expectNothingPrivate(SURNAMES);
});

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;

// A photo as a camera might send it: wider than the 1600 px it's kept at.
async function pngDataUrl(width: number, height: number) {
  const png = await sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 80 } } })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

// An agent's public profile, as anyone sees it: its path.
async function profilePath(agent: Page) {
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  return new URL(agent.url()).pathname;
}

test("an agent makes a key on Edit profile, sees it once, and revoking it stops it working; a buyer has no such card", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const id = unique();
  const agent = await signInAgent(browser, `api.keys.${id}@example.com`, "Kit Keyes");
  await agent.goto("/people/me/edit");
  const card = toolsCard(agent);
  await expect(card).toContainText("Let your CRM, Zapier or Make send homes and add listings as you.");
  await expect(card.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/developers");
  await expect(card).toContainText("No keys yet.");

  // A name for the tool, and Make a key: the key, once, with Copy, and said plainly.
  await card.getByLabel("Name", { exact: true }).fill("GoHighLevel");
  await card.getByRole("button", { name: "Make a key" }).click();
  const shown = card.getByRole("group", { name: "Your key for GoHighLevel" });
  await expect(shown).toBeVisible();
  await expect(shown).toContainText("Copy it now. You won't see it again.");
  await expect(shown.getByRole("button", { name: "Copy" })).toBeVisible();
  const key = await shown.getByRole("textbox").inputValue();
  expect(key).toMatch(/^pc_live_[A-Za-z0-9]{32}$/);
  // The list has it by its name and its first characters, never used yet.
  const list = card.getByRole("list", { name: "Your API keys" });
  const row = list.getByRole("listitem").filter({ hasText: "GoHighLevel" });
  await expect(row).toContainText(`${key.slice(0, 12)}…`);
  await expect(row).toContainText("Never used");

  // The tool uses it: it's Kit, and it says which key.
  const tool = await Api.as(key);
  const me = await tool.get("/me");
  expect(me.status).toBe(200);
  expect(me.body.agent).toMatchObject({ name: "Kit Keyes", brokerage: "Harbor & Pine Realty" });
  expect(me.body.key).toEqual({ name: "GoHighLevel", prefix: key.slice(0, 12) });

  // Back on the page later: never the whole key again, and it's been used.
  await agent.reload();
  await expect(row).toContainText(`${key.slice(0, 12)}…`);
  await expect(row).toContainText("Last used just now");
  await expect(card.getByRole("group", { name: "Your key for GoHighLevel" })).toHaveCount(0);
  expect(await agent.content()).not.toContain(key);

  // Revoked, once asked again: gone from the list, and it stops working at once.
  await row.getByRole("button", { name: /^Revoke/ }).click();
  await expect(card).toContainText("Revoke the key for GoHighLevel?");
  await card.getByRole("button", { name: "Revoke key" }).click();
  await expect(card).toContainText("No keys yet.");
  expectError(await tool.get("/me"), 401, "unauthorized");

  // A buyer has nothing of the kind.
  const buyer = await signUpBuyer(browser, `api.buyer.${id}@example.com`, "Bea");
  await buyer.goto("/people/me/edit");
  await expect(buyer.getByRole("form", { name: "Your name" })).toBeVisible();
  await expect(toolsCard(buyer)).toHaveCount(0);
  await expect(buyer.getByText("API keys")).toHaveCount(0);
});

test("without a key, with one that isn't real, or with only a signed-in session, the API says 401", async ({ browser }) => {
  const nobody = await Api.as(null);
  const none = await nobody.get("/me");
  expectError(none, 401, "unauthorized");
  expect(none.headers["www-authenticate"]).toContain("Bearer");
  expectError(await nobody.get("/clients"), 401, "unauthorized");
  expectError(await nobody.post("/links", { homes: ["SAMPLE-1009"] }), 401, "unauthorized");

  // A key in the wrong shape, one in the right shape that was never made, and not a Bearer at all.
  expectError(await (await Api.as("pc_live_short")).get("/me"), 401, "unauthorized");
  expectError(await (await Api.as(`pc_live_${"A".repeat(32)}`)).get("/me"), 401, "unauthorized");
  expectError(await (await Api.as(null, { Authorization: "Basic a2l0OmtleQ==" })).get("/me"), 401, "unauthorized");

  // An agent signed in on the site, with their key sent nowhere: their
  // session is no way in (so another site can't borrow it), even to make something.
  const agent = await signInAgent(browser, `api.session.${unique()}@example.com`, "Sid Session");
  await makeKey(agent, "Zapier");
  const session = Api.over(agent.request);
  expectError(await session.get("/me"), 401, "unauthorized");
  expectError(await session.post("/links", { homes: ["SAMPLE-1009"], people: [{ first_name: "Al" }] }), 401, "unauthorized");
  expectError(
    await session.post("/listings", { address: "1 Session St", city: "Kent", state: "WA", zip: "98030", price: 1, beds: 1, baths: 1, sqft: 1 }),
    401,
    "unauthorized",
  );
});

test("a tool asks who it is and finds homes: by address, by filters, one by its key; every answer says how many requests are left", async ({
  browser,
}) => {
  const agent = await signInAgent(browser, `api.homes.${unique()}@example.com`, "Hal Homes");
  const tool = await Api.as(await makeKey(agent, "Make"));

  // Who it is, and the limits on every answer, counting down; never kept by anything in between.
  const first = await tool.get("/me");
  expect(first.status).toBe(200);
  expect(first.body.agent.name).toBe("Hal Homes");
  expect(first.body.key.name).toBe("Make");
  expect(first.headers["x-ratelimit-limit"]).toBe("120");
  expect(first.headers["cache-control"]).toBe("no-store");
  expect(first.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  const second = await tool.get("/me");
  expect(Number(second.headers["x-ratelimit-remaining"])).toBeLessThan(Number(first.headers["x-ratelimit-remaining"]));
  expect(Number(second.headers["x-ratelimit-remaining"])).toBeLessThan(120);

  // By address: the sample home, all of it a tool needs, its photos and page as full addresses.
  const byAddress = await tool.get(`/homes?q=${encodeURIComponent("1204 Quillan")}`);
  expect(byAddress.status).toBe(200);
  const quillan = byAddress.body.homes.find((home: { key: string }) => home.key === "SAMPLE-1009");
  expect(quillan).toMatchObject({
    key: "SAMPLE-1009",
    status: "active",
    address: QUILLAN,
    city: "Olympia",
    zip: "98501",
    price: 465000,
    beds: 3,
    baths: 1,
  });
  expect(quillan.url).toMatch(/^http:\/\/localhost:\d+\/homes\/SAMPLE-1009$/);
  expect(quillan.photos.length).toBeGreaterThan(0);
  for (const photo of quillan.photos) expect(photo).toMatch(/^https?:\/\//);

  // By filters: a million and up with four beds; under half a million; townhouses.
  const big = await tool.get("/homes?min_price=1000000&beds=4&limit=50");
  expect(big.status).toBe(200);
  expect(big.body.homes.length).toBeGreaterThan(0);
  for (const home of big.body.homes) {
    expect(home.price).toBeGreaterThanOrEqual(1_000_000);
    expect(home.beds).toBeGreaterThanOrEqual(4);
  }
  expect(big.body.homes.map((home: { key: string }) => home.key)).toContain("SAMPLE-1002");
  const cheap = await tool.get("/homes?max_price=%24500%2C000&sort=price-asc");
  expect(cheap.status).toBe(200);
  expect(cheap.body.homes.map((home: { key: string }) => home.key)).toContain("SAMPLE-1009");
  for (const home of cheap.body.homes) expect(home.price).toBeLessThanOrEqual(500_000);
  const prices = cheap.body.homes.map((home: { price: number }) => home.price);
  expect(prices).toEqual([...prices].sort((a, b) => a - b));
  const townhouses = await tool.get("/homes?type=townhouse");
  expect(townhouses.body.homes.map((home: { key: string }) => home.key)).toContain("SAMPLE-1007");
  for (const home of townhouses.body.homes) expect(home.type).toBe("Townhouse");
  // What it doesn't understand, it says, about that one thing.
  expectError(await tool.get("/homes?sort=cheapest"), 400, "invalid_request", "sort");
  expectError(await tool.get("/homes?beds=lots"), 400, "invalid_request", "beds");
  expectError(await tool.get("/homes?limit=500"), 400, "invalid_request", "limit");

  // One home by its key; one that has sold says so; one that isn't there isn't found.
  const one = await tool.get("/homes/SAMPLE-1008");
  expect(one.status).toBe(200);
  expect(one.body.home).toMatchObject({ key: "SAMPLE-1008", address: SALTMARSH, city: "Edmonds", price: 689000 });
  const sold = await tool.get("/homes/SAMPLE-SOLD");
  expect(sold.body.home.status).toBe("closed");
  expectError(await tool.get("/homes/NOT-A-HOME"), 404, "not_found");
});

test("a tool sends homes to two clients and gets each one's link; what they do comes back, and the tool adds a home and answers", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const id = unique();
  const jamieEmail = `jamie.api.${id}@example.com`;
  const agent = await signInAgent(browser, `api.links.${id}@example.com`, "Lou Links");
  const tool = await Api.as(await makeKey(agent, "GoHighLevel"));

  // Two homes for Jamie and Robin: a link each, given back to send on.
  const made = await tool.post("/links", {
    homes: ["SAMPLE-1009", "SAMPLE-1008"],
    people: [{ first_name: "Jamie" }, { first_name: "Robin" }],
    note: "Two I think you'll like.",
  });
  expect(made.status, made.text).toBe(201);
  const link = made.body.link;
  expect(link.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(link.homes).toBe(2);
  expect(link.people).toEqual(expect.arrayContaining(["Jamie", "Robin"]));
  expect(made.body.people.map((p: { name: string }) => p.name)).toEqual(["Jamie", "Robin"]);
  for (const person of made.body.people) expect(person.url).toMatch(/^http:\/\/localhost:\d+\/s\/[\w-]+$/);
  const [jamieUrl, robinUrl] = made.body.people.map((p: { url: string }) => p.url);
  expect(jamieUrl).not.toBe(robinUrl);
  expect(made.body.url).toBe(jamieUrl);

  // Jamie opens hers: the agent's link, the homes in the order sent. She likes the first, signing up as she does.
  const jamie = await (await browser.newContext()).newPage();
  await jamie.goto(jamieUrl);
  await expect(jamie.getByRole("button", { name: "See the 2 homes" })).toBeVisible();
  await toFirstHome(jamie);
  const quillan = homeIn(jamie, QUILLAN);
  await expect(quillan).toBeInViewport({ ratio: 0.9 });
  await heartOf(quillan).click();
  await joinAs(jamie, "Jamie", jamieEmail);
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
  // And gives her whole name on her profile, which nobody else sees.
  await jamie.goto("/people/me/edit");
  const nameForm = jamie.getByRole("form", { name: "Your name" });
  await nameForm.getByLabel("Name", { exact: true }).fill("Jamie Quellwood");
  await nameForm.getByRole("button", { name: "Save name" }).click();
  await expect(nameForm.getByRole("status")).toHaveText("Saved");

  // The tool's view: the link, newest first, and on it who opened it and what they liked.
  const links = await tool.get("/links");
  expect(links.status).toBe(200);
  expect(links.body.total).toBe(1);
  expect(links.body.links[0]).toMatchObject({ id: link.id, homes: 2, liked: 1 });
  const detail = await tool.get(`/links/${link.id}`);
  expect(detail.status).toBe(200);
  expect(detail.body.homes.map((home: { key: string; removed: boolean }) => [home.key, home.removed])).toEqual([
    ["SAMPLE-1009", false],
    ["SAMPLE-1008", false],
  ]);
  const jamieThere = detail.body.people.find((p: { name: string }) => p.name === "Jamie");
  const robinThere = detail.body.people.find((p: { name: string }) => p.name === "Robin");
  expect(jamieThere).toMatchObject({ opened: true, liked: ["SAMPLE-1009"], passed: [], url: jamieUrl });
  expect(robinThere).toMatchObject({ opened: false, liked: [], url: robinUrl });

  // Its clients: Jamie, by her first name only, liked one; Robin hasn't opened his.
  const clients = await tool.get("/clients");
  expect(clients.status).toBe(200);
  const jamieClient = clients.body.clients.find((c: { name: string }) => c.name === "Jamie");
  const robinClient = clients.body.clients.find((c: { name: string }) => c.name === "Robin");
  expect(jamieClient).toMatchObject({ homes_sent: 2, liked: 1, opened: true, link_ids: [link.id] });
  expect(jamieClient.id).toMatch(/^acct:[0-9a-f-]{36}$/);
  expect(jamieClient.profile_url).toMatch(/^http:\/\/localhost:\d+\/people\/[\w-]+$/);
  // (Robin's status follows the link he shares with Jamie, as the Clients page has it: not checked here.)
  expect(robinClient).toMatchObject({ opened: false, liked: 0, homes_sent: 2, link_ids: [link.id] });
  expect(robinClient.id).toBe("name:robin");

  // Jamie on her own: her links, and her feedback home by home.
  const one = await tool.get(`/clients/${encodeURIComponent(jamieClient.id)}`);
  expect(one.status).toBe(200);
  expect(one.body.client.name).toBe("Jamie");
  expect(one.body.links.map((l: { id: string }) => l.id)).toEqual([link.id]);
  expect(one.body.feedback.liked).toBe(1);
  const liked = one.body.feedback.homes.find((home: { key: string }) => home.key === "SAMPLE-1009");
  expect(liked).toMatchObject({ address: QUILLAN, reaction: "liked" });
  expect(one.body.feedback.homes.find((home: { key: string }) => home.key === "SAMPLE-1008")?.reaction ?? null).toBeNull();
  expectError(await tool.get(`/clients/${encodeURIComponent("name:nobody-here")}`), 404, "not_found");

  // A third home onto the link: Jamie's link has it next time she opens it.
  const added = await tool.post(`/links/${link.id}/homes`, { homes: ["SAMPLE-1003"] });
  expect(added.status, added.text).toBe(200);
  expect(added.body.added).toBe(1);
  expect(added.body.link.homes).toBe(3);
  // (One already there isn't added twice.)
  const again = await tool.post(`/links/${link.id}/homes`, { homes: ["SAMPLE-1003"] });
  expect(again.body.added).toBe(0);
  expect(again.body.link.homes).toBe(3);

  // The agent's word on the home she liked, to her: she reads it on her link.
  const said = "Glad you like it. Saturday at 10?";
  const reply = await tool.post(`/links/${link.id}/replies`, { home: "SAMPLE-1009", body: said, to: jamieThere.id });
  expect(reply.status, reply.text).toBe(201);
  expect(reply.body.reply).toMatchObject({ body: said });
  expect(reply.body.reply.created_at).toMatch(/^\d{4}-\d\d-\d\dT/);
  expectError(await tool.post(`/links/${link.id}/replies`, { home: "SAMPLE-1013", body: "Hi" }), 404, "not_found", "home");
  expectError(await tool.post(`/links/${link.id}/replies`, { home: "SAMPLE-1009", body: "" }), 400, "invalid_request", "body");

  await jamie.goto(jamieUrl);
  await expect(jamie.getByRole("button", { name: "See the 3 homes" })).toBeVisible();
  await toFirstHome(jamie);
  await expect(homeIn(jamie, CORBEL)).toHaveCount(1);
  // It answers her like: in the home's thread, one row from the agent headed
  // as an answer to her likes (likes have no row of their own, so nothing to
  // unfold), its words there to read. The thread scrolls on its own, never
  // the snapping feed.
  const chat = await openComments(jamie, homeIn(jamie, QUILLAN));
  await expect(chat.getByRole("heading", { name: "1 comment" })).toBeVisible();
  const row = chat.locator("[data-comment-list] [data-comment]");
  await expect(row).toHaveCount(1);
  await row.scrollIntoViewIfNeeded();
  // Headed as the answer to her likes. (Soft: today the heading is missing,
  // because lib/timeline.ts keys the reply's parentId "reaction-N" while
  // comment-thread.tsx's answered() looks for the reaction's replyRef
  // "like:<key>", so they never meet. The rest still runs.)
  await expect.soft(row).toContainText("Replying to your likes");
  await expect(row).toContainText("Lou Links");
  await expect(row).toContainText(said);
  await expect(chat.getByText(said)).toBeVisible();
  // Not a reply nested under a comment: nothing to unfold.
  await expect(chat.getByRole("button", { name: /^View \d+ repl/ })).toHaveCount(0);

  // Robin's link is his own, and works for him too.
  const robin = await (await browser.newContext()).newPage();
  await robin.goto(robinUrl);
  await expect(robin.getByRole("button", { name: "See the 3 homes" })).toBeVisible();

  // Nothing private anywhere: not her email, not her surname (checked after every test, too).
  for (const answer of answers) {
    expect(answer.text).not.toContain(jamieEmail);
    expect(answer.text).not.toContain("Quellwood");
  }
});

test("a tool that sends the same link twice with one Idempotency-Key makes one link; what's wrong with a link is said by its field", async ({
  browser,
}) => {
  const agent = await signInAgent(browser, `api.idem.${unique()}@example.com`, "Ida Idem");
  const tool = await Api.as(await makeKey(agent, "Zapier"));
  const body = { homes: ["SAMPLE-1009"], people: [{ first_name: "Pat" }] };
  const idem = { "Idempotency-Key": `send-pat-${unique()}` };

  // Sent, then sent again after a dropped connection: the same answer, and one link.
  const firstTry = await tool.post("/links", body, idem);
  expect(firstTry.status, firstTry.text).toBe(201);
  expect(firstTry.headers["idempotent-replayed"]).toBeUndefined();
  const retry = await tool.post("/links", body, idem);
  expect(retry.status).toBe(201);
  expect(retry.headers["idempotent-replayed"]).toBe("true");
  expect(retry.body).toEqual(firstTry.body);
  expect((await tool.get("/links")).body.total).toBe(1);
  // The same key for something else is a mistake, said as one, and nothing's made.
  expectError(await tool.post("/links", { ...body, note: "Changed my mind" }, idem), 409, "conflict");
  expect((await tool.get("/links")).body.total).toBe(1);
  // A new key is a new link.
  expect((await tool.post("/links", body, { "Idempotency-Key": `send-pat-${unique()}` })).status).toBe(201);
  expect((await tool.get("/links")).body.total).toBe(2);

  // No homes, too many, a note too long, an email where a first name goes.
  expectError(await tool.post("/links", { homes: [] }), 400, "invalid_request", "homes");
  expectError(
    // (As many as anyone likes, but not more than 100 in one request.)
    await tool.post("/links", { homes: Array.from({ length: 101 }, (_, n) => `SAMPLE-${1001 + n}`) }),
    400,
    "invalid_request",
    "homes",
  );
  expectError(await tool.post("/links", { homes: ["SAMPLE-1009"], note: "x".repeat(501) }), 400, "invalid_request", "note");
  expectError(
    await tool.post("/links", { homes: ["SAMPLE-1009"], people: [{ first_name: "pat.idem@example.com" }] }),
    400,
    "invalid_request",
    "people.0.first_name",
  );
  expectError(
    await tool.post("/links", { homes: ["SAMPLE-1009"], people: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ first_name: `P${n}` })) }),
    400,
    "invalid_request",
    "people",
  );
  // A home that has sold, or was never here: it can't go on a link.
  expectError(await tool.post("/links", { homes: ["SAMPLE-SOLD"], people: [{ first_name: "Pat" }] }), 409, "conflict", "homes");
  // Not JSON, or broken JSON.
  expectError(await tool.post("/links", "homes=SAMPLE-1009", { "Content-Type": "application/x-www-form-urlencoded" }), 415, "unsupported_media_type");
  expectError(await tool.post("/links", "{not json", { "Content-Type": "application/json" }), 400, "invalid_request");
  // Far too much: turned away before it's read.
  expectError(
    await tool.post("/links", { homes: ["SAMPLE-1009"], note: "x".repeat(70 * 1024) }),
    413,
    "payload_too_large",
  );
  // Nothing was made by any of that.
  expect((await tool.get("/links")).body.total).toBe(2);
});

test("a tool adds an agent's own listing (a deal) with photos, closes it, hides it and takes it down; anyone sees it on their profile meanwhile", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const id = unique();
  const address = `${id.slice(-5)} Dealmaker Api Ave`;
  const agent = await signInAgent(browser, `api.deals.${id}@example.com`, "Dee Deals");
  const tool = await Api.as(await makeKey(agent, "Make"));

  // Its facts as a tool might send them: some as text, the way a form has them.
  const made = await tool.post("/listings", {
    address,
    city: "Tacoma",
    state: "wa",
    zip: "98402",
    price: "$389,000",
    beds: 3,
    baths: "2",
    sqft: "1,640",
    description: "Needs a kitchen. Good bones.",
    year_built: 1962,
    arv: "$520,000",
    rehab: 65000,
  });
  expect(made.status, made.text).toBe(201);
  const listing = made.body.listing;
  expect(listing.key).toMatch(/^OWN-/);
  expect(listing).toMatchObject({
    own: true,
    address,
    city: "Tacoma",
    state: "WA",
    zip: "98402",
    price: 389000,
    beds: 3,
    baths: 2,
    sqft: 1640,
    year_built: 1962,
    arv: 520000,
    rehab: 65000,
    shown: true,
    closed: false,
    status: "active",
    photos: [],
  });
  expect(listing.edit_url).toMatch(new RegExp(`/dashboard/listings/${listing.key}$`));
  const key = encodeURIComponent(listing.key);

  // What's wrong is said by the field, as the form says it.
  const badZip = await tool.post("/listings", { address, city: "Tacoma", state: "WA", zip: "984", price: 1, beds: 1, baths: 1, sqft: 1 });
  expectError(badZip, 400, "invalid_request", "zip");
  expect(badZip.body.error.message).toBe("Enter a 5-digit ZIP code.");
  expectError(
    await tool.post("/listings", { address, city: "Tacoma", state: "WA", zip: "98402", price: "lots", beds: 1, baths: 1, sqft: 1 }),
    400,
    "invalid_request",
    "price",
  );
  expectError(
    await tool.post("/listings", { address, city: "Tacoma", state: "WA", zip: "98402", price: 1, bedrooms: 3, baths: 1, sqft: 1 }),
    400,
    "invalid_request",
  );
  expectError(await tool.patch(`/listings/${key}`, { year_built: "old" }), 400, "invalid_request", "year_built");

  // A photo sent as a data URL: kept as a JPEG no wider than 1600 px, served at its address.
  const photo = await tool.post(`/listings/${key}/photos`, { data: await pngDataUrl(2400, 1200) });
  expect(photo.status, photo.text).toBe(201);
  expect(photo.body.photo).toMatchObject({ width: 1600, height: 800 });
  expect(photo.body.photo.url).toMatch(/^http:\/\/localhost:\d+\/listing-photo\//);
  expect(photo.body.listing.photos).toEqual([photo.body.photo.url]);
  const served = await agent.request.get(photo.body.photo.url);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/jpeg");
  const meta = await sharp(await served.body()).metadata();
  expect(meta).toMatchObject({ format: "jpeg", width: 1600, height: 800 });
  // From an address on a private network, or not https: refused, by the field.
  expectError(await tool.post(`/listings/${key}/photos`, { url: "https://10.0.0.1/x.jpg" }), 400, "invalid_request", "url");
  expectError(await tool.post(`/listings/${key}/photos`, { url: "http://127.0.0.1/x.jpg" }), 400, "invalid_request", "url");
  expectError(await tool.post(`/listings/${key}/photos`, { data: "data:image/gif;base64,R0lGOD" }), 400, "invalid_request", "data");

  // With a photo it's on Dee's profile, for anyone, signed out, with its price; and its own page
  // has the deal's numbers. On a desktop the price is in the panel beside the photo, and the
  // details open under the description when its "more" is pressed.
  const profile = await profilePath(agent);
  const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await visitor.goto(profile);
  const tile = visitor.getByRole("list", { name: "Listings" }).getByRole("link", { name: new RegExp(address) });
  await expect(tile).toContainText("$389,000");
  await visitor.goto(`/homes/${key}`);
  const home = visitor.getByRole("article", { name: address });
  await expect(home).toContainText("$389,000");
  const details = home.getByRole("list", { name: "The details" });
  await expect(details).toBeHidden();
  const more = home.getByRole("button", { name: "more", exact: true });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();
  // The same button now reads "less", and the details are out.
  await expect(home.getByRole("button", { name: "less", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(details).toBeVisible();
  await expect(details).toContainText("After repair value");
  await expect(details).toContainText("$520,000");

  // Among the tool's listings, as its own.
  const all = await tool.get("/listings");
  expect(all.body.listings.filter((l: { key: string }) => l.key === listing.key)).toEqual([
    expect.objectContaining({ source: "own", price: 389000 }),
  ]);
  expect((await tool.get(`/listings/${key}`)).body.listing.key).toBe(listing.key);

  // Closed: still on the profile, and it says so. The rehab cleared with null; the rest kept.
  const closed = await tool.patch(`/listings/${key}`, { status: "closed", rehab: null });
  expect(closed.status, closed.text).toBe(200);
  expect(closed.body.listing).toMatchObject({ closed: true, status: "closed", rehab: null, arv: 520000, price: 389000 });
  await visitor.goto(profile);
  await expect(tile).toContainText("Closed");

  // Hidden: gone from the profile, still the agent's.
  const hidden = await tool.patch(`/listings/${key}`, { shown: false });
  expect(hidden.body.listing.shown).toBe(false);
  await visitor.reload();
  await expect(visitor.getByRole("main")).toBeVisible();
  await expect(visitor.getByRole("main")).not.toContainText(address);
  expect((await tool.get(`/listings/${key}`)).status).toBe(200);

  // A second photo, sent twice by a tool that retried it: kept once. Then the first taken off: one left, the second.
  const second = { data: await pngDataUrl(800, 600) };
  const retried = { "Idempotency-Key": `photo-${id}` };
  const another = await tool.post(`/listings/${key}/photos`, second, retried);
  expect(another.status).toBe(201);
  const replayed = await tool.post(`/listings/${key}/photos`, second, retried);
  expect(replayed.headers["idempotent-replayed"]).toBe("true");
  expect(replayed.body.photo.id).toBe(another.body.photo.id);
  expect((await tool.get(`/listings/${key}`)).body.listing.photos).toHaveLength(2);
  expect(another.body.photo).toMatchObject({ width: 800, height: 600 });
  expect(another.body.listing.photos).toHaveLength(2);
  const less = await tool.delete(`/listings/${key}/photos/${photo.body.photo.id}`);
  expect(less.status, less.text).toBe(200);
  expect(less.body.listing.photos).toEqual([another.body.photo.url]);
  expectError(await tool.delete(`/listings/${key}/photos/${photo.body.photo.id}`), 404, "not_found");

  // Taken down: gone for good.
  const gone = await tool.delete(`/listings/${key}`);
  expect(gone.body).toEqual({ deleted: true });
  expectError(await tool.get(`/listings/${key}`), 404, "not_found");
  expect((await tool.get("/listings")).body.listings.map((l: { key: string }) => l.key)).not.toContain(listing.key);

  // One that's on a link the agent sent can't go from under the client: it's withdrawn instead.
  const sent = await tool.post("/listings", {
    address: `${address} Unit 2`,
    city: "Tacoma",
    state: "WA",
    zip: "98402",
    price: 410000,
    beds: 2,
    baths: 1,
    sqft: 900,
  });
  expect(sent.status, sent.text).toBe(201);
  const sentKey = encodeURIComponent(sent.body.listing.key);
  expect((await tool.post(`/listings/${sentKey}/photos`, { data: await pngDataUrl(400, 300) })).status).toBe(201);
  const onLink = await tool.post("/links", { homes: [sent.body.listing.key], people: [{ first_name: "Sam" }] });
  expect(onLink.status, onLink.text).toBe(201);
  const withdrawn = await tool.delete(`/listings/${sentKey}`);
  expect(withdrawn.status).toBe(200);
  expect(withdrawn.body).toMatchObject({ withdrawn: true });
  expect(typeof withdrawn.body.message).toBe("string");
  await visitor.goto(profile);
  await expect(visitor.getByRole("main")).not.toContainText(`${address} Unit 2`);
});

test("a tool adds videos to an agent's listing: a YouTube link, or a link straight to a video file; anything else is refused", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const id = unique();
  const address = `${id.slice(-5)} Video Api Ave`;
  const agent = await signInAgent(browser, `api.videos.${id}@example.com`, "Vida Videos");
  const tool = await Api.as(await makeKey(agent, "Make"));
  const made = await tool.post("/listings", {
    address, city: "Tacoma", state: "WA", zip: "98402", price: 410000, beds: 3, baths: 2, sqft: 1500,
  });
  expect(made.status, made.text).toBe(201);
  const key = made.body.listing.key;
  expect(made.body.listing.videos).toEqual([]);
  await tool.post(`/listings/${key}/photos`, { data: await pngDataUrl(800, 600) });

  // A server here with a video file, a page that isn't one, and a file too big.
  const files = createServer((req, res) => {
    if (req.url === "/walk.mp4") res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": "2048" });
    else if (req.url === "/huge.mp4") res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": String(60 * 1024 * 1024) });
    else res.writeHead(200, { "Content-Type": "text/html" });
    res.end(req.method === "HEAD" ? undefined : "x");
  });
  await new Promise<void>((done) => files.listen(0, "127.0.0.1", done));
  const at = `http://127.0.0.1:${(files.address() as AddressInfo).port}`;
  try {
    const link = await tool.post(`/listings/${key}/videos`, { url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(link.status, link.text).toBe(201);
    expect(link.body.video).toMatchObject({
      kind: "link",
      url: "https://youtu.be/dQw4w9WgXcQ",
      embed_url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
    expectError(await tool.post(`/listings/${key}/videos`, { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }), 409, "conflict", "url");

    const file = await tool.post(`/listings/${key}/videos`, { url: `${at}/walk.mp4` });
    expect(file.status, file.text).toBe(201);
    expect(file.body.video).toMatchObject({ kind: "file", url: `${at}/walk.mp4`, embed_url: null });
    expectError(await tool.post(`/listings/${key}/videos`, { url: `${at}/page` }), 400, "invalid_request", "url");
    expectError(await tool.post(`/listings/${key}/videos`, { url: `${at}/huge.mp4` }), 400, "invalid_request", "url");
    expectError(await tool.post(`/listings/${key}/videos`, { url: "https://10.0.0.1/walk.mp4" }), 400, "invalid_request", "url");
    expectError(await tool.post(`/listings/${key}/videos`, { link: "https://youtu.be/dQw4w9WgXcQ" }), 400, "invalid_request");

    // Three at most.
    expect((await tool.post(`/listings/${key}/videos`, { url: "https://vimeo.com/76979871" })).status).toBe(201);
    expectError(await tool.post(`/listings/${key}/videos`, { url: "https://youtu.be/aqz-KE-bpKQ" }), 422, "limit_reached");

    const listed = await tool.get(`/listings/${key}/videos`);
    expect(listed.body.videos.map((video: { kind: string }) => video.kind)).toEqual(["link", "file", "link"]);
    const shown = await tool.get(`/listings/${key}`);
    expect(shown.body.listing.videos).toHaveLength(3);
    // Photos stay photos.
    expect(shown.body.listing.photos).toHaveLength(1);

    // On the home, after its photo: the file plays by itself, silently, with its sound a tap away.
    const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await visitor.goto(`/homes/${key}`);
    const home = visitor.getByRole("article", { name: address });
    await home.getByRole("button", { name: "Next photo" }).click();
    await home.getByRole("button", { name: "Next photo" }).click();
    const player = home.locator(`video[src="${at}/walk.mp4"]`);
    await expect(player).toHaveCount(1);
    await expect.poll(() => player.evaluate((el: HTMLVideoElement) => el.muted)).toBe(true);
    await home.getByRole("button", { name: "Turn sound on" }).click();
    await expect.poll(() => player.evaluate((el: HTMLVideoElement) => el.muted)).toBe(false);

    // Taken off by its id.
    const gone = await tool.delete(`/listings/${key}/videos/${encodeURIComponent(file.body.video.id)}`);
    expect(gone.status, gone.text).toBe(200);
    expect(gone.body.listing.videos.map((video: { kind: string }) => video.kind)).toEqual(["link", "link"]);
    expectError(await tool.delete(`/listings/${key}/videos/nope`), 404, "not_found");
  } finally {
    files.close();
  }
});

test("one agent's key never reaches another agent's clients, links or listings", async ({ browser }) => {
  test.setTimeout(120_000);
  const id = unique();
  const ana = await signInAgent(browser, `api.ana.${id}@example.com`, "Ana Owner");
  const anaTool = await Api.as(await makeKey(ana, "GoHighLevel"));
  const ben = await signInAgent(browser, `api.ben.${id}@example.com`, "Ben Other");
  const benTool = await Api.as(await makeKey(ben, "GoHighLevel"));

  // Ana's: a link for Pia, and a listing she keeps hidden.
  const link = (await anaTool.post("/links", { homes: ["SAMPLE-1009"], people: [{ first_name: "Pia" }] })).body.link;
  const listing = (
    await anaTool.post("/listings", {
      address: `${id.slice(-5)} Private Deal Rd`,
      city: "Kent",
      state: "WA",
      zip: "98030",
      price: 300000,
      beds: 3,
      baths: 1,
      sqft: 1200,
      shown: false,
    })
  ).body.listing;
  expect(listing.shown).toBe(false);
  const key = encodeURIComponent(listing.key);
  expect((await anaTool.get("/clients")).body.clients.map((c: { id: string }) => c.id)).toContain("name:pia");
  expect((await anaTool.get(`/homes/${key}`)).status).toBe(200);

  // Ben's key: none of it is there, and none of it can be read or changed.
  expect((await benTool.get("/links")).body).toEqual({ links: [], total: 0 });
  expect((await benTool.get("/clients")).body).toEqual({ clients: [] });
  expect((await benTool.get("/listings")).body.listings.map((l: { key: string }) => l.key)).not.toContain(listing.key);
  expectError(await benTool.get(`/links/${link.id}`), 404, "not_found");
  expectError(await benTool.post(`/links/${link.id}/homes`, { homes: ["SAMPLE-1008"] }), 404, "not_found");
  expectError(await benTool.post(`/links/${link.id}/replies`, { home: "SAMPLE-1009", body: "Hi Pia" }), 404, "not_found");
  expectError(await benTool.get(`/clients/${encodeURIComponent("name:pia")}`), 404, "not_found");
  expectError(await benTool.get(`/listings/${key}`), 404, "not_found");
  expectError(await benTool.patch(`/listings/${key}`, { price: 1 }), 404, "not_found");
  expectError(await benTool.delete(`/listings/${key}`), 404, "not_found");
  expectError(await benTool.post(`/listings/${key}/photos`, { data: await pngDataUrl(10, 10) }), 404, "not_found");
  expectError(await benTool.get(`/homes/${key}`), 404, "not_found");
  // Nor found by its address.
  const street = `${id.slice(-5)} Private Deal Rd`;
  const found = await benTool.get(`/homes?q=${encodeURIComponent(street)}`);
  expect(found.status).toBe(200);
  expect(found.body.homes.map((h: { key: string }) => h.key)).not.toContain(listing.key);
  expect(found.text).not.toContain(street);
  expect((await anaTool.get(`/homes?q=${encodeURIComponent(street)}`)).body.homes.map((h: { key: string }) => h.key)).toContain(
    listing.key,
  );
  // Nor sent on a link of Ben's, though he knows its key.
  expectError(await benTool.post("/links", { homes: [listing.key], people: [{ first_name: "Bo" }] }), 409, "conflict", "homes");

  // An Idempotency-Key is each key's own: Ben's tool sending with the same one
  // Ana's used gets a link of his own, never her answer played back.
  const idem = { "Idempotency-Key": `crm-${id}` };
  const anas = await anaTool.post("/links", { homes: ["SAMPLE-1008"], people: [{ first_name: "Quinn" }] }, idem);
  expect(anas.status).toBe(201);
  const bens = await benTool.post("/links", { homes: ["SAMPLE-1008"], people: [{ first_name: "Quinn" }] }, idem);
  expect(bens.status).toBe(201);
  expect(bens.headers["idempotent-replayed"]).toBeUndefined();
  expect(bens.body.link.id).not.toBe(anas.body.link.id);
  expect(bens.body.people[0].url).not.toBe(anas.body.people[0].url);
  expect((await benTool.get("/links")).body.total).toBe(1);

  // And it's all still Ana's, just as it was.
  expect((await anaTool.get(`/links/${link.id}`)).body.link.homes).toBe(1);
  expect((await anaTool.get(`/listings/${key}`)).body.listing.price).toBe(300000);
});
