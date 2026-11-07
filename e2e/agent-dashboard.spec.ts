import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  createShare,
  heartOf,
  homeIn,
  likeInPhoto,
  openComments,
  openMore,
  pick,
  settle,
  signInAgent,
  tapPhoto,
} from "./helpers";

const emailsTo = (address: string) =>
  readFileSync("test-results-server.log", "utf8")
    .split("\n")
    .filter((line) => line.includes(`[email] to=${address} `));

// The page's next word to the server (a server action), answered: a link
// saying it's been opened, or the agent's page saying it's been seen.
const actionAnswered = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

test("an agent's phone and email for clients: checked, kept as digits, and never the login email", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "casey-contact@example.com", "Casey Agent");
  await agent.goto("/dashboard/profile");
  // (Next's route announcer is an alert too.)
  const alert = agent.locator("form").getByRole("alert");
  const phone = agent.getByLabel("Phone for clients (optional)");
  const email = agent.getByLabel("Email for clients (optional)");
  // Nothing shows on links until they type it: never their login email.
  await expect(phone).toHaveValue("");
  await expect(email).toHaveValue("");

  // A number without its area code says so, under the field, and saves nothing.
  await phone.fill("555-0142");
  await agent.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText("Please enter a phone number with the area code, or leave it empty.");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).toHaveValue("555-0142");
  await expect(agent).toHaveURL(/\/dashboard\/profile$/);

  // So does an address that can't be one, even with a good phone beside it.
  await phone.fill("(206) 555-0142");
  await email.fill("casey@nowhere");
  await agent.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText("Please enter a valid email address, or leave it empty.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveValue("casey@nowhere");
  await agent.reload();
  await expect(phone).toHaveValue("");
  await expect(email).toHaveValue("");

  // Both good: saved, and shown back as a phone number.
  await phone.fill("(206) 555-0142");
  await email.fill("Casey@Harborpine.example");
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
  await agent.goto("/dashboard/profile");
  await expect(phone).toHaveValue("(206) 555-0142");
  await expect(email).toHaveValue("casey@harborpine.example");

  // Kept as digits: that's all the link's call button is made of.
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Robin"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await expect(homeIn(client, "96 Fernhollow Ln")).toBeInViewport({ ratio: 0.9 });
  await client.getByRole("button", { name: "Contact" }).click();
  const contact = client.getByRole("dialog", { name: "Contact Casey Agent" });
  await expect(contact.getByRole("link", { name: "Call Casey" })).toHaveAttribute("href", "tel:2065550142");
  await expect(contact.getByRole("link", { name: "Email Casey" })).toHaveAttribute(
    "href",
    /^mailto:casey@harborpine\.example\?subject=/,
  );

  // Cleared, they're gone from the link.
  await agent.goto("/dashboard/profile");
  await phone.fill("");
  await email.fill("");
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
  await client.reload();
  await client.getByRole("button", { name: "Contact" }).click();
  await expect(contact).toBeVisible();
  await expect(contact.getByRole("link")).toHaveCount(0);
  await expect(contact.getByRole("button", { name: "Ask to see it" })).toBeVisible();
});

test("a home that has sold can't go on a new link, and nothing is made", async ({ browser }) => {
  const agent = await signInAgent(browser, "gone-agent@example.com", "Gale Agent");
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /812 N Corbel/ }).click();
  await agent.getByLabel("Person 1's first name").fill("Zuri");
  // The home sells between picking it and creating the link: the tests' sold
  // home (in the listings, but not for sale) stands in for it.
  await agent.route("**/dashboard/new", async (route) => {
    const body = route.request().postData();
    if (route.request().method() !== "POST" || !body?.includes("SAMPLE-1003")) return route.continue();
    await route.continue({ postData: body.replace("SAMPLE-1003", "SAMPLE-SOLD") });
  });
  await agent.getByRole("button", { name: /Create link/ }).click();
  await expect(agent.getByText("One of those homes is no longer available.")).toHaveAttribute("role", "alert");
  await expect(agent).toHaveURL(/\/dashboard\/new$/);
  await agent.unroute("**/dashboard/new");

  // No link was made.
  await agent.goto("/dashboard");
  await expect(agent.getByRole("link", { name: /Zuri/ })).toHaveCount(0);
});

test("the dashboard leads with what's new, and says when each link was opened, never counting the agent", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "olive-opens@example.com", "Olive Opens");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Owen"]);
  const row = agent.getByRole("region", { name: "Links you've sent" }).getByRole("link", { name: /Owen/ });
  const news = agent.getByRole("region", { name: "What's new" });

  // Sent, and nothing since.
  await agent.goto("/dashboard");
  await expect(row).toContainText("Not opened yet");
  await expect(row.getByRole("listitem").filter({ hasText: "1204 Quillan St SE" })).toBeVisible();
  // Said once for the link, not under every home.
  await expect(row.getByText("No reactions yet")).toHaveCount(1);
  await expect(row).not.toHaveAccessibleName(/new since you last looked/);
  await expect(news).toContainText("Nothing yet.");

  // The agent looking at their own link doesn't count as it being opened.
  await Promise.all([actionAnswered(agent), agent.goto(url)]);
  await agent.goto("/dashboard");
  await expect(row).toContainText("Not opened yet");

  // Owen opens it: the agent sees when, and hears about it.
  const owen = await (await browser.newContext()).newPage();
  await Promise.all([actionAnswered(owen), owen.goto(url)]);
  await agent.reload();
  await expect(row).toContainText(/Opened (yesterday, )?\d{1,2}:\d{2} [ap]m/);
  await expect(row).not.toContainText("Not opened yet");
  await expect.poll(() => emailsTo("olive-opens@example.com").length).toBe(1);
  expect(emailsTo("olive-opens@example.com")[0]).toContain("Owen opened your link to 2 homes");

  // [P] Opens are for the agent only: the link never says it was seen.
  await expect(owen.getByText(/opened/i)).toHaveCount(0);
  expect(await (await request.get(url)).text()).not.toMatch(/opened/i);

  // Owen likes one home, passes on the other, and says something. Opening it
  // didn't hold back the email about the first of those.
  const quillan = homeIn(owen, "1204 Quillan St SE");
  await heartOf(quillan).click();
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
  const more = await openMore(owen, homeIn(owen, "719 Saltmarsh Ln"));
  await more.getByRole("button", { name: "Not for me" }).click();
  await expect(more.getByRole("button", { name: "Not for me" })).toHaveAttribute("aria-pressed", "true");
  await owen.keyboard.press("Escape");
  const chat = await openComments(owen, quillan);
  await chat.getByLabel("Add a comment").fill("Love the porch.");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  // The box empties once it's saved (its own text would match before then).
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");
  await expect(chat.getByText("Love the porch.")).toBeVisible();
  await expect.poll(() => emailsTo("olive-opens@example.com").length).toBe(2);
  expect(emailsTo("olive-opens@example.com")[1]).toContain("Owen liked this at 1204 Quillan St SE");

  // One load of the dashboard has all of it: what's new first, a verdict on
  // each home, when it was last busy, and a mark that there's something new.
  await agent.goto("/dashboard");
  const said = news.getByRole("link", { name: /^Owen commented: “Love the porch\.”/ });
  await expect(said).toBeVisible();
  await expect(news.getByRole("link", { name: /^Owen liked this home/ })).toBeVisible();
  await expect(news.getByRole("link", { name: /^Owen passed on this home/ })).toBeVisible();
  await expect(row.getByRole("listitem").filter({ hasText: "1204 Quillan St SE" })).toContainText("1 liked");
  await expect(row.getByRole("listitem").filter({ hasText: "719 Saltmarsh Ln" })).toContainText("1 passed");
  await expect(row).toContainText("1 comment");
  await expect(row).toContainText(/Last activity (just now|\d+m ago)/);
  await expect(row).toHaveAccessibleName(/new since you last looked/);

  // Each item opens the thread it came from, marking for a moment which
  // comment it was, and seeing it there clears the mark.
  const marked = agent.waitForSelector("li[data-target]");
  await Promise.all([actionAnswered(agent), said.click()]);
  await expect(agent).toHaveURL(/\/dashboard\/shares\/[\w-]+#comment-[\w-]+$/);
  await expect(agent.getByText("Love the porch.")).toBeInViewport();
  expect(await (await marked).textContent()).toContain("Love the porch.");
  await expect(agent.getByText(/^Owen opened it (at |yesterday, )\d/)).toBeVisible();
  await agent.goto("/dashboard");
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAccessibleName(/new since you last looked/);

  // Opening it again soon after, or doing more, sends no more email.
  await Promise.all([actionAnswered(owen), owen.reload()]);
  await expect(owen.getByRole("heading", { level: 1 })).toHaveText("Owen, I picked these 2 homes for you");
  await owen.waitForTimeout(1000);
  expect(emailsTo("olive-opens@example.com")).toHaveLength(2);
});

test("the agent sees how much of a link was looked at, and the link never says so", async ({ browser, request }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "sid-seen@example.com", "Sid Seen");
  // (Halvard, a home other specs send and like already: Tamsen must stay quiet for core-view.)
  const { url, dashboardUrl } = await createShare(agent, ["10421 Halvard"], ["Owen"]);

  // Owen looks at three of the home's four photos.
  const owen = await (await browser.newContext()).newPage();
  await owen.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await owen.goto(url);
  const home = homeIn(owen, "10421 Halvard Way NE");
  await expect(home).toBeInViewport({ ratio: 0.9 });
  // Each counts once it has come to rest, when what's in it can be tapped.
  for (const thing of ["the floating staircase", "the deck"]) {
    await home.getByRole("button", { name: "Next photo" }).click();
    await expect(home.getByRole("button", { name: `Select ${thing}` })).toBeAttached();
  }

  // The agent's page about him says so, under his link, and so does the dashboard.
  await expect(async () => {
    await agent.goto(dashboardUrl);
    await expect(agent.locator("main")).toContainText(/Owen opened it .+ · saw 3 of 4 photos/, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await agent.goto("/dashboard");
  const row = agent.getByRole("region", { name: "Links you've sent" }).getByRole("link", { name: /Owen/ });
  await expect(row).toContainText(/Opened .+ · saw 3 of 4 photos/);

  // [P] Only the agent: the link itself never says what was looked at.
  await expect(owen.getByText(/saw \d/)).toHaveCount(0);
  expect(await (await request.get(url)).text()).not.toMatch(/saw \d/);
});

test("the agent's page about a client reads like the product: a card per home, spots, a careful delete, two columns", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "cora-cards@example.com", "Cora Cards");
  // The phone runs Share… straight from the tap; this one notes what it was given.
  await agent.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { shared: ShareData }).shared = data;
      },
    });
  });
  const { urls, dashboardUrl } = await createShare(agent, ["5902 Lakeview", "719 Saltmarsh"], ["Nina", "Christopher"]);

  // Nina hearts nothing: she only likes a spot that isn't on anything named
  // in the second home's second photo, and says something about its sofa.
  const nina = await (await browser.newContext()).newPage();
  // A phone that has had a link before: no swipe nudges moving the homes about.
  await nina.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await nina.goto(urls.Nina);
  const saltmarsh = homeIn(nina, "719 Saltmarsh Ln");
  await saltmarsh.scrollIntoViewIfNeeded();
  await expect(saltmarsh).toBeInViewport({ ratio: 0.9 });
  await saltmarsh.getByRole("button", { name: "Next photo" }).click();
  // Once the photo has slid all the way in.
  const living = saltmarsh.getByRole("img", { name: "Living room with a white sofa and teal pillows" });
  await expect(living).toBeInViewport({ ratio: 0.95 });
  let was = NaN;
  await expect
    .poll(async () => {
      const x = (await living.boundingBox())!.x;
      const still = x === was;
      was = x;
      return still;
    })
    .toBe(true);
  await tapPhoto(saltmarsh, "Living room with a white sofa and teal pillows", 0.7, 0.45);
  const spot = saltmarsh.getByRole("group", { name: "This spot" });
  await expect(spot).toBeVisible();
  await settle(spot);
  await spot.getByRole("button", { name: "Like this spot", exact: true }).click();
  await expect(spot.getByRole("button", { name: "Like this spot, 1 like", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Picking the sofa puts its card in this one's place.
  const sofa = await pick(saltmarsh, "the white sofa");
  await expect(spot).toBeHidden();
  await sofa.getByRole("button", { name: "Comment" }).click();
  const sheet = nina.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Comment on the white sofa").fill("Where would the TV go?");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();

  // Christopher passes on the first, for its price.
  const chris = await (await browser.newContext()).newPage();
  await chris.goto(urls.Christopher);
  const more = await openMore(chris, homeIn(chris, "5902 Lakeview Terrace SE"));
  await more.getByRole("button", { name: "Not for me" }).click();
  const why = more.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Price" }).click();
  await expect(why.getByRole("button", { name: "Price" })).toHaveAttribute("aria-pressed", "true");

  // On a phone, home by home is a card each, a line per person, nothing cut
  // off, not even a long name; folded away at first, since each home further
  // down says the same.
  await agent.setViewportSize({ width: 393, height: 852 });
  await agent.goto(dashboardUrl);
  const nav = agent.getByRole("navigation", { name: "Dashboard" });
  await expect(nav.getByRole("link", { name: "Your shares" })).toHaveAttribute("aria-current", "true");
  expect((await nav.getByRole("link", { name: "Your brand" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const compare = agent.getByRole("region", { name: "What they each want" });
  await expect(compare.getByRole("table")).toBeHidden();
  // A spot she liked counts: the summary and her card agree.
  await expect(compare).toContainText("Nina liked 1 of 2 homes · passed 0");
  await expect(compare).toContainText("Christopher liked 0 of 2 homes · passed 1");
  await expect(compare).not.toContainText("hasn't reacted yet");
  const card = compare.getByRole("listitem").filter({ hasText: "5902 Lakeview Terrace SE" });
  await expect(card).toBeHidden();
  await compare.locator("summary").filter({ hasText: "Home by home · 2 homes" }).click();
  await expect(card).toBeVisible();
  const chrisSays = card.getByRole("listitem").filter({ hasText: "Christopher" });
  const ninaSays = card.getByRole("listitem").filter({ hasText: "Nina" });
  await expect(chrisSays).toContainText("passed on Price");
  await expect(ninaSays).toContainText("Not yet");
  for (const line of [chrisSays, ninaSays]) {
    const box = (await line.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(393);
  }
  expect(await compare.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const names = card.locator("[data-person-name]");
  expect((await names.allTextContents()).sort()).toEqual(["Christopher", "Nina"]);
  expect(await names.evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth))).toBe(true);
  await expect(
    compare
      .getByRole("listitem")
      .filter({ hasText: "719 Saltmarsh Ln" })
      .getByRole("listitem")
      .filter({ hasText: "Nina" }),
  ).toContainText("liked A spot in photo 2");
  // Suggestions say "price range" once, not once per person.
  await expect(agent.getByText(/their price range/)).toHaveCount(0);

  // Likes are rose hearts here too: no green thumbs.
  await expect(compare.locator(".lucide-heart").first()).toBeVisible();
  expect(await agent.locator("[class*='emerald'], .lucide-thumbs-up").count()).toBe(0);

  // The thread: who, then what they said; a spot shows the photo with a dot
  // where they tapped, and says which photo a bare spot was in.
  const home = agent.getByRole("region", { name: "719 Saltmarsh Ln" });
  await expect(home).toContainText("Nina liked a spot in photo 2");
  const said = home.getByRole("listitem").filter({ hasText: "Where would the TV go?" });
  const who = (await said.getByText("Nina", { exact: true }).boundingBox())!;
  const words = (await said.getByText("Where would the TV go?").boundingBox())!;
  expect(who.y + who.height).toBeLessThanOrEqual(words.y + 1);
  const chip = said.getByRole("button", { name: /^About White sofa/ });
  const thumb = (await chip.locator("[data-spot-thumb]").boundingBox())!;
  const dot = (await chip.locator("[data-spot-dot]").boundingBox())!;
  // The sofa sits half way across and 82% down its photo.
  expect(Math.abs(dot.x + dot.width / 2 - (thumb.x + thumb.width * 0.5))).toBeLessThan(2);
  expect(Math.abs(dot.y + dot.height / 2 - (thumb.y + thumb.height * 0.82))).toBeLessThan(2);
  await expect(chip).not.toHaveAttribute("aria-controls");
  await chip.click();
  await expect(chip).toHaveAttribute("aria-expanded", "true");
  // Named for what the photo shows; the caption says which photo it is.
  const photo = said.getByRole("img", { name: "Living room with a white sofa and teal pillows" });
  await expect(photo).toBeVisible();
  await expect(said.getByText("Photo 2 of 2, where they tapped")).toBeVisible();
  await expect(chip).toHaveAttribute("aria-controls", (await photo.locator("xpath=ancestor::figure").getAttribute("id"))!);

  // Removing a comment takes two taps, and can be called off.
  const menu = said.getByRole("button", { name: "More for Nina's comment" });
  await menu.click();
  const ask = agent.getByRole("dialog", { name: "Remove this comment? Your client won't see it." });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);
  await expect(menu).toBeFocused();
  await expect(said).toBeVisible();
  // Tabbing on past it puts it away, so it never covers what has focus.
  await agent.keyboard.press("Enter");
  await expect(ask.getByRole("button", { name: "Cancel" })).toBeFocused();
  await agent.keyboard.press("Tab");
  await agent.keyboard.press("Tab");
  await expect(ask).toHaveCount(0);
  // Removed with the keyboard, the place in the thread is kept: here, the
  // reply box, as it was the only comment.
  await menu.focus();
  await agent.keyboard.press("Enter");
  await agent.keyboard.press("Tab");
  await expect(ask.getByRole("button", { name: "Remove comment from Nina" })).toBeFocused();
  await agent.keyboard.press("Enter");
  await expect(home.getByText("Where would the TV go?")).toHaveCount(0);
  await expect(home.getByRole("textbox", { name: "Reply to your client" })).toBeFocused();

  // Wide: what they want on the left, the homes and what was said on the right,
  // and the side-by-side table, its homes kept in view as it scrolls.
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.reload();
  const left = (await compare.boundingBox())!;
  const right = (await agent.getByRole("heading", { name: "On their link" }).boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x + left.width);
  await expect(compare.getByRole("table")).toBeVisible();
  await expect(compare.getByRole("row", { name: /^5902 Lakeview Terrace SE/ })).toContainText("passed on Price");
  await expect(compare.locator("summary")).toBeHidden();
  expect(await compare.getByRole("rowheader").first().evaluate((el) => getComputedStyle(el).position)).toBe("sticky");

  // With one home left on it, the link's message names the home in the same
  // words as sending it from its page, and Share… hands it to the phone's
  // share sheet from the tap itself.
  await home.getByRole("button", { name: "Remove 719 Saltmarsh Ln" }).click();
  await expect(agent.getByRole("region", { name: "Removed from their link" })).toBeVisible();
  // (The first link on the page, whoever's it is.)
  const firstUrl = await agent.locator("input[readonly]").first().inputValue();
  const message = "I picked a home for you: 5902 Lakeview Terrace SE, $2,450,000. Tell me what you think.";
  await expect(agent.getByRole("link", { name: "Text" }).first()).toHaveAttribute(
    "href",
    new RegExp(encodeURIComponent(message).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  await agent.getByRole("button", { name: "Share…" }).first().click();
  await expect.poll(() => agent.evaluate(() => (window as unknown as { shared?: ShareData }).shared?.url)).toBe(firstUrl);
  const handed = await agent.evaluate(() => (window as unknown as { shared: ShareData }).shared);
  expect(handed.title).toBe("A home for you");
  expect(handed.text).toMatch(/^Hi \w+, I picked a home for you: 5902 Lakeview Terrace SE, \$2,450,000\. Tell me what you think\.$/);
});

test("the agent's Scorecard on a home: what each person thinks, the exact spot they meant, and nothing from anywhere else", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const SALTMARSH = "719 Saltmarsh Ln";
  const BEA_SAYS = "Are the shutters original?";
  const DOT_SAYS = "Too close to the road for me.";
  const agent = await signInAgent(browser, "remy-scores@example.com", "Remy Scores");
  // The same home on another of the agent's links: none of that may show on this one.
  const elsewhere = await createShare(agent, ["719 Saltmarsh"], ["Dot"]);
  const { urls, dashboardUrl } = await createShare(agent, ["719 Saltmarsh", "1204 Quillan"], ["Bea", "Cal", "Pat"]);

  const dot = await (await browser.newContext()).newPage();
  await dot.goto(elsewhere.url);
  const dotHome = homeIn(dot, SALTMARSH);
  await heartOf(dotHome).click();
  await expect(heartOf(dotHome)).toHaveAttribute("aria-pressed", "true");
  const dotChat = await openComments(dot, dotHome);
  await dotChat.getByLabel("Add a comment").fill(DOT_SAYS);
  await dotChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(dotChat.getByText(DOT_SAYS)).toBeVisible();

  // Bea likes the home and its blue shutters, and asks about them.
  const bea = await (await browser.newContext()).newPage();
  await bea.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await bea.goto(urls.Bea);
  const beaHome = homeIn(bea, SALTMARSH);
  await heartOf(beaHome).click();
  await expect(heartOf(beaHome)).toHaveAttribute("aria-pressed", "true");
  const shutters = await likeInPhoto(beaHome, "the blue shutters");
  await shutters.getByRole("button", { name: "Comment" }).click();
  const sheet = bea.getByRole("dialog", { name: "Comments" });
  await sheet.getByLabel("Comment on the blue shutters").fill(BEA_SAYS);
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(sheet).toBeHidden();

  // Cal passes on it, for its price. Pat hasn't looked yet.
  const cal = await (await browser.newContext()).newPage();
  await cal.goto(urls.Cal);
  const more = await openMore(cal, homeIn(cal, SALTMARSH));
  await more.getByRole("button", { name: "Not for me" }).click();
  const why = more.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Price" }).click();
  await expect(why.getByRole("button", { name: "Price" })).toHaveAttribute("aria-pressed", "true");

  // On a phone: a Scorecard button on the home, and the Scorecard rises over the page.
  await agent.setViewportSize({ width: 393, height: 852 });
  await agent.goto(dashboardUrl);
  const home = agent.getByRole("region", { name: SALTMARSH });
  const open = home.getByRole("button", { name: `Scorecard for ${SALTMARSH}` });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  const card = agent.getByRole("dialog", { name: "Scorecard" });
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.matches(":modal"))).toBe(true);
  await expect(card).toContainText("From the people on this link · only they and you see this");
  await expect(card).toContainText("Bea liked it · Cal passed");
  await expect(card).toContainText("Not yet: Pat");

  // What each person thinks: a verdict each, what they liked or didn't, and what they said.
  const people = card.locator("section").filter({ has: agent.getByRole("heading", { name: "What each person thinks" }) });
  const person = (name: string) => people.getByRole("listitem").filter({ has: agent.getByText(name, { exact: true }) });
  await expect(person("Bea")).toContainText("Liked it");
  await expect(person("Bea")).toContainText("Blue shutters");
  await expect(person("Bea")).toContainText(`“${BEA_SAYS}”`);
  await expect(person("Cal")).toContainText("Passed");
  await expect(person("Cal")).toContainText("Price");
  await expect(person("Pat")).toContainText("Hasn't weighed in yet");
  await expect(card.getByRole("heading", { name: "Your take" })).toHaveCount(0);

  // [P] Only this link: nobody from the agent's other link, and nothing public.
  await expect(card).not.toContainText(/\bDot\b|Too close to the road|A buyer/);

  // The exact spot: a tap shows the photo bigger, here, with the dot where
  // the shutters are (34% across, 52% down).
  const row = card.getByRole("button", { name: /^Blue shutters, photo 1, 1 like\. Show it (bigger|smaller)$/ });
  await expect(row).toHaveAccessibleName("Blue shutters, photo 1, 1 like. Show it bigger");
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(row).toHaveAccessibleName("Blue shutters, photo 1, 1 like. Show it smaller");
  const peek = card.locator("[data-spot-peek]");
  await expect(peek).toBeVisible();
  await expect(row).toHaveAttribute("aria-controls", (await peek.getAttribute("id"))!);
  await expect(peek).toContainText("Photo 1, where Bea tapped");
  const photo = peek.getByRole("img", { name: "Blue cottage behind a white picket fence" });
  await expect(photo).toBeVisible();
  const big = (await photo.boundingBox())!;
  expect(Math.round(big.width)).toBe(320);
  const dotBox = (await peek.locator("[data-spot-dot]").boundingBox())!;
  expect(Math.abs(dotBox.x + dotBox.width / 2 - (big.x + big.width * 0.34))).toBeLessThan(2);
  expect(Math.abs(dotBox.y + dotBox.height / 2 - (big.y + big.height * 0.52))).toBeLessThan(2);
  await row.click();
  await expect(peek).toHaveCount(0);
  // What she said about them opens the same way.
  const said = card.getByRole("button", { name: /^About the blue shutters ?: show it in the photo$/ });
  await said.click();
  await expect(card.locator("[data-spot-peek]")).toContainText("Photo 1, where Bea tapped");

  // Beside the link's other home: how each went down, aspect by aspect.
  const table = card.getByRole("table", { name: /^This home beside the other home/ });
  const cells = (label: string) =>
    table.getByRole("row").filter({ has: agent.getByRole("rowheader", { name: label, exact: true }) }).getByRole("cell");
  await expect(cells("Overall")).toHaveText([/^1 like 1 pass$/, /None$/]);
  await expect(cells("Price")).toHaveText([/^\s*1 pass$/, /None$/]);

  // Reply: the Scorecard goes, and the keyboard is in the home's reply box.
  await card.getByRole("button", { name: "Reply to your client" }).click();
  await expect(card).toBeHidden();
  await expect(home.getByRole("textbox", { name: "Reply to your client" })).toBeFocused();

  // Wide: a panel down the right, the page still free to use, and Escape
  // puts it away with the keyboard back on the button.
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.reload();
  await open.click();
  await expect(card).toBeVisible();
  expect(await card.evaluate((el) => el.matches(":modal"))).toBe(false);
  const panel = (await card.boundingBox())!;
  expect(panel.x + panel.width).toBeGreaterThan(1400);
  expect(panel.width).toBeLessThanOrEqual(448);
  await expect(card.getByRole("heading", { name: "Scorecard", exact: true })).toBeFocused();
  await agent.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(open).toBeFocused();

  // Another agent can't open it at all.
  const stranger = await signInAgent(browser, "nosy-agent@example.com", "Nora Nosy");
  const response = await stranger.goto(dashboardUrl);
  expect(response?.status()).toBe(404);
  await expect(stranger.getByText(BEA_SAYS)).toHaveCount(0);
  await expect(stranger.getByRole("button", { name: /^Scorecard/ })).toHaveCount(0);
});
