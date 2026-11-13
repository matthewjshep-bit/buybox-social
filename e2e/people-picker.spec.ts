import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

// A link is named for the people it's for, and the people come from one
// picker: a first name typed in, or someone on Porchcard, found by their
// public first name only. (The names here are unusual on purpose: every test
// shares one database, and "On Porchcard" finds anyone.)

const emailsTo = (address: string) =>
  readFileSync("test-results-server.log", "utf8")
    .split("\n")
    .filter((line) => line.includes(`[email] to=${address} `));

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

// Someone's own page, from wherever they are.
async function pageOf(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  return new URL(page.url()).pathname;
}

// The suggestions under a picker, and one of them by its whole name.
const suggestions = (page: Page) => page.getByRole("listbox", { name: "Suggestions" });

test("a link is named for its people, in the order they were added, and follows them as they change", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "nora-names@example.com", "Nora Names");
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /1204 Quillan/ }).click();

  // Nobody yet: anyone with it can join.
  await expect(
    agent.getByText("Nobody added: anyone with the link can join, and it's named for whoever joins first."),
  ).toBeVisible();
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  for (const name of ["Joe", "Ana", "Sam", "Lee"]) {
    await who.fill(name);
    await who.press("Enter");
  }
  const chips = agent.getByRole("list", { name: "Who it's for" });
  await expect(chips.getByRole("listitem")).toHaveCount(4);
  const preview = agent.getByText(/^This link will be called /);
  await expect(preview).toHaveText("This link will be called Joe, Ana, Sam & 1 more.");
  await agent.getByRole("button", { name: /Create link/ }).click();
  await agent.waitForURL("**/dashboard/shares/*");

  // The page's title is the same, and there's no title to type.
  const title = agent.getByRole("heading", { level: 1 });
  await expect(title).toHaveText("Joe, Ana, Sam & 1 more");
  await expect(agent.getByRole("button", { name: /Rename/ })).toHaveCount(0);
  const people = agent.getByRole("region", { name: "People on this link" });
  for (const name of ["Joe", "Ana", "Sam", "Lee"]) await expect(people.getByLabel(`${name}'s link`)).toBeVisible();

  // Lee comes off: the title follows.
  await people.getByRole("button", { name: "Remove Lee" }).click();
  await people.getByRole("group", { name: /^Remove Lee from this link\?/ }).getByRole("button", { name: "Remove Lee" }).click();
  await expect(people.getByLabel("Lee's link")).toHaveCount(0);
  await expect(title).toHaveText("Joe, Ana & Sam");

  // Bo goes on: one more again.
  await agent.getByRole("combobox", { name: "Add a person" }).fill("Bo");
  await agent.getByRole("button", { name: "Add", exact: true }).click();
  await expect(people.getByLabel("Bo's link")).toBeVisible();
  await expect(title).toHaveText("Joe, Ana, Sam & 1 more");

  // A typo is fixed on the person, not the title.
  await people.getByRole("button", { name: "Edit name for Bo" }).click();
  const field = people.getByLabel("Bo's first name");
  await expect(field).toBeFocused();
  await field.fill("Beau");
  await field.press("Enter");
  await expect(people.getByLabel("Beau's link")).toBeVisible();
  await expect(people.getByLabel("Bo's link")).toHaveCount(0);
  await expect(people.getByRole("button", { name: "Edit name for Beau" })).toBeFocused();
  await expect(title).toHaveText("Joe, Ana, Sam & 1 more");

  // Escape puts it back as it was.
  await people.getByRole("button", { name: "Edit name for Joe" }).click();
  await people.getByLabel("Joe's first name").fill("Jo");
  await agent.keyboard.press("Escape");
  await expect(people.getByLabel("Joe's first name")).toHaveCount(0);
  await expect(people.getByRole("button", { name: "Edit name for Joe" })).toBeFocused();
  await expect(people.getByLabel("Joe's link")).toBeVisible();

  // Two people who haven't signed up can't share a name on one link.
  await people.getByRole("button", { name: "Edit name for Beau" }).click();
  await people.getByLabel("Beau's first name").fill("ana");
  await people.getByRole("button", { name: "Save" }).click();
  await expect(people.getByRole("alert")).toHaveText("ana is already on this link.");
});

test("someone who's already a client is picked from the list, by first name only, and opens their link as themselves", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "pia-picker@example.com", "Pia Picker");
  // A link anyone can join, and Xiomara joins it: she's Pia's client now.
  await createShare(agent, ["1204 Quillan"], []);
  const packageUrl = await agent.getByLabel("Your link is ready").inputValue();
  const email = "xiomara.client@example.com";
  const xio = await signUpBuyer(browser, email, "Xiomara Client");
  await xio.goto(packageUrl);
  await toFirstHome(xio);
  await heartOf(homeIn(xio, "1204 Quillan St SE")).click();
  await expect(heartOf(homeIn(xio, "1204 Quillan St SE"))).toHaveAttribute("aria-pressed", "true");

  // On a new link, two letters find her: her name and how Pia knows her, never her email.
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /4127 Larkmoor/ }).click();
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  await who.fill("Xi");
  const her = suggestions(agent).getByRole("option", { name: "Xiomara, Your client · 1 link" });
  await expect(her).toBeVisible();
  await expect(suggestions(agent).getByRole("group", { name: "Your clients" })).toContainText("Xiomara");
  // [P] Nothing private comes with her: not her email, not her last name.
  expect(await agent.content()).not.toContain(email);
  expect(await agent.content()).not.toContain("Xiomara Client");

  // The arrow keys reach her first (someone new comes last), and Enter picks her.
  await who.press("ArrowDown");
  const herId = await her.getAttribute("id");
  await expect(who).toHaveAttribute("aria-activedescendant", herId!);
  await who.press("Enter");
  await expect(agent.getByRole("list", { name: "Who it's for" })).toContainText("Xiomara");
  await expect(agent.getByText("We'll let Xiomara know on Porchcard.")).toBeVisible();
  await expect(agent.getByText(/^This link will be called /)).toHaveText("This link will be called Xiomara.");
  await agent.getByRole("button", { name: /Create link/ }).click();
  await agent.waitForURL("**/dashboard/shares/*");

  // She's on Porchcard already, so her profile is right there, and she's told.
  const people = agent.getByRole("region", { name: "People on this link" });
  await expect(people.getByRole("link", { name: "View profile of Xiomara" })).toBeVisible();
  await expect(people.getByText("Hasn't signed up yet")).toHaveCount(0);
  await expect(people.getByText("On Porchcard · we let them know")).toBeVisible();
  await expect(people.getByRole("button", { name: /^Edit name/ })).toHaveCount(0);
  await expect.poll(() => emailsTo(email).length).toBe(1);
  expect(emailsTo(email)[0]).toContain('subject="Pia Picker sent you 1 home on Porchcard"');

  // Her own link opens as her: a tap is hers straight away, no sign-up.
  const herLink = await people.getByLabel("Xiomara's link").inputValue();
  await xio.goto(herLink);
  await expect(xio.getByRole("heading", { level: 1 })).toHaveText("Xiomara, I picked this home for you");
  await toFirstHome(xio);
  const larkmoor = homeIn(xio, "4127 Larkmoor Ave NE");
  await heartOf(larkmoor).click();
  await expect(heartOf(larkmoor)).toHaveAttribute("aria-pressed", "true");
  await expect(xio.getByRole("dialog", { name: "Sign up to like and comment" })).toHaveCount(0);
  await expect(xio.getByRole("dialog", { name: "What's your first name?" })).toHaveCount(0);
});

test("someone Pia's never met: found only from two letters, never by email, told once, and followed once", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const email = "yvaine.stranger@example.com";
  const yv = await signUpBuyer(browser, email, "Yvaine Stranger");
  // Her own page, so she's someone on Porchcard.
  await pageOf(yv);
  const agent = await signInAgent(browser, "bea-broker@example.com", "Bea Broker");
  const beaPage = await pageOf(agent);

  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /1204 Quillan/ }).click();
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  const status = agent.getByRole("status").filter({ hasText: /found/ });

  // One letter looks only among Bea's own clients and follows.
  await who.fill("Y");
  await expect(status).toHaveText("No one found. Press Enter to add Y.");
  await expect(suggestions(agent).getByRole("group", { name: "On Porchcard" })).toHaveCount(0);
  // Two letters look on Porchcard too.
  await who.fill("Yv");
  const onPorchcard = suggestions(agent).getByRole("group", { name: "On Porchcard" });
  await expect(onPorchcard.getByRole("option", { name: "Yvaine, On Porchcard" })).toBeVisible();

  // Her email finds nobody, and can't become a name.
  await who.fill(email);
  await expect(status).toHaveText(`No one found. Press Enter to add ${email}.`);
  await expect(suggestions(agent).getByRole("option")).toHaveCount(1);
  await who.press("Enter");
  await expect(agent.getByRole("main").getByRole("alert")).toHaveText("Type a first name, not an email");
  await expect(agent.getByRole("list", { name: "Who it's for" })).toHaveCount(0);

  // Picked with a tap.
  await who.fill("Yv");
  await onPorchcard.getByRole("option", { name: "Yvaine, On Porchcard" }).click();
  await expect(agent.getByRole("list", { name: "Who it's for" })).toContainText("Yvaine");
  await expect(who).toBeFocused();
  await agent.getByRole("button", { name: /Create link/ }).click();
  await agent.waitForURL("**/dashboard/shares/*");
  const people = agent.getByRole("region", { name: "People on this link" });
  await expect(people.getByRole("link", { name: "View profile of Yvaine" })).toBeVisible();
  await expect.poll(() => emailsTo(email).length).toBe(1);

  // She opens it: she and Bea follow each other now.
  const firstLink = await people.getByLabel("Yvaine's link").inputValue();
  await yv.goto(firstLink);
  await toFirstHome(yv);
  await expect(async () => {
    await yv.goto(beaPage);
    await expect(yv.getByRole("button", { name: "Following Bea" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await expect(yv.getByText("Follows you")).toBeVisible();

  // She stops following Bea.
  await Promise.all([saved(yv), yv.getByRole("button", { name: "Following Bea" }).click()]);
  await expect(yv.getByRole("button", { name: "Follow Bea" })).toHaveAttribute("aria-pressed", "false");

  // A second link from Bea: she's Bea's client now, isn't emailed again the
  // same day, and opening it doesn't start following Bea again.
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /4127 Larkmoor/ }).click();
  await who.fill("Yv");
  await suggestions(agent)
    .getByRole("group", { name: "Your clients" })
    .getByRole("option", { name: "Yvaine, Your client · 1 link" })
    .click();
  await agent.getByRole("button", { name: /Create link/ }).click();
  await agent.waitForURL("**/dashboard/shares/*");
  const secondLink = await people.getByLabel("Yvaine's link").inputValue();
  expect(secondLink).not.toBe(firstLink);
  await yv.goto(secondLink);
  await toFirstHome(yv);
  await heartOf(homeIn(yv, "4127 Larkmoor Ave NE")).click();
  await expect(heartOf(homeIn(yv, "4127 Larkmoor Ave NE"))).toHaveAttribute("aria-pressed", "true");
  await yv.goto(beaPage);
  await expect(yv.getByRole("button", { name: "Follow Bea" })).toHaveAttribute("aria-pressed", "false");
  expect(emailsTo(email)).toHaveLength(1);
});

test("nobody is on a link twice: the same name, the same person, or an email", async ({ browser }) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "cy-dedupe@example.com", "Cy Dedupe");

  // In the builder, a name typed twice is one person.
  await agent.goto("/dashboard/new");
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  await who.fill("Ottoline");
  await who.press("Enter");
  await who.fill("ottoline");
  await who.press("Enter");
  await expect(agent.getByRole("main").getByRole("alert")).toHaveText("ottoline is already on this link.");
  await expect(agent.getByRole("list", { name: "Who it's for" }).getByRole("listitem")).toHaveCount(1);

  // On a link: the same first name, any case, is refused.
  await createShare(agent, ["1204 Quillan"], ["Joe"]);
  const add = agent.getByRole("combobox", { name: "Add a person" });
  await add.fill("joe ");
  await agent.getByRole("button", { name: "Add", exact: true }).click();
  await expect(agent.getByRole("main").getByRole("alert")).toHaveText("joe is already on this link.");
  const people = agent.getByRole("region", { name: "People on this link" });
  await expect(people.getByRole("textbox", { name: /'s link$/ })).toHaveCount(1);

  // An email is never a name.
  await add.fill("someone@example.com");
  await agent.getByRole("button", { name: "Add", exact: true }).click();
  await expect(agent.getByRole("main").getByRole("alert")).toHaveText("Type a first name, not an email");

  // Someone already on a link isn't suggested for it: Zuzanna joins a link
  // anyone can open, and isn't in its list.
  const zuzana = await signUpBuyer(browser, "zuzanna.dedupe@example.com", "Zuzanna Dedupe");
  const { dashboardUrl } = await createShare(agent, ["4127 Larkmoor"], []);
  const open = await agent.getByLabel("Your link is ready").inputValue();
  await zuzana.goto(open);
  await toFirstHome(zuzana);
  await heartOf(homeIn(zuzana, "4127 Larkmoor Ave NE")).click();
  await expect(heartOf(homeIn(zuzana, "4127 Larkmoor Ave NE"))).toHaveAttribute("aria-pressed", "true");
  await agent.goto(`${dashboardUrl}?tab=people`);
  await add.fill("Zu");
  await expect(agent.getByRole("status").filter({ hasText: /found/ })).toHaveText("No one found. Press Enter to add Zu.");
  await expect(suggestions(agent).getByRole("option", { name: /^Zuzanna,/ })).toHaveCount(0);
});

// The phone's share sheet, stood in for (as in quick-send.spec.ts): it notes
// what it was handed, then sends.
function stubShareSheet() {
  const w = window as unknown as { shared: ShareData[] };
  w.shared = [];
  Object.defineProperty(Navigator.prototype, "share", {
    configurable: true,
    value: (data: ShareData) => {
      w.shared.push(data);
      return Promise.resolve();
    },
  });
}

// The links the server hands each page for Send, read on the way in (as in
// quick-send.spec.ts): the browser keeps no copy of an answer it streamed.
const linksFor = new WeakMap<Page, string[]>();
async function watchLinks(page: Page) {
  const known = linksFor.get(page);
  if (known) return known;
  const tokens: string[] = [];
  linksFor.set(page, tokens);
  await page.context().addInitScript(stubShareSheet);
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.fallback();
    const response = await route.fetch();
    const body = await response.text();
    const found = body.match(/"token":"([\w-]{32})"/);
    if (found) tokens.push(found[1]);
    await route.fulfill({ response, body });
  });
  return tokens;
}

// An agent on a home, once the page has a link waiting for Send.
async function readyToSend(page: Page) {
  const tokens = await watchLinks(page);
  const before = tokens.length;
  await page.goto("/homes/SAMPLE-1004");
  await expect.poll(() => tokens.length).toBeGreaterThan(before);
}

test("a home from Send named for Toby: whoever opens it as Toby is Toby, once; and an unsaved name doesn't stop Undo", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "tad-toby@example.com", "Tad Sender");
  await readyToSend(agent);
  const send = homeIn(agent, "96 Fernhollow Ln").getByRole("button", { name: "Send to a client", exact: true });
  const sheet = agent.getByRole("dialog", { name: "Sent. Who's it for?" });

  await send.click();
  await expect(sheet).toBeVisible();
  const forWhom = sheet.getByRole("combobox", { name: "Who's it for? (optional)" });
  await forWhom.fill("Toby");
  await forWhom.press("Enter");
  // (Where it is on the dashboard, once it's made.)
  const inDashboard = sheet.getByRole("link", { name: "Open in your dashboard" });
  await expect(inDashboard).toHaveAttribute("href", /^\/dashboard\/shares\/[\w-]+$/);
  const dashboardUrl = (await inDashboard.getAttribute("href"))!;
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(agent.getByRole("status").filter({ hasText: "Saved. Their link greets Toby." })).toBeVisible();
  const url = await agent.evaluate(() => (window as unknown as { shared: ShareData[] }).shared[0]?.url ?? "");
  expect(url).toMatch(/\/s\/[\w-]{32}$/);

  // Someone opens the link that was sent, and signs up as Toby: that's him.
  const toby = await (await browser.newContext()).newPage();
  await toby.goto(url);
  await toFirstHome(toby);
  await heartOf(homeIn(toby, "96 Fernhollow Ln")).click();
  await joinAs(toby, "Toby");
  await expect(heartOf(homeIn(toby, "96 Fernhollow Ln"))).toHaveAttribute("aria-pressed", "true");

  // The agent sees one Toby, signed up, not a second one who joined.
  await agent.goto(`${dashboardUrl}?tab=people`);
  const people = agent.getByRole("region", { name: "People on this link" });
  await expect(people.getByLabel("Toby's link")).toHaveCount(1);
  await expect(people.getByRole("link", { name: "View profile of Toby" })).toHaveCount(1);
  await expect(people.getByText("Joined through the link you sent first")).toHaveCount(0);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Toby");

  // Another Send, a name typed and not yet saved: Undo still takes it back.
  await readyToSend(agent);
  await send.click();
  await expect(sheet).toBeVisible();
  await forWhom.fill("Ivy");
  await forWhom.press("Enter");
  await sheet.getByRole("button", { name: "Undo send" }).click();
  await sheet.getByRole("button", { name: "Undo send" }).click();
  await expect(agent.getByRole("status").filter({ hasText: "Undone. The link has stopped working." })).toBeVisible();
  const undone = await agent.evaluate(() => (window as unknown as { shared: ShareData[] }).shared.at(-1)?.url ?? "");
  expect((await request.get(undone)).status()).toBe(404);
});

test("the picker works from the keyboard and says what it finds", async ({ browser }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "ari-aria@example.com", "Ari Aria");

  // From "Send homes to…": who it's for comes first, ready to type.
  await agent.goto("/dashboard/new?focus=to");
  const who = agent.getByRole("combobox", { name: "Who's it for?" });
  await expect(who).toBeFocused();
  expect((await who.boundingBox())!.y).toBeLessThan((await agent.getByRole("searchbox").boundingBox())!.y);
  await expect(who).toHaveAttribute("aria-autocomplete", "list");
  await expect(who).toHaveAttribute("aria-expanded", "false");

  // Typing opens the list, someone new first.
  await who.fill("Ottavia");
  await expect(who).toHaveAttribute("aria-expanded", "true");
  const status = agent.getByRole("status").filter({ hasText: /found|Removed|Added/ });
  await expect(status).toHaveText("No one found. Press Enter to add Ottavia.");
  await who.press("ArrowDown");
  const fresh = suggestions(agent).getByRole("option", { name: /^Add “Ottavia” as someone new$/ });
  await expect(fresh).toHaveAttribute("aria-selected", "true");
  await expect(who).toHaveAttribute("aria-activedescendant", (await fresh.getAttribute("id"))!);
  // Down again wraps round to it: it's the only one.
  await who.press("ArrowDown");
  await expect(fresh).toHaveAttribute("aria-selected", "true");

  // Escape closes the list; again, it clears what's typed.
  await who.press("Escape");
  await expect(who).toHaveAttribute("aria-expanded", "false");
  await expect(who).toHaveValue("Ottavia");
  await who.press("Escape");
  await expect(who).toHaveValue("");

  // Enter adds what's typed; so does a comma.
  await who.fill("Rosamund");
  await who.press("Enter");
  await who.pressSequentially("Remiel,");
  const chips = agent.getByRole("list", { name: "Who it's for" });
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(who).toHaveValue("");
  await expect(agent.getByText(/^This link will be called /)).toHaveText("This link will be called Rosamund & Remiel.");

  // Backspace in the empty field takes the last one off, and says so.
  await who.press("Backspace");
  await expect(chips.getByRole("listitem")).toHaveCount(1);
  await expect(status).toHaveText("Removed Remiel");
  // Each one's own button does the same.
  await chips.getByRole("button", { name: "Remove Rosamund" }).click();
  await expect(chips).toHaveCount(0);
  await expect(who).toBeFocused();
  await expect(
    agent.getByText("Nobody added: anyone with the link can join, and it's named for whoever joins first."),
  ).toBeVisible();

  // Tab leaves without picking anything.
  await who.fill("Tamsin");
  await expect(who).toHaveAttribute("aria-expanded", "true");
  await who.press("Tab");
  await expect(who).toHaveAttribute("aria-expanded", "false");
  await expect(chips).toHaveCount(0);
});
