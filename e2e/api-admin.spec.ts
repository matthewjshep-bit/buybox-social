// The owner's admin API (app/api/admin/v1): with an admin key made on
// /admin/api, the site's owner reads, makes, changes and deletes any account,
// fills an agent's profile, and works on /api/v1 as any agent (the
// Porchcard-Account header) to add their listings and photos. The person
// then signs in with the email and finds it all there. Only the owner can
// make such a key; every change made with one is in the log.
import sharp from "sharp";
import { expect, request, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { Api, answers, expectError, expectNothingPrivate, makeKey, type ApiResult } from "./api-helpers";
import { enterCode, pastNameStep, signInAgent } from "./helpers";

const OWNER = "matt@shepflips.com";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

// What the agents' API says as an agent (acted as, or with their own key) is
// as private as ever, whoever asks.
test.beforeEach(() => {
  answers.length = 0;
});
test.afterEach(() => {
  expectNothingPrivate();
});

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;

async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await pastNameStep(page);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return page;
}

// The owner makes an admin key on /admin/api: shown once, then only its first characters.
async function makeAdminKey(owner: Page, name: string) {
  await owner.goto("/admin/api");
  await expect(owner.getByRole("heading", { level: 1 })).toHaveText("API");
  await owner.getByLabel("Name", { exact: true }).fill(name);
  await owner.getByRole("button", { name: "Make a key" }).click();
  const shown = owner.getByRole("group", { name: `Your admin key for ${name}` });
  await expect(shown).toContainText("Copy it now. You won't see it again.");
  const key = await shown.getByRole("textbox").inputValue();
  expect(key).toMatch(/^pc_admin_[A-Za-z0-9]{32}$/);
  await shown.getByRole("button", { name: "Done" }).click();
  await expect(owner.getByText(key)).toHaveCount(0);
  const row = owner.getByRole("list", { name: "Your admin keys" }).getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText(`${key.slice(0, 14)}…`);
  return key;
}

// The owner's tool on /api/admin/v1. (What it says carries emails, by design:
// kept apart from the agents' API answers checked for privacy.)
class Admin {
  private constructor(private context: APIRequestContext) {}

  static async as(key: string) {
    const context = await request.newContext({
      baseURL: test.info().project.use.baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${key}` },
    });
    return new Admin(context);
  }

  private async read(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<ApiResult> {
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const headers = response.headers();
    if (response.status() !== 204) expect(headers["content-type"], text).toMatch(/^application\/json/);
    expect(headers["cache-control"]).toBe("no-store");
    expect(headers["set-cookie"]).toBeUndefined();
    return { status: response.status(), headers, body, text };
  }

  get = async (path: string) => this.read(await this.context.get(`/api/admin/v1${path}`));
  post = async (path: string, data?: unknown, headers?: Record<string, string>) =>
    this.read(await this.context.post(`/api/admin/v1${path}`, { data, headers }));
  patch = async (path: string, data?: unknown) => this.read(await this.context.patch(`/api/admin/v1${path}`, { data }));
  delete = async (path: string) => this.read(await this.context.delete(`/api/admin/v1${path}`));
}

async function imageDataUrl(width: number, height: number, format: "png" | "jpeg" = "png") {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 60, g: 110, b: 150 } } });
  const bytes = await (format === "png" ? image.png() : image.jpeg()).toBuffer();
  return `data:image/${format};base64,${bytes.toString("base64")}`;
}

// The test password's sign-in (e2e/test-sign-in.spec.ts), as the person would.
async function testSignIn(browser: Browser, email: string) {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: "Testing? Sign in with the test password" }).click();
  const form = page.getByRole("form", { name: "Test sign-in" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Test password").fill("e2e-test-password");
  await form.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return page;
}

test("only the owner makes admin keys; an agent's key never reaches the admin API, and a revoked admin key stops", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const id = unique();
  const owner = await signIn(browser, OWNER);
  const key = await makeAdminKey(owner, "Owner tool");

  // Who it is.
  const admin = await Admin.as(key);
  const me = await admin.get("/me");
  expect(me.status, me.text).toBe(200);
  expect(me.body.key).toEqual({ name: "Owner tool", prefix: key.slice(0, 14) });
  expect(me.body.owner).toMatchObject({ email: OWNER });
  expect(me.body.owner.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(me.headers["x-request-id"]).toBeTruthy();

  // On the agents' API it has to say which agent: without that, a 400 (not a 401).
  const bare = await Api.as(key);
  expectError(await bare.get("/me"), 400, "invalid_request", "Porchcard-Account");
  expectError(await bare.post("/listings", { address: "1 Nobody St" }), 400, "invalid_request", "Porchcard-Account");
  // An id that isn't an agent's: the owner (no agent), nonsense, nobody.
  for (const who of [me.body.owner.id, "not-a-uuid", "00000000-0000-4000-8000-000000000000"]) {
    expectError(await (await Api.as(key, { "Porchcard-Account": who })).get("/me"), 404, "not_found");
  }

  // An agent: their own key works for them, and is a 401 on every admin endpoint.
  const agent = await signInAgent(browser, `admin.api.agent.${id}@example.com`, "Ada Agentkey");
  const agentKey = await makeKey(agent, "My CRM");
  expect((await (await Api.as(agentKey)).get("/me")).status).toBe(200);
  const asAgent = await Admin.as(agentKey);
  for (const result of [
    await asAgent.get("/me"),
    await asAgent.get("/accounts"),
    await asAgent.post("/accounts", { email: `x.${id}@example.com`, role: "buyer" }),
    await asAgent.get("/log"),
  ]) {
    expectError(result, 401, "unauthorized");
    expect(result.headers["www-authenticate"]).toContain("Bearer");
  }
  // And no key, or a made-up one: 401.
  expectError(await (await Admin.as(`pc_admin_${"A".repeat(32)}`)).get("/me"), 401, "unauthorized");
  // The agent's own key list never shows the owner's admin key, and the agent finds nothing at /admin/api.
  expect((await agent.goto("/admin/api"))!.status()).toBe(404);
  await agent.goto("/people/me/edit");
  await expect(agent.getByText(key.slice(0, 14))).toHaveCount(0);

  // A non-owner admin: the admin pages, but not API.
  const helperEmail = `admin.api.helper.${id}@example.com`;
  await owner.goto("/admin/team");
  await owner.getByLabel("Their email").fill(helperEmail);
  await owner.getByRole("button", { name: "Add admin" }).click();
  await expect(owner.getByRole("status")).toHaveText(`${helperEmail} is now an admin.`);
  const helper = await signIn(browser, helperEmail);
  await helper.goto("/admin/people");
  await expect(helper.getByRole("heading", { level: 1 })).toHaveText("People");
  await expect(helper.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "API" })).toHaveCount(0);
  expect((await helper.goto("/admin/api"))!.status()).toBe(404);
  // (Taken off again, so other tests see the admins as they were.)
  const helperRow = owner.getByRole("listitem").filter({ hasText: helperEmail });
  await helperRow.getByRole("button", { name: "Remove" }).click();
  await helperRow.getByRole("button", { name: /^Remove / }).click();
  await expect(owner.getByRole("listitem").filter({ hasText: helperEmail })).toHaveCount(0);

  // Revoked, it's a 401 everywhere.
  await owner.goto("/admin/api");
  const row = owner.getByRole("list", { name: "Your admin keys" }).getByRole("listitem").filter({ hasText: "Owner tool" });
  await row.getByRole("button", { name: "Revoke the admin key for Owner tool" }).click();
  await row.getByRole("button", { name: "Revoke key" }).click();
  await expect(row).toHaveCount(0);
  expectError(await admin.get("/me"), 401, "unauthorized");
  expectError(await (await Api.as(key, { "Porchcard-Account": "00000000-0000-4000-8000-000000000000" })).get("/me"), 401, "unauthorized");
});

test("the owner makes an agent, fills their profile, adds a listing with a photo as them; they sign in and it's all theirs", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const id = unique();
  const owner = await signIn(browser, OWNER);
  const key = await makeAdminKey(owner, `Onboarding ${id.slice(-4)}`);
  const admin = await Admin.as(key);

  const email = `nora.admin.${id}@example.com`;
  const mls = `NW-${id.slice(-6)}`;
  const body = {
    email: email.toUpperCase(),
    role: "agent",
    full_name: "Nora Northfield",
    phone: "(206) 555-0199",
    brokerage: "Northfield Homes",
    mls_agent_id: mls,
    contact_phone: "(206) 555-0198",
    contact_email: `Nora.Office.${id}@Example.com`,
    bio: "South Sound fixer-uppers.",
    profile_links: [{ label: "Website", url: "nora-northfield.com" }],
    brand_color: "#7a2e3b",
    photo: { data: await imageDataUrl(800, 600) },
    banner: { data: await imageDataUrl(2400, 900, "jpeg") },
  };

  // What's wrong is said by its field, as the profile pages say it.
  expectError(await admin.post("/accounts", { ...body, brand_color: "#123456" }), 400, "invalid_request", "brand_color");
  expectError(await admin.post("/accounts", { ...body, name: "Nora" }), 400, "invalid_request", "name");
  expectError(await admin.post("/accounts", { ...body, role: "boss" }), 400, "invalid_request", "role");
  expectError(await admin.post("/accounts", { ...body, email: "nora" }), 400, "invalid_request", "email");
  expectError(await admin.post("/accounts", { ...body, contact_phone: "555" }), 400, "invalid_request", "contact_phone");
  expectError(await admin.post("/accounts", { ...body, photo: { url: "https://10.0.0.1/me.jpg" } }), 400, "invalid_request", "photo.url");
  expectError(await admin.post("/accounts", { ...body, photo: { data: "data:image/gif;base64,R0lGOD" } }), 400, "invalid_request", "photo.data");
  expectError(
    await admin.post("/accounts", { email: `buyer.${id}@example.com`, role: "buyer", brokerage: "Nope Realty" }),
    400,
    "invalid_request",
    "brokerage",
  );
  // The owner's email is taken, however it's written.
  expectError(await admin.post("/accounts", { email: OWNER.toUpperCase(), role: "agent" }), 409, "conflict", "email");

  // Made, ready for Nora to sign in to. A retry with the same key is the same answer, not a second account.
  const retry = { "Idempotency-Key": `make-nora-${id}` };
  const made = await admin.post("/accounts", body, retry);
  expect(made.status, made.text).toBe(201);
  const account = made.body.account;
  expect(account).toMatchObject({
    email,
    role: "agent",
    signed_in: false,
    owner: false,
    full_name: "Nora Northfield",
    phone: "(206) 555-0199",
    brokerage: "Northfield Homes",
    mls_agent_id: mls,
    contact_phone: "2065550198",
    contact_email: `nora.office.${id}@example.com`,
    bio: "South Sound fixer-uppers.",
    profile_links: [{ label: "Website", url: "https://nora-northfield.com/" }],
    brand_color: "#7A2E3B",
    banner: "image",
    counts: { own_listings: 0, links_sent: 0, clients: 0, followers: 0, likes: 0, comments: 0 },
  });
  expect(account.profile_url).toMatch(/^http:\/\/localhost:\d+\/people\/[0-9a-f-]{36}$/);
  const again = await admin.post("/accounts", body, retry);
  expect(again.status).toBe(201);
  expect(again.body.account.id).toBe(account.id);
  // Without the key, the same email is a 409.
  expectError(await admin.post("/accounts", body), 409, "conflict", "email");

  // Their photo, made as Edit profile makes it: a 256 px square JPEG. The banner, a 1200 x 360 band.
  const photo = await owner.request.get(account.photo_url);
  expect(photo.status()).toBe(200);
  expect(await sharp(await photo.body()).metadata()).toMatchObject({ format: "jpeg", width: 256, height: 256 });
  const banner = await owner.request.get(account.banner_url);
  expect(banner.status()).toBe(200);
  expect(await sharp(await banner.body()).metadata()).toMatchObject({ format: "jpeg", width: 1200, height: 360 });

  // Anyone sees them on their profile, signed out.
  const profilePath = new URL(account.profile_url).pathname;
  const visitor = await (await browser.newContext(DESKTOP)).newPage();
  await visitor.goto(profilePath);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Nora Northfield");
  await expect(visitor.getByRole("main")).toContainText("Northfield Homes");
  await expect(visitor.getByRole("main")).toContainText("South Sound fixer-uppers.");
  await expect(visitor.locator(`main img[src*="${new URL(account.photo_url).pathname}"]`).first()).toBeVisible();

  // As Nora on the agents' API: who it is, then a listing and its photo.
  const asNora = await Api.as(key, { "Porchcard-Account": account.id });
  const noraMe = await asNora.get("/me");
  expect(noraMe.status, noraMe.text).toBe(200);
  expect(noraMe.body).toMatchObject({
    agent: { name: "Nora Northfield", brokerage: "Northfield Homes", mls_agent_id: mls, profile_url: account.profile_url },
    acting_as: true,
  });
  const address = `${id.slice(-5)} Admin Made Ave`;
  const listing = await asNora.post(
    "/listings",
    { address, city: "Tacoma", state: "WA", zip: "98405", price: 389000, beds: 3, baths: 1, sqft: 1320, arv: 520000, rehab: 85000 },
    { "Idempotency-Key": `nora-listing-${id}` },
  );
  expect(listing.status, listing.text).toBe(201);
  expect(listing.body.listing).toMatchObject({ own: true, address, price: 389000, listed_by: { agent: "Nora Northfield" } });
  const listingKey = encodeURIComponent(listing.body.listing.key);
  const added = await asNora.post(`/listings/${listingKey}/photos`, { data: await imageDataUrl(1200, 800) });
  expect(added.status, added.text).toBe(201);
  expect(added.body.listing.photos).toEqual([added.body.photo.url]);

  // It's on Nora's profile, for anyone.
  await visitor.goto(profilePath);
  await expect(
    visitor.getByRole("list", { name: "Listings" }).getByRole("link", { name: new RegExp(address) }),
  ).toContainText("$389,000");

  // Changed: only what's sent; null clears; a name follows to the profile.
  const changed = await admin.patch(`/accounts/${account.id}`, {
    full_name: "Nora North",
    bio: null,
    banner: null,
    brand_color: null,
  });
  expect(changed.status, changed.text).toBe(200);
  expect(changed.body.account).toMatchObject({
    full_name: "Nora North",
    bio: "",
    banner: "",
    banner_url: null,
    brand_color: "#1F5F5B",
    brokerage: "Northfield Homes",
    counts: { own_listings: 1 },
  });
  expectError(await admin.patch(`/accounts/${account.id}`, {}), 400, "invalid_request");
  expectError(await admin.patch(`/accounts/${account.id}`, { email: OWNER }), 409, "conflict", "email");
  expectError(await admin.patch(`/accounts/${account.id}`, { full_name: "" }), 400, "invalid_request", "full_name");
  // null clears other fields, but a name can't be cleared (and the docs say so).
  expectError(await admin.patch(`/accounts/${account.id}`, { full_name: null }), 400, "invalid_request", "full_name");
  await owner.goto("/admin/api");
  await expect(owner.locator("#admin-patch-account")).toContainText("except full_name");
  const nameField = owner.locator("dl > div").filter({ has: owner.locator("dt code", { hasText: /^full_name$/ }) });
  await expect(nameField.first()).toContainText("Can't be cleared.");
  expectError(await admin.patch(`/accounts/00000000-0000-4000-8000-000000000000`, { bio: "x" }), 404, "not_found");
  // The owner's role stays.
  const ownerId = (await admin.get("/me")).body.owner.id;
  const ownerRole = (await admin.get(`/accounts/${ownerId}`)).body.account.role;
  expectError(
    await admin.patch(`/accounts/${ownerId}`, { role: ownerRole === "agent" ? "buyer" : "agent" }),
    409,
    "conflict",
    "role",
  );
  expect((await admin.get(`/accounts/${ownerId}`)).body.account.role).toBe(ownerRole);
  await visitor.goto(profilePath);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Nora North");
  await expect(visitor.getByRole("main")).not.toContainText("South Sound fixer-uppers.");

  // Read back, whole, and found: by name, email, phone digits, MLS ID; by role; a page at a time.
  const read = await admin.get(`/accounts/${account.id}`);
  expect(read.status).toBe(200);
  expect(read.body.account).toMatchObject({ id: account.id, email, full_name: "Nora North", counts: { own_listings: 1 } });
  expectError(await admin.get("/accounts/not-a-uuid"), 404, "not_found");
  for (const q of ["Nora North", email.toUpperCase(), "2065550199", mls]) {
    const found = await admin.get(`/accounts?q=${encodeURIComponent(q)}`);
    expect(found.status, found.text).toBe(200);
    expect(found.body.accounts.map((a: { id: string }) => a.id), q).toContain(account.id);
  }
  expect((await admin.get(`/accounts?q=${encodeURIComponent(email)}&role=buyer`)).body).toEqual({ accounts: [], total: 0 });
  const agents = await admin.get("/accounts?role=agent&limit=1");
  expect(agents.body.accounts).toHaveLength(1);
  expect(agents.body.total).toBeGreaterThanOrEqual(1);
  expect(agents.body.accounts[0].role).toBe("agent");
  const everyone = await admin.get("/accounts?limit=100");
  expect(everyone.body.accounts.length).toBeGreaterThanOrEqual(2);
  const times = everyone.body.accounts.map((a: { created_at: string }) => a.created_at);
  expect(times).toEqual([...times].sort().reverse());
  expectError(await admin.get("/accounts?role=boss"), 400, "invalid_request", "role");
  expectError(await admin.get("/accounts?limit=0"), 400, "invalid_request", "limit");

  // Nora signs in with her email (any case): the same account, an agent, her listing there.
  const nora = await testSignIn(browser, email.toUpperCase());
  // (Home, like everyone, not her Clients page.)
  await expect.poll(() => new URL(nora.url()).pathname).toBe("/");
  await nora.goto("/dashboard/listings");
  await expect(nora.getByRole("main")).toContainText(address);
  await nora.goto("/people/me");
  await nora.waitForURL(/\/people\/[\w-]+$/);
  expect(new URL(nora.url()).pathname).toBe(profilePath);
  const signedIn = await admin.get(`/accounts/${account.id}`);
  expect(signedIn.body.account).toMatchObject({ id: account.id, role: "agent", signed_in: true, full_name: "Nora North" });
  // Only one account for her email.
  expect((await admin.get(`/accounts?q=${encodeURIComponent(email)}`)).body.total).toBe(1);
});

test("the same Idempotency-Key used as two agents makes a listing for each, and replays only for the one it was", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const id = unique();
  const owner = await signIn(browser, OWNER);
  const key = await makeAdminKey(owner, `Idem ${id.slice(-4)}`);
  const admin = await Admin.as(key);
  const agents: string[] = [];
  for (const name of ["Ivy Idem", "Ike Idem"]) {
    const made = await admin.post("/accounts", {
      email: `${name.split(" ")[0].toLowerCase()}.idem.${id}@example.com`,
      role: "agent",
      full_name: name,
    });
    expect(made.status, made.text).toBe(201);
    agents.push(made.body.account.id);
  }
  const [ivy, ike] = await Promise.all(agents.map((who) => Api.as(key, { "Porchcard-Account": who })));
  const address = `${id.slice(-5)} Same Key Ln`;
  const listing = { address, city: "Kent", state: "WA", zip: "98030", price: 250000, beds: 2, baths: 1, sqft: 900 };
  const same = { "Idempotency-Key": `deal-${id}` };

  const forIvy = await ivy.post("/listings", listing, same);
  expect(forIvy.status, forIvy.text).toBe(201);
  const forIke = await ike.post("/listings", listing, same);
  expect(forIke.status, forIke.text).toBe(201);
  // Two listings, each its own agent's.
  expect(forIke.body.listing.key).not.toBe(forIvy.body.listing.key);
  expect(forIvy.body.listing.listed_by.agent).toBe("Ivy Idem");
  expect(forIke.body.listing.listed_by.agent).toBe("Ike Idem");
  // Asked again as Ivy: her answer, not a third listing.
  const replayed = await ivy.post("/listings", listing, same);
  expect(replayed.status).toBe(201);
  expect(replayed.body.listing.key).toBe(forIvy.body.listing.key);
  expect((await ivy.get("/listings")).body.listings.map((l: { key: string }) => l.key)).toEqual([forIvy.body.listing.key]);
  expect((await ike.get("/listings")).body.listings.map((l: { key: string }) => l.key)).toEqual([forIke.body.listing.key]);
  // Neither reaches the other's.
  expectError(await ike.get(`/listings/${encodeURIComponent(forIvy.body.listing.key)}`), 404, "not_found");
  // And each is counted on its own account.
  for (const who of agents) {
    expect((await admin.get(`/accounts/${who}`)).body.account.counts.own_listings).toBe(1);
  }

  // Before Ike has signed in, his email changes, and the invitation goes with it: he signs in with the new one.
  const newEmail = `ike.moved.${id}@example.com`;
  const moved = await admin.patch(`/accounts/${agents[1]}`, { email: newEmail });
  expect(moved.status, moved.text).toBe(200);
  expect(moved.body.account).toMatchObject({ email: newEmail, signed_in: false });
  const ikePage = await testSignIn(browser, newEmail);
  await ikePage.goto("/dashboard/listings");
  await expect(ikePage.getByRole("main")).toContainText(address);
  expect((await admin.get(`/accounts/${agents[1]}`)).body.account).toMatchObject({ email: newEmail, signed_in: true, role: "agent" });
});

test("deleting asks for the account's email, never takes the owner's, and leaves it gone; the log has every change", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const id = unique();
  const owner = await signIn(browser, OWNER);
  const keyName = `Cleanup ${id.slice(-4)}`;
  const key = await makeAdminKey(owner, keyName);
  const admin = await Admin.as(key);
  const ownerId = (await admin.get("/me")).body.owner.id;

  const email = `del.admin.${id}@example.com`;
  const made = await admin.post("/accounts", { email, role: "agent", full_name: "Dell Gone", brokerage: "Gone Realty" });
  expect(made.status, made.text).toBe(201);
  const account = made.body.account;
  const asDell = await Api.as(key, { "Porchcard-Account": account.id });
  const address = `${id.slice(-5)} Deleted Dr`;
  const listing = await asDell.post("/listings", {
    address,
    city: "Kent",
    state: "WA",
    zip: "98030",
    price: 300000,
    beds: 3,
    baths: 2,
    sqft: 1500,
  });
  expect(listing.status, listing.text).toBe(201);
  expect((await asDell.post(`/listings/${encodeURIComponent(listing.body.listing.key)}/photos`, { data: await imageDataUrl(400, 300) })).status).toBe(201);
  const changed = await admin.patch(`/accounts/${account.id}`, { bio: "Here today." });
  expect(changed.status).toBe(200);
  const visitor = await (await browser.newContext(DESKTOP)).newPage();
  const profilePath = new URL(account.profile_url).pathname;
  expect((await visitor.goto(profilePath))!.status()).toBe(200);

  // No confirm, or the wrong one: nothing happens.
  expectError(await admin.delete(`/accounts/${account.id}`), 400, "invalid_request", "confirm");
  expectError(await admin.delete(`/accounts/${account.id}?confirm=${encodeURIComponent(OWNER)}`), 400, "invalid_request", "confirm");
  expect((await admin.get(`/accounts/${account.id}`)).status).toBe(200);
  // The owner's own account: never.
  expectError(await admin.delete(`/accounts/${ownerId}?confirm=${encodeURIComponent(OWNER)}`), 409, "conflict");

  // The right email, in any case: gone, profile and all.
  const gone = await admin.delete(`/accounts/${account.id}?confirm=${encodeURIComponent(email.toUpperCase())}`);
  expect(gone.status, gone.text).toBe(204);
  expect(gone.text).toBe("");
  expectError(await admin.get(`/accounts/${account.id}`), 404, "not_found");
  expectError(await admin.delete(`/accounts/${account.id}?confirm=${encodeURIComponent(email)}`), 404, "not_found");
  expect((await visitor.goto(profilePath))!.status()).toBe(404);
  expect((await visitor.goto(`/homes/${encodeURIComponent(listing.body.listing.key)}`))!.status()).toBe(404);
  // Acting as them now finds no agent.
  expectError(await asDell.get("/me"), 404, "not_found");
  // The docs say what goes and what stays, as deleteAccount does it.
  await owner.goto("/admin/api");
  const deleteDocs = owner.locator("#admin-delete-account");
  await expect(deleteDocs).toContainText("their likes and comments on profiles and public homes");
  await expect(deleteDocs).toContainText("their place stays under their first name, with what they liked and said there");
  await expect(deleteDocs).toContainText("A sign-up form they filled in stays");
  // The owner is still there.
  expect((await admin.get(`/accounts/${ownerId}`)).body.account).toMatchObject({ owner: true, email: OWNER });

  // The log: every change made with this key, newest first, about the account it was about, and
  // never a read or a query string (the confirm email).
  const log = await admin.get("/log?limit=100");
  expect(log.status, log.text).toBe(200);
  const mine = log.body.entries.filter((e: { key: { name: string } | null }) => e.key?.name === keyName);
  const summary = mine.map((e: { method: string; path: string; status: number; account_id: string | null }) => [
    e.method,
    e.path,
    e.status,
    e.account_id,
  ]);
  const listingPath = `/api/v1/listings/${encodeURIComponent(listing.body.listing.key)}/photos`;
  expect(summary).toEqual([
    ["DELETE", `/api/admin/v1/accounts/${account.id}`, 404, account.id],
    ["DELETE", `/api/admin/v1/accounts/${account.id}`, 204, account.id],
    ["DELETE", `/api/admin/v1/accounts/${ownerId}`, 409, ownerId],
    ["DELETE", `/api/admin/v1/accounts/${account.id}`, 400, account.id],
    ["DELETE", `/api/admin/v1/accounts/${account.id}`, 400, account.id],
    ["PATCH", `/api/admin/v1/accounts/${account.id}`, 200, account.id],
    ["POST", listingPath, 201, account.id],
    ["POST", "/api/v1/listings", 201, account.id],
    ["POST", "/api/admin/v1/accounts", 201, account.id],
  ]);
  expect(mine[0].key).toEqual({ name: keyName, prefix: key.slice(0, 14) });
  expect(log.text).not.toContain("confirm");
  for (let i = 1; i < mine.length; i++) expect(mine[i - 1].created_at >= mine[i].created_at).toBe(true);
  expect(log.body.total).toBeGreaterThanOrEqual(mine.length);
  expect((await admin.get("/log?limit=2")).body.entries).toHaveLength(2);
  expectError(await admin.get("/log?limit=101"), 400, "invalid_request", "limit");
});
