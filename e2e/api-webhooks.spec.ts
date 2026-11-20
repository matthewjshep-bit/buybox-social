// Webhooks: an agent's own tool (their CRM, Zapier, Make) told the moment a
// client does something on one of the agent's links: opens it, likes a home,
// passes on one, says something, asks to see one. Each is signed with the
// webhook's secret (shown once, when it's added), says who by first name
// only, and never carries an email address. Added with the API or on Edit
// profile, where the agent sees how the last one went and can send a test.
import { expect, test } from "@playwright/test";
import { Api, answers, expectError, expectNothingPrivate, expectSigned, makeKey, receiver, toolsCard } from "./api-helpers";
import { homeIn, joinAs, openComments, signInAgent, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const ALL_EVENTS = ["link.opened", "home.liked", "home.passed", "comment.created", "showing.requested"];

test.beforeEach(() => {
  answers.length = 0;
});

test.afterEach(() => {
  expectNothingPrivate();
});

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;

test("a tool's webhook hears each thing a client does on a link, signed, by first name, with no email", async ({ browser }) => {
  test.setTimeout(150_000);
  const id = unique();
  const jamieEmail = `jamie.hooks.${id}@example.com`;
  const hooks = await receiver();
  try {
    const agent = await signInAgent(browser, `api.hooks.${id}@example.com`, "Wren Hooks");
    const tool = await Api.as(await makeKey(agent, "GoHighLevel"));

    // The tool adds its address: every event, and the secret, this once.
    const added = await tool.post("/webhooks", { url: hooks.url() });
    expect(added.status, added.text).toBe(201);
    const { webhook, secret } = added.body;
    expect(secret).toMatch(/^whsec_[A-Za-z0-9]{32}$/);
    expect(webhook).toMatchObject({ url: hooks.url(), events: ALL_EVENTS, active: true, last_delivery: null });
    // Listed after, never with the secret.
    const listed = await tool.get("/webhooks");
    expect(listed.body.webhooks.map((w: { id: string }) => w.id)).toEqual([webhook.id]);
    expect(listed.text).not.toContain(secret);

    const made = await tool.post("/links", { homes: ["SAMPLE-1009", "SAMPLE-1008"], people: [{ first_name: "Jamie" }] });
    expect(made.status, made.text).toBe(201);
    const linkId = made.body.link.id;

    // Each delivery: the event it says it is, for this link, signed, and nothing private in it.
    const check = (delivery: Awaited<ReturnType<typeof hooks.next>>, event: string) => {
      expect(delivery.path).toBe("/hooks/porchcard");
      expect(delivery.headers["content-type"]).toBe("application/json");
      expect(delivery.headers["user-agent"]).toBe("Porchcard-Webhooks/1");
      expect(delivery.headers["porchcard-delivery"]).toMatch(/^[0-9a-f-]{36}$/);
      expectSigned(delivery, secret);
      expect(delivery.raw).not.toContain("@");
      expect(delivery.raw).not.toContain(jamieEmail);
      expect(delivery.json).toMatchObject({ type: event, data: { link: { id: linkId } } });
      expect(delivery.json.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(delivery.json.data.link.dashboard_url).toMatch(new RegExp(`/dashboard/shares/${linkId}$`));
      expect(delivery.json.data.client.name).toBe("Jamie");
      return delivery.json.data;
    };

    // Jamie opens her link: link.opened, by the name the agent gave her (she hasn't signed up).
    const jamie = await (await browser.newContext()).newPage();
    await jamie.goto(made.body.people[0].url);
    const opened = check(await hooks.next("link.opened"), "link.opened");
    expect(opened.client).toEqual({ id: "name:jamie", name: "Jamie", profile_url: null });
    expect(opened.home).toBeUndefined();

    // She passes on the first home (signing up as she does), on to the second.
    await toFirstHome(jamie);
    const quillan = homeIn(jamie, QUILLAN);
    await quillan.getByRole("button", { name: "Pass on this home" }).click();
    await joinAs(jamie, "Jamie", jamieEmail);
    const saltmarsh = homeIn(jamie, SALTMARSH);
    await expect(saltmarsh).toBeInViewport({ ratio: 0.9 });
    const passed = check(await hooks.next("home.passed"), "home.passed");
    expect(passed.home).toMatchObject({ key: "SAMPLE-1009", address: QUILLAN, city: "Olympia", price: 465000 });
    expect(passed.home.url).toMatch(/\/homes\/SAMPLE-1009$/);
    // Signed up now: the same id GET /clients gives her, and her public page.
    const jamieClient = (await tool.get("/clients")).body.clients.find((c: { name: string }) => c.name === "Jamie");
    expect(jamieClient.id).toMatch(/^acct:/);
    expect(passed.client).toEqual({ id: jamieClient.id, name: "Jamie", profile_url: jamieClient.profile_url });

    // Likes the second.
    await expect.poll(async () => Math.abs((await saltmarsh.boundingBox())?.y ?? 99)).toBeLessThan(1);
    const heart = saltmarsh.getByRole("button", { name: /^Like (?!the )(?!.*\bcomment\b)/ });
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    const liked = check(await hooks.next("home.liked"), "home.liked");
    expect(liked.home).toMatchObject({ key: "SAMPLE-1008", address: SALTMARSH, city: "Edmonds", price: 689000 });
    expect(liked.client.id).toBe(jamieClient.id);

    // Says something about it.
    const said = "Is the deck new?";
    const chat = await openComments(jamie, saltmarsh);
    await chat.getByRole("textbox").first().fill(said);
    await chat.getByRole("textbox").first().press("Enter");
    await expect(chat.getByText(said)).toBeVisible();
    await jamie.keyboard.press("Escape");
    await expect(chat).toBeHidden();
    const comment = check(await hooks.next("comment.created"), "comment.created");
    expect(comment.home.key).toBe("SAMPLE-1008");
    expect(comment.comment.body).toBe(said);
    expect(comment.comment.id).toMatch(/^[0-9a-f-]{36}$/);

    // Asks to see it.
    await jamie.getByRole("button", { name: "Contact" }).click();
    const contact = jamie.getByRole("dialog", { name: /^Contact / });
    await contact.getByRole("button", { name: "Ask to see it" }).click();
    await expect(contact.getByRole("status")).toHaveText(/^Sent\./);
    const asked = check(await hooks.next("showing.requested"), "showing.requested");
    expect(asked.home.key).toBe("SAMPLE-1008");
    expect(asked.client.id).toBe(jamieClient.id);

    // Each thing once, nothing else.
    expect(hooks.deliveries.map((d) => d.headers["porchcard-event"]).sort()).toEqual([...ALL_EVENTS].sort());

    // A test, on demand: a ping, signed the same way, and the answer says it got there.
    const tested = await tool.post(`/webhooks/${webhook.id}/test`);
    expect(tested.status, tested.text).toBe(200);
    expect(tested.body.delivery).toEqual({ status: 200, ok: true, error: null });
    const ping = await hooks.next("ping");
    expectSigned(ping, secret);
    expect(ping.json).toMatchObject({ type: "ping", data: { webhook: { id: webhook.id } } });

    // How the last one went, to the tool, and on the agent's card.
    const after = (await tool.get("/webhooks")).body.webhooks[0];
    expect(after.last_delivery).toMatchObject({ event: "ping", ok: true, status: 200 });
    expect(after.failures).toBe(0);
    await agent.goto("/people/me/edit");
    const row = toolsCard(agent).getByRole("list", { name: "Your webhooks" }).getByRole("listitem");
    await expect(row).toContainText(hooks.url());
    await expect(row).toContainText("Everything a client does");
    await expect(row).toContainText("Test delivered just now");

    // Removed: gone, and the next thing Jamie does isn't sent anywhere.
    expect((await tool.delete(`/webhooks/${webhook.id}`)).body).toEqual({ deleted: true });
    expect((await tool.get("/webhooks")).body.webhooks).toEqual([]);
    expectError(await tool.post(`/webhooks/${webhook.id}/test`), 404, "not_found");
    const before = hooks.deliveries.length;
    await jamie.reload();
    await jamie.waitForTimeout(1500);
    expect(hooks.deliveries.length).toBe(before);
  } finally {
    await hooks.close();
  }
});

test("a webhook added on Edit profile: its secret once, the events ticked, a test that gets there, and Remove", async ({ browser }) => {
  test.setTimeout(120_000);
  const id = unique();
  const hooks = await receiver();
  try {
    const agent = await signInAgent(browser, `ui.hooks.${id}@example.com`, "Vic Hooks");
    await agent.goto("/people/me/edit");
    const card = toolsCard(agent);
    await expect(card).toContainText("No webhooks yet.");

    // An address on a private network isn't taken, and says why, by the field.
    const address = card.getByLabel("Address to send to");
    await address.fill("https://169.254.169.254/latest/meta-data");
    await card.getByRole("button", { name: "Add", exact: true }).click();
    await expect(card.getByRole("alert")).toHaveText("That address is on a private network. Use one on the public internet.");
    await expect(address).toHaveAttribute("aria-invalid", "true");
    await expect(card).toContainText("No webhooks yet.");

    // All five ticked to start with; one left out.
    const events = card.getByRole("group", { name: "Tell it when a client has" });
    for (const label of ["Opened a link", "Liked a home", "Passed on a home", "Commented", "Asked to see a home"]) {
      await expect(events.getByLabel(label)).toBeChecked();
    }
    await events.getByLabel("Asked to see a home").uncheck();
    await address.fill(hooks.url("/from-the-card"));
    await card.getByRole("button", { name: "Add", exact: true }).click();
    const shown = card.getByRole("group", { name: "Your webhook's signing secret" });
    await expect(shown).toBeVisible();
    await expect(shown).toContainText("Copy it now. You won't see it again.");
    await expect(shown.getByRole("button", { name: "Copy" })).toBeVisible();
    const secret = await shown.getByRole("textbox").inputValue();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9]{32}$/);
    const row = card.getByRole("list", { name: "Your webhooks" }).getByRole("listitem");
    await expect(row).toContainText(hooks.url("/from-the-card"));
    await expect(row).toContainText("Opened a link, Liked a home, Passed on a home, Commented");
    await expect(row).toContainText("Nothing sent yet");

    // Send test: it gets there, signed with that secret, and the row says so.
    await row.getByRole("button", { name: "Send test" }).click();
    await expect(row).toContainText("The test got there.");
    const ping = await hooks.next("ping");
    expect(ping.path).toBe("/from-the-card");
    expectSigned(ping, secret);
    await agent.reload();
    await expect(row).toContainText("Test delivered just now");
    // Never the secret again.
    await expect(card.getByRole("group", { name: "Your webhook's signing secret" })).toHaveCount(0);
    expect(await agent.content()).not.toContain(secret);

    // The tool sees the same webhook, with only the events ticked.
    const tool = await Api.as(await makeKey(agent, "Zapier"));
    const listed = (await tool.get("/webhooks")).body.webhooks;
    expect(listed).toHaveLength(1);
    expect(listed[0].events).toEqual(["link.opened", "home.liked", "home.passed", "comment.created"]);

    // Remove, asked once more: gone.
    await agent.goto("/people/me/edit");
    await row.getByRole("button", { name: /^Remove/ }).click();
    await card.getByRole("button", { name: "Remove webhook" }).click();
    await expect(card).toContainText("No webhooks yet.");
    expect((await tool.get("/webhooks")).body.webhooks).toEqual([]);
  } finally {
    await hooks.close();
  }
});

test("a webhook address that isn't https on the public internet is refused, and another agent can't touch one", async ({
  browser,
}) => {
  const id = unique();
  const hooks = await receiver();
  try {
    const agent = await signInAgent(browser, `api.hookcheck.${id}@example.com`, "Ula Urls");
    const tool = await Api.as(await makeKey(agent, "Make"));
    for (const url of [
      "https://169.254.169.254/x",
      "https://10.0.0.1/hook",
      "https://192.168.1.20/hook",
      "https://[::ffff:10.0.0.1]/hook",
      "ftp://x",
      "ftp://example.com/hook",
      "not a url",
      "https://user:pass@example.com/hook",
    ]) {
      const refused = await tool.post("/webhooks", { url });
      expectError(refused, 400, "invalid_request", "url");
    }
    expectError(await tool.post("/webhooks", { url: "https://example.com/hook", events: ["home.bought"] }), 400, "invalid_request", "events");
    expectError(await tool.post("/webhooks", { url: "https://example.com/hook", events: [] }), 400, "invalid_request", "events");
    expect((await tool.get("/webhooks")).body.webhooks).toEqual([]);

    // One that's fine, then another agent's key: not theirs to test, remove or see.
    const mine = (await tool.post("/webhooks", { url: hooks.url(), events: ["home.liked"] })).body.webhook;
    expect(mine.events).toEqual(["home.liked"]);
    const other = await signInAgent(browser, `api.hookother.${id}@example.com`, "Oz Other");
    const otherTool = await Api.as(await makeKey(other, "Make"));
    expect((await otherTool.get("/webhooks")).body.webhooks).toEqual([]);
    expectError(await otherTool.post(`/webhooks/${mine.id}/test`), 404, "not_found");
    expectError(await otherTool.delete(`/webhooks/${mine.id}`), 404, "not_found");
    expect(hooks.deliveries).toHaveLength(0);
    expect((await tool.get("/webhooks")).body.webhooks.map((w: { id: string }) => w.id)).toEqual([mine.id]);
  } finally {
    await hooks.close();
  }
});
