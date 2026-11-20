// The owner brings in what people said about a home somewhere else (app/api/
// admin/v1/visitors, homes/{key}/…): a person with a first name and no
// account, their like or pass, a dislike on a spot in a photo, and comments
// dated when they were said, all on the home's page as anyone's would be.
// Deleting the person takes all of it. Only people brought in can be written
// for, and an agent's key reaches none of it. The owner can also delete any
// agent's link, named by who sent it.
import sharp from "sharp";
import { expect, request, test, type APIRequestContext, type Browser } from "@playwright/test";
import { Api, answers, expectError, makeKey, type ApiResult } from "./api-helpers";
import { enterCode, pastNameStep, signInAgent } from "./helpers";

const OWNER = "matt@shepflips.com";
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

test.beforeEach(() => {
  answers.length = 0;
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

async function makeAdminKey(browser: Browser, name: string) {
  const owner = await signIn(browser, OWNER);
  await owner.goto("/admin/api");
  await owner.getByLabel("Name", { exact: true }).fill(name);
  await owner.getByRole("button", { name: "Make a key" }).click();
  const shown = owner.getByRole("group", { name: `Your admin key for ${name}` });
  const key = await shown.getByRole("textbox").inputValue();
  await shown.getByRole("button", { name: "Done" }).click();
  return { owner, key };
}

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
    return { status: response.status(), headers, body, text };
  }

  get = async (path: string) => this.read(await this.context.get(`/api/admin/v1${path}`));
  post = async (path: string, data?: unknown, headers?: Record<string, string>) =>
    this.read(await this.context.post(`/api/admin/v1${path}`, { data, headers }));
  put = async (path: string, data?: unknown) => this.read(await this.context.put(`/api/admin/v1${path}`, { data }));
  delete = async (path: string) => this.read(await this.context.delete(`/api/admin/v1${path}`));
}

async function imageDataUrl(width: number, height: number) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: { r: 140, g: 120, b: 90 } } })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

// An agent with one listing of their own, with a photo, made through the API as them.
async function agentWithListing(browser: Browser, key: string, id: string) {
  const admin = await Admin.as(key);
  const made = await admin.post("/accounts", { email: `quill.import.${id}@example.com`, role: "agent", full_name: "Quill Larkspur" });
  expect(made.status, made.text).toBe(201);
  const agentId = made.body.account.id as string;
  const asAgent = await Api.as(key, { "Porchcard-Account": agentId });
  const listing = await asAgent.post("/listings", {
    address: `${id.slice(-4)} Fernhollow Rd`,
    city: "Tacoma",
    state: "WA",
    zip: "98405",
    price: 310000,
    beds: 3,
    baths: 1,
    sqft: 1200,
  });
  expect(listing.status, listing.text).toBe(201);
  const homeKey = listing.body.listing.key as string;
  const photo = await asAgent.post(`/listings/${homeKey}/photos`, { data: await imageDataUrl(800, 600) });
  expect(photo.status, photo.text).toBe(201);
  const home = await asAgent.get(`/listings/${homeKey}`);
  return { admin, agentId, asAgent, homeKey, photoUrl: home.body.listing.photos[0] as string };
}

test("people brought in like, pass, dislike a spot in a photo and comment on a home's page; deleting one takes it all", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const id = unique();
  const { key } = await makeAdminKey(browser, `Import ${id.slice(-4)}`);
  const { admin, homeKey, photoUrl } = await agentWithListing(browser, key, id);

  // A person: made once, found again by the same ref.
  const ref = `crm-${id}`;
  const made = await admin.post("/visitors", { first_name: "  Brindle   T. ", ref });
  expect(made.status, made.text).toBe(201);
  const person = made.body.visitor;
  expect(person).toMatchObject({ first_name: "Brindle T.", ref });
  const again = await admin.post("/visitors", { first_name: "Brindle T.", ref });
  expect(again.status).toBe(200);
  expect(again.body.visitor.id).toBe(person.id);
  expectError(await admin.post("/visitors", { first_name: "", ref: `x-${id}` }), 400, "invalid_request", "first_name");
  expectError(await admin.post("/visitors", { first_name: "Ok", ref: "has space" }), 400, "invalid_request", "ref");
  const listed = await admin.get("/visitors?limit=100");
  expect(listed.body.visitors.map((v: { id: string }) => v.id)).toContain(person.id);

  // A pass on the price.
  const pass = await admin.put(`/homes/${homeKey}/reactions`, {
    visitor: person.id,
    reaction: "dislike",
    disliked: ["price"],
  });
  expect(pass.status, pass.text).toBe(200);
  expect(pass.body.reaction).toMatchObject({ reaction: "dislike", liked: [], disliked: ["price"] });
  expectError(
    await admin.put(`/homes/${homeKey}/reactions`, { visitor: person.id, reaction: "like", liked: ["moat"] }),
    400,
    "invalid_request",
    "liked",
  );
  expectError(await admin.put(`/homes/OWN-nothing-here/reactions`, { visitor: person.id, reaction: "like" }), 404, "not_found");
  expectError(
    await admin.put(`/homes/${homeKey}/reactions`, { visitor: "00000000-0000-4000-8000-000000000000", reaction: "like" }),
    404,
    "not_found",
  );

  // A dislike on a spot in the photo, and a comment there, dated when it was said.
  // (An own listing's photo goes by its id, the last part of its address.)
  const photoKey = new URL(photoUrl).pathname.split("/").pop()!;
  const spot = "@42.5,61";
  const dislike = await admin.put(`/homes/${homeKey}/photo-reactions`, {
    visitor: person.id,
    media_key: photoKey,
    tag: spot,
    reaction: "dislike",
  });
  expect(dislike.status, dislike.text).toBe(200);
  expectError(
    await admin.put(`/homes/${homeKey}/photo-reactions`, {
      visitor: person.id,
      media_key: "/listing-photo/not-a-photo",
      tag: spot,
      reaction: "dislike",
    }),
    400,
    "invalid_request",
    "tag",
  );

  const at = "2026-10-02T17:30:00.000Z";
  const retry = { "Idempotency-Key": `comment-${id}` };
  const words = { visitor: person.id, body: "The wiring in this corner looks original.", media_key: photoKey, spot, at };
  const said = await admin.post(`/homes/${homeKey}/comments`, words, retry);
  expect(said.status, said.text).toBe(201);
  expect(said.body.comment).toMatchObject({ body: words.body, spot, created_at: at });
  // A retry with the same key says it once.
  const resaid = await admin.post(`/homes/${homeKey}/comments`, words, retry);
  expect(resaid.body.comment.id).toBe(said.body.comment.id);
  expectError(
    await admin.post(`/homes/${homeKey}/comments`, { ...words, at: "2999-01-01T00:00:00Z" }),
    400,
    "invalid_request",
    "at",
  );
  expectError(
    await admin.post(`/homes/${homeKey}/comments`, { visitor: person.id, body: "x", spot }),
    400,
    "invalid_request",
    "spot",
  );

  // The owner answers their pass, as the owner.
  const answer = await admin.post(`/homes/${homeKey}/comments`, {
    visitor: "owner",
    body: "Fair. We priced it for a full rehab.",
    parent: `like:${person.id}`,
  });
  expect(answer.status, answer.text).toBe(201);
  // Only people brought in, or the owner: the owner's own visitor id is refused.
  const ownerVisitor = answer.body.comment.visitor as string;
  expectError(await admin.put(`/homes/${homeKey}/reactions`, { visitor: ownerVisitor, reaction: "like" }), 404, "not_found");

  // On the home's page, for anyone.
  const visitorPage = await (await browser.newContext(DESKTOP)).newPage();
  await visitorPage.goto(`/homes/${homeKey}`);
  await expect(visitorPage.getByText(words.body).first()).toBeVisible();
  await expect(visitorPage.getByText("Brindle T.").first()).toBeVisible();

  // An agent's key reaches none of it.
  const agentPage = await signInAgent(browser, `import.agent.${id}@example.com`, "Ivo Keyholder");
  const agentAdmin = await Admin.as(await makeKey(agentPage, "Mine"));
  for (const result of [
    await agentAdmin.get("/visitors"),
    await agentAdmin.post("/visitors", { first_name: "Nope", ref: `n-${id}` }),
    await agentAdmin.put(`/homes/${homeKey}/reactions`, { visitor: person.id, reaction: "like" }),
    await agentAdmin.post(`/homes/${homeKey}/comments`, { visitor: person.id, body: "no" }),
    await agentAdmin.post("/sample-data/clear"),
    await agentAdmin.delete(`/visitors/${person.id}`),
  ]) {
    expectError(result, 401, "unauthorized");
  }

  // Deleted, with all they said (and the reply under their likes); never a person who joined on their own.
  expectError(await admin.delete(`/visitors/${ownerVisitor}`), 404, "not_found");
  const gone = await admin.delete(`/visitors/${person.id}`);
  expect(gone.status, gone.text).toBe(204);
  await visitorPage.reload();
  await expect(visitorPage.getByText(words.body)).toHaveCount(0);
  await expect(visitorPage.getByText("Brindle T.")).toHaveCount(0);
  expectError(await admin.delete(`/visitors/${person.id}`), 404, "not_found");

  // Every write is in the log.
  const log = await admin.get("/log?limit=100");
  const paths = log.body.entries.map((e: { method: string; path: string }) => `${e.method} ${e.path}`);
  expect(paths).toContain(`PUT /api/admin/v1/homes/${homeKey}/reactions`);
  expect(paths).toContain(`DELETE /api/admin/v1/visitors/${person.id}`);
});

test("the owner deletes any agent's link, opened or not, only when named with who sent it", async ({ browser }) => {
  test.setTimeout(150_000);
  const id = unique();
  const { key } = await makeAdminKey(browser, `Links ${id.slice(-4)}`);
  const { admin, agentId, asAgent, homeKey } = await agentWithListing(browser, key, id);

  const sent = await asAgent.post("/links", { homes: [homeKey], people: [{ first_name: "Wren" }] });
  expect(sent.status, sent.text).toBe(201);
  const linkId = sent.body.link.id as string;

  expectError(await admin.delete(`/links/${linkId}`), 400, "invalid_request", "agent");
  expectError(await admin.delete(`/links/${linkId}?agent=00000000-0000-4000-8000-000000000000`), 404, "not_found");
  const gone = await admin.delete(`/links/${linkId}?agent=${agentId}`);
  expect(gone.status, gone.text).toBe(204);
  expectError(await asAgent.get(`/links/${linkId}`), 404, "not_found");
  // The home stays theirs.
  expect((await asAgent.get(`/listings/${homeKey}`)).status).toBe(200);
});
