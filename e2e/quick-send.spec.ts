import { expect, test, type Browser, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, signInAgent, signUpBuyer } from "./helpers";

type Shared = { title?: string; text?: string; url?: string; inTap: boolean };
type Stubbed = { shared: Shared[]; shareAnswer: "send" | "cancel"; inTap: boolean };

// The phone's share sheet, stood in for: it notes what it was handed and
// whether that came in the tap itself, then sends, or is closed unsent.
function stubShareSheet() {
  const w = window as unknown as Stubbed;
  w.shared = [];
  w.shareAnswer = "send";
  w.inTap = false;
  document.addEventListener(
    "click",
    () => {
      w.inTap = true;
      setTimeout(() => (w.inTap = false));
    },
    true,
  );
  Object.defineProperty(Navigator.prototype, "share", {
    configurable: true,
    value: (data: ShareData) => {
      w.shared.push({ ...data, inTap: w.inTap });
      if (w.shareAnswer === "cancel") return Promise.reject(new DOMException("Share canceled", "AbortError"));
      return Promise.resolve();
    },
  });
}

const shared = (page: Page) => page.evaluate(() => (window as unknown as Stubbed).shared);

// Every link name the server hands this page, in order: the one waiting for
// Send ("token") and the one for the Send after ("nextToken"). Read on the way
// in, since the browser keeps no copy of an answer it streamed.
async function watchLinkNames(page: Page) {
  const seen = { token: [] as string[], nextToken: [] as string[] };
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.fallback();
    const response = await route.fetch();
    const body = await response.text();
    for (const field of ["token", "nextToken"] as const) {
      const found = body.match(new RegExp(`"${field}":"([\\w-]{32})"`));
      if (found) seen[field].push(found[1]);
    }
    await route.fulfill({ response, body });
  });
  return seen;
}

// An agent on a home, with a link waiting for Send.
async function agentOnHome(page: Page, key = "SAMPLE-1004") {
  await page.context().addInitScript(stubShareSheet);
  const seen = await watchLinkNames(page);
  await page.goto(`/homes/${key}`);
  await expect.poll(() => seen.token.length).toBe(1);
  return { seen, token: seen.token[0] };
}

const sendButton = (page: Page, address: string) =>
  homeIn(page, address).getByRole("button", { name: /^(Send to a client|Share)$/ });

async function visitor(browser: Browser) {
  const page = await (await browser.newContext()).newPage();
  await page.context().addInitScript(stubShareSheet);
  return page;
}

test("one tap on Send: the share sheet opens at once on a new link to the home, and the link greets who it's for", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "sam-send@example.com", "Sam Sender");
  const other = await createShare(agent, ["1880 Tamsen"], ["Pat"]);
  const { seen, token } = await agentOnHome(agent);

  // The share sheet gets the link in the tap itself, with nothing waited for first.
  await sendButton(agent, "96 Fernhollow Ln").click();
  const sheet = agent.getByRole("dialog", { name: "Sent. Who's it for?" });
  await expect(sheet).toBeVisible();
  const [handed] = await shared(agent);
  expect(handed.inTap).toBe(true);
  expect(handed.title).toBe("A home for you");
  expect(handed.text).toBe("I picked a home for you: 96 Fernhollow Ln, $839,000. Tell me what you think.");
  expect(handed.url).toMatch(/\/s\/[\w-]{32}$/);
  expect(handed.url).toContain(`/s/${token}`);
  const url = handed.url!;
  await expect.poll(() => seen.nextToken.length).toBe(1);
  const nextToken = seen.nextToken[0];
  expect(nextToken).not.toBe(token);

  // The client opens it straight onto the home, from the agent.
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await expect(homeIn(client, "96 Fernhollow Ln")).toBeInViewport({ ratio: 0.9 });
  await expect(client.getByRole("heading", { level: 1 })).toHaveText("I picked this home for you");
  await expect(client.getByRole("banner").getByText("Sam Sender", { exact: true })).toBeVisible();

  // Saying who it was for greets them on the link they already have.
  await sheet.getByLabel("Their first name (optional)").fill("Toby");
  await sheet.getByRole("button", { name: "Add a note (optional)" }).click();
  await sheet.getByLabel("Add a note (optional)").fill("The one with the porch.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(agent.getByRole("status").filter({ hasText: "Saved. Their link greets Toby." })).toBeVisible();
  await expect(client.getByRole("heading", { level: 1 })).toHaveText("Toby, I picked this home for you", {
    timeout: 25_000,
  });

  // It's on the dashboard like any other link.
  await agent.goto("/dashboard");
  await expect(agent.getByRole("link", { name: /Toby/ })).toContainText("1 home · 96 Fernhollow Ln");

  // [P] The link carries nothing of the agent's but what they chose to show,
  // and no other link: not another client's, not the one waiting for the next Send.
  const html = await (await request.get(url)).text();
  expect(html).not.toContain("sam-send@example.com");
  expect(html).not.toContain(other.url.split("/s/")[1]);
  expect(html).not.toContain(nextToken);
  expect(html).not.toContain("1880 Tamsen");
  // A link name never used is no link at all.
  expect((await request.get(`/s/${nextToken}`)).status()).toBe(404);
});

test("closing the share sheet unsent leaves no link behind, and a link that didn't save says so", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "cass-cancel@example.com", "Cass Cancel");
  const { seen, token } = await agentOnHome(agent);

  await agent.evaluate(() => ((window as unknown as Stubbed).shareAnswer = "cancel"));
  await sendButton(agent, "96 Fernhollow Ln").click();
  await expect(agent.getByRole("status").filter({ hasText: "Not sent" })).toBeVisible();
  await expect(agent.getByRole("dialog", { name: "Sent. Who's it for?" })).toBeHidden();
  expect((await shared(agent))[0].url).toContain(`/s/${token}`);
  expect((await request.get(`/s/${token}`)).status()).toBe(404);
  await agent.goto("/dashboard");
  await expect(agent.getByRole("link", { name: /96 Fernhollow/ })).toHaveCount(0);

  // The home goes between the tap and the link being made. A test can't mark a
  // sample home sold, so this asks for a home that isn't listed: the link isn't
  // made, and the agent is told to send again.
  await agent.goto("/homes/SAMPLE-1004");
  await expect.poll(() => seen.token.length).toBe(2);
  const second = seen.token[1];
  await agent.route("**/homes/SAMPLE-1004", async (route) => {
    const body = route.request().postData();
    if (route.request().method() !== "POST" || !body?.includes(second)) return route.fallback();
    await route.fallback({ postData: body.replace("SAMPLE-1004", "SAMPLE-SOLD") });
  });
  await sendButton(agent, "96 Fernhollow Ln").click();
  // The share sheet has already handed the link over, so the agent is told it won't open.
  const sheet = agent.getByRole("dialog", { name: "That link didn't save" });
  await expect(sheet.getByRole("alert")).toHaveText(
    "The link you just sent won't open. Tap Send again and send the new one.",
  );
  await expect(sheet.getByRole("button", { name: "Save" })).toHaveCount(0);
  expect((await request.get(`/s/${second}`)).status()).toBe(404);
});

test("Undo send takes back an unopened link, and a home meant for an existing client goes on their link", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "uma-undo@example.com", "Uma Undo");
  const nina = await createShare(agent, ["4127 Larkmoor"], ["Nina"]);
  const { seen } = await agentOnHome(agent);
  const sheet = agent.getByRole("dialog", { name: "Sent. Who's it for?" });

  // Undo, before anyone has opened it: the link stops working. Changing your
  // mind first puts the cursor back where it was.
  await sendButton(agent, "96 Fernhollow Ln").click();
  await sheet.getByRole("button", { name: "Undo send" }).click();
  await expect(sheet.getByText("The link will stop working.")).toBeVisible();
  await sheet.getByRole("button", { name: "Keep it" }).click();
  await expect(sheet.getByRole("button", { name: "Undo send" })).toBeFocused();
  await sheet.getByRole("button", { name: "Undo send" }).click();
  await sheet.getByRole("button", { name: "Undo send" }).click();
  await expect(agent.getByRole("status").filter({ hasText: "Undone. The link has stopped working." })).toBeVisible();
  const undone = (await shared(agent))[0].url!;
  expect((await request.get(undone)).status()).toBe(404);
  await expect.poll(() => seen.nextToken.length).toBe(1);

  // Meant for Nina, who already has a link: the home goes on hers instead.
  await sendButton(agent, "96 Fernhollow Ln").click();
  await sheet.getByRole("button", { name: "Meant for someone you've already sent homes to?" }).click();
  await expect(sheet.getByText("Their link will show this home. The link you just sent will stop working.")).toBeVisible();
  // Each client once, with the link's first home, so two of them can be told apart.
  await sheet.getByRole("button", { name: /^Nina · 1 home 4127 Larkmoor Ave NE · Sent / }).click();
  await expect(agent.getByRole("status").filter({ hasText: "Added to Nina's link." })).toBeVisible();
  const moved = (await shared(agent))[1].url!;
  expect(moved).not.toBe(undone);
  expect((await request.get(moved)).status()).toBe(404);
  const ninaPage = await (await browser.newContext()).newPage();
  await ninaPage.goto(nina.url);
  await expect(homeIn(ninaPage, "96 Fernhollow Ln")).toBeAttached();
  await expect.poll(() => seen.nextToken.length).toBe(2);

  // Once someone has used the link, it stays.
  await sendButton(agent, "96 Fernhollow Ln").click();
  await expect(sheet).toBeVisible();
  const kept = (await shared(agent))[2].url!;
  const client = await (await browser.newContext()).newPage();
  await client.goto(kept);
  await heartOf(homeIn(client, "96 Fernhollow Ln")).click();
  await joinAs(client, "Remy");
  await expect(heartOf(homeIn(client, "96 Fernhollow Ln"))).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "Undo send" }).click();
  await expect(sheet.getByText("The link will stop working.")).toBeVisible();
  await sheet.getByRole("button", { name: "Undo send" }).click();
  await expect(sheet.getByText("They've opened it. You can remove the home from your dashboard.")).toBeVisible();
  // The buttons went, so the cursor is on the answer rather than lost.
  await expect(sheet.getByText("They've opened it. You can remove the home from your dashboard.")).toBeFocused();
  expect((await request.get(kept)).status()).toBe(200);
});

test("on a computer, Send copies the message and link, and two open tabs never share a link", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "dana-desk@example.com", "Dana Desk");
  const desk = await browser.newContext({
    storageState: await agent.context().storageState(),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const first = await desk.newPage();
  const second = await desk.newPage();
  const [one, two] = await Promise.all([agentOnHome(first), agentOnHome(second)]);
  expect(one.token).not.toBe(two.token);
  // Neither is a link until it's sent.
  expect((await request.get(`/s/${one.token}`)).status()).toBe(404);
  expect((await request.get(`/s/${two.token}`)).status()).toBe(404);

  await first.bringToFront();
  await sendButton(first, "96 Fernhollow Ln").click();
  // Only copied so far, so the sheet doesn't say it's sent, and says (to a
  // screen reader too, as it opens) what was copied.
  const sheet = first.getByRole("dialog", { name: "Who's it for?" });
  await expect(sheet.getByText("Link copied. Paste it into a text or email.")).toBeVisible();
  await expect(sheet).toHaveAccessibleDescription("Link copied. Paste it into a text or email.");
  expect(await shared(first)).toEqual([]);
  const copied = await first.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(
    `I picked a home for you: 96 Fernhollow Ln, $839,000. Tell me what you think. ${new URL(first.url()).origin}/s/${one.token}`,
  );
  await expect
    .poll(async () => (await request.get(`/s/${one.token}`)).status(), { timeout: 10_000 })
    .toBe(200);
  expect((await request.get(`/s/${two.token}`)).status()).toBe(404);
});

test("buyers and visitors still share the public page; an agent without a name is asked for one; the map has Send", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // A buyer: the home's public page.
  const buyer = await signUpBuyer(browser, "bea-buyer@example.com", "Bea Buyer");
  await buyer.context().addInitScript(stubShareSheet);
  await buyer.goto("/homes/SAMPLE-1004");
  await homeIn(buyer, "96 Fernhollow Ln").getByRole("button", { name: "Share", exact: true }).click();
  await expect.poll(async () => (await shared(buyer))[0]?.url).toMatch(/\/homes\/SAMPLE-1004$/);
  await buyer.goto("/search");
  await expect(buyer.getByRole("region", { name: "Homes", exact: true }).getByRole("article").first()).toBeAttached();
  await expect(buyer.getByRole("button", { name: "Send this home" })).toHaveCount(0);

  // Someone signed out: the same.
  const anon = await visitor(browser);
  await anon.goto("/homes/SAMPLE-1004");
  await homeIn(anon, "96 Fernhollow Ln").getByRole("button", { name: "Share", exact: true }).click();
  await expect.poll(async () => (await shared(anon))[0]?.url).toMatch(/\/homes\/SAMPLE-1004$/);

  // An agent who hasn't said who they are yet: that first.
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto("/for-agents");
  await fresh.getByRole("link", { name: "Start free" }).click();
  await fresh.getByLabel("Email").fill("nell-noname@example.com");
  await fresh.getByRole("button", { name: "Continue" }).click();
  await fresh.waitForURL("**/dashboard/profile");
  await fresh.context().addInitScript(stubShareSheet);
  await fresh.goto("/homes/SAMPLE-1004");
  await sendButton(fresh, "96 Fernhollow Ln").click();
  const first = fresh.getByRole("dialog", { name: "Before you send" });
  await expect(first.getByText("Add your name and photo first so clients know it's from you.")).toBeVisible();
  await expect(first.getByRole("link", { name: "Add your name and photo" })).toHaveAttribute(
    "href",
    "/dashboard/profile",
  );
  expect(await shared(fresh)).toEqual([]);

  // Beside the map, where the homes have no buttons: a pill sends the one showing.
  const agent = await signInAgent(browser, "mae-map@example.com", "Mae Map");
  await agent.context().addInitScript(stubShareSheet);
  const seen = await watchLinkNames(agent);
  await agent.goto("/search");
  await expect.poll(() => seen.token.length).toBe(1);
  const [token] = seen.token;
  const homes = agent.getByRole("region", { name: "Homes", exact: true });
  const showing = (await homes.getByRole("article").first().getAttribute("aria-label"))!;
  // On a phone it sits beside the Map button, below the home's words, and
  // says which home it sends.
  const pill = agent.getByRole("button", { name: /^Send this home/ });
  const address = showing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(pill).toHaveAccessibleName(new RegExp(`^Send this home\\W+${address}$`));
  const words = await homes.getByRole("button", { name: /^Open full screen/ }).first().boundingBox();
  expect((await pill.boundingBox())!.y).toBeGreaterThanOrEqual(words!.y + words!.height);
  await pill.click();
  await expect(agent.getByRole("dialog", { name: "Sent. Who's it for?" })).toBeVisible();
  const [handed] = await shared(agent);
  expect(handed.url).toContain(`/s/${token}`);
  expect(handed.text).toContain(`I picked a home for you: ${showing}, $`);
});

test("a page gives back the link it held when it goes, so the map's pop-outs never use up the one beside the map", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const agent = await signInAgent(browser, "pia-popout@example.com", "Pia Popout");
  await agent.context().addInitScript(stubShareSheet);
  const seen = await watchLinkNames(agent);
  await agent.goto("/search");
  await expect.poll(() => seen.token.length).toBe(1);
  const [paneToken] = seen.token;

  // More pop-outs than an agent can hold links at once (20), each with its own.
  const popout = agent.getByRole("dialog", { name: "Home details" });
  for (let i = 1; i <= 21; i++) {
    await agent.evaluate(() => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push("/homes/SAMPLE-1005"));
    await expect(popout).toBeVisible();
    await expect.poll(() => seen.token.length).toBe(i + 1);
    await agent.goBack();
    await expect(popout).toBeHidden();
  }

  // The link beside the map still works.
  await agent.getByRole("button", { name: /^Send this home/ }).click();
  await expect(agent.getByRole("dialog", { name: "Sent. Who's it for?" })).toBeVisible();
  const [handed] = await shared(agent);
  expect(handed.url).toContain(`/s/${paneToken}`);
  await expect.poll(async () => (await request.get(handed.url!)).status(), { timeout: 10_000 }).toBe(200);
});

test("a link held for a day is never handed out: Send this home makes a new one instead", async ({ browser, request }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "lou-later@example.com", "Lou Later");
  await agent.clock.install();
  const { seen, token } = await agentOnHome(agent);

  // The phone tab comes back the next day, as it was.
  await agent.clock.setSystemTime(Date.now() + 24 * 60 * 60 * 1000);
  await sendButton(agent, "96 Fernhollow Ln").click();
  const draft = agent.getByRole("dialog", { name: "Send this home" });
  await expect(draft).toBeVisible();
  expect(await shared(agent)).toEqual([]);
  await expect(draft.getByText("96 Fernhollow Ln")).toBeVisible();

  // Made here, with a fresh tap to send it; the cursor goes to the new link.
  await draft.getByLabel("Their first name (optional)").fill("Ivy");
  await draft.getByRole("button", { name: "Create link" }).click();
  const link = draft.getByLabel("Your link is ready");
  await expect(link).toBeFocused();
  // One new name for the page's next Send (asked for at the tap), one for this link.
  await expect.poll(() => seen.token.length).toBe(3);
  const url = await link.inputValue();
  expect(url).toMatch(new RegExp(`/s/${seen.token[2]}$`));
  expect((await request.get(url)).status()).toBe(200);
  expect((await request.get(`/s/${token}`)).status()).toBe(404);
  await draft.getByRole("button", { name: "Close" }).click();
  await expect(draft).toBeHidden();

  // The next Send uses the page's new one.
  await sendButton(agent, "96 Fernhollow Ln").click();
  await expect(agent.getByRole("dialog", { name: "Sent. Who's it for?" })).toBeVisible();
  expect((await shared(agent))[0].url).toContain(`/s/${seen.token[1]}`);
});

test("the longer way to send one home starts with it picked, and keeps it in view", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "bo-builder@example.com", "Bo Builder");

  await agent.goto("/dashboard/new?home=SAMPLE-1004");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Send this home");
  const picked = agent.getByRole("button", { pressed: true });
  await expect(picked).toHaveCount(1);
  await expect(picked).toContainText("96 Fernhollow Ln");
  await expect(agent.getByRole("searchbox")).toHaveCount(0);
  await expect(agent.getByRole("button", { name: "Create link for 1 home" })).toBeVisible();

  // Adding another: the first stays first, and the heading follows.
  await agent.getByRole("button", { name: "Add another home" }).click();
  await expect(agent.getByRole("searchbox")).toBeFocused();
  const cards = agent.getByRole("button", { name: /^\$/ });
  await expect(cards.first()).toContainText("96 Fernhollow Ln");
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  await agent.getByRole("button", { name: /4127 Larkmoor/ }).click();
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Send these homes");
  await agent.getByRole("button", { name: /4127 Larkmoor/ }).click();
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Send this home");

  await agent.getByLabel("Person 1's first name").fill("Pat");
  await agent.getByRole("button", { name: "Create link for 1 home" }).click();
  await agent.waitForURL("**/dashboard/shares/*");
  await expect(agent.getByLabel("Pat's link")).toHaveValue(/\/s\/[\w-]{32}$/);

  // A home that isn't for sale: the usual way to start.
  await agent.goto("/dashboard/new?home=SAMPLE-SOLD");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("New share");
  await expect(agent.getByRole("searchbox")).toBeVisible();
  await expect(agent.getByRole("button", { pressed: true })).toHaveCount(0);
});
