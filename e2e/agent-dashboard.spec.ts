import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Listing } from "../lib/listings/types";
import { mediaKeyOf } from "../lib/photos";
import { describeReaction, spotPlace } from "../lib/reactions";
import { signedIn, toFirstHome,
  commentIn,
  createShare,
  heartOf,
  homeIn,
  joinAs,
  likeInPhoto,
  missedTaps,
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
  await toFirstHome(client);
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
  const owen = await signedIn(browser);
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
  const owen = await signedIn(browser);
  await owen.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await owen.goto(url);
  await toFirstHome(owen);
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
  const nina = await signedIn(browser);
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
  const chris = await signedIn(browser);
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
  await expect(nav.getByRole("link", { name: "Your links" })).toHaveAttribute("aria-current", "true");
  expect((await nav.getByRole("link", { name: "Your brand" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const compare = agent.getByRole("region", { name: "What they each want" });
  await expect(compare.getByRole("table")).toBeHidden();
  // A spot she liked counts: the summary and her card agree.
  // Only what each of them did: no "passed 0", no "liked 0".
  await expect(compare).toContainText("Nina liked 1 of 2 homes");
  await expect(compare).toContainText("Christopher passed on 1 of 2 homes");
  await expect(compare).not.toContainText(/(liked|passed on) 0/);
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
  ).toContainText("liked A spot in the living room");
  // Suggestions say "price range" once, not once per person.
  await expect(agent.getByText(/their price range/)).toHaveCount(0);

  // Likes are rose hearts here too: no green thumbs.
  await expect(compare.locator(".lucide-heart").first()).toBeVisible();
  expect(await agent.locator("[class*='emerald'], .lucide-thumbs-up").count()).toBe(0);

  // The thread: who, then what they said; a spot shows the photo with a dot
  // where they tapped, and says which photo a bare spot was in.
  const home = agent.getByRole("region", { name: "719 Saltmarsh Ln" });
  await expect(home).toContainText("Nina liked a spot in the living room");
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

test("the agent's Porchcard on a home: what each person thinks, the exact spot they meant, and nothing from anywhere else", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const SALTMARSH = "719 Saltmarsh Ln";
  const BEA_SAYS = "Are the shutters original?";
  const DOT_SAYS = "Too close to the road for me.";
  const QUILL_SAYS = "The garden is bigger than it looks.";
  const agent = await signInAgent(browser, "remy-scores@example.com", "Remy Scores");
  // The same home on another of the agent's links: none of that may show on this one.
  const elsewhere = await createShare(agent, ["719 Saltmarsh"], ["Dot"]);
  const { urls, dashboardUrl } = await createShare(agent, ["719 Saltmarsh", "1204 Quillan"], ["Bea", "Cal", "Pat"]);

  const dot = await signedIn(browser);
  await dot.goto(elsewhere.url);
  const dotHome = homeIn(dot, SALTMARSH);
  await heartOf(dotHome).click();
  await expect(heartOf(dotHome)).toHaveAttribute("aria-pressed", "true");
  const dotChat = await openComments(dot, dotHome);
  await dotChat.getByLabel("Add a comment").fill(DOT_SAYS);
  await dotChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(dotChat.getByText(DOT_SAYS)).toBeVisible();

  // In public, Quill likes the home and says something about it.
  const quill = await signedIn(browser);
  await quill.goto("/homes/SAMPLE-1008");
  const quillHome = homeIn(quill, SALTMARSH);
  await heartOf(quillHome).click();
  await joinAs(quill, "Quill");
  await expect(heartOf(quillHome)).toHaveAttribute("aria-pressed", "true");
  const quillChat = await openComments(quill, quillHome);
  await quillChat.getByLabel("Add a comment").fill(QUILL_SAYS);
  await quillChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(quillChat.getByText(QUILL_SAYS)).toBeVisible();

  // Bea likes the home and its blue shutters, and asks about them.
  const bea = await signedIn(browser);
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
  const cal = await signedIn(browser);
  await cal.goto(urls.Cal);
  const more = await openMore(cal, homeIn(cal, SALTMARSH));
  await more.getByRole("button", { name: "Not for me" }).click();
  const why = more.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Price" }).click();
  await expect(why.getByRole("button", { name: "Price" })).toHaveAttribute("aria-pressed", "true");

  // On a phone: a Porchcard button on the home, and the Porchcard rises over the page.
  await agent.setViewportSize({ width: 393, height: 852 });
  await agent.goto(dashboardUrl);
  const home = agent.getByRole("region", { name: SALTMARSH });
  const open = home.getByRole("button", { name: `Porchcard for ${SALTMARSH}` });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  const card = agent.getByRole("dialog", { name: "Porchcard" });
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

  // [P] Only this link: nobody from the agent's other link, and nothing
  // public (Quill's like isn't among "Bea liked it", nor her words anywhere).
  await expect(card).not.toContainText(/\bDot\b|Too close to the road|A buyer|\bQuill\b|bigger than it looks/);

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
  // What she said about them opens the same way, from a chip like the one in
  // the thread beside it.
  const said = card.getByRole("button", { name: "About Blue shutters: show it in the photo" });
  await said.click();
  await expect(card.locator("[data-spot-peek]")).toContainText("Photo 1, where Bea tapped");

  // Beside the link's other home: how each went down, aspect by aspect.
  const table = card.getByRole("table", { name: /^This home beside the other home/ });
  const cells = (label: string) =>
    table.getByRole("row").filter({ has: agent.getByRole("rowheader", { name: label, exact: true }) }).getByRole("cell");
  await expect(cells("Overall")).toHaveText([/^1 like 1 pass$/, /None$/]);
  await expect(cells("Price")).toHaveText([/^\s*1 pass$/, /None$/]);

  // Reply: the Porchcard goes, and the keyboard is in the home's reply box.
  await card.getByRole("button", { name: "Reply to your client" }).click();
  await expect(card).toBeHidden();
  await expect(home.getByRole("textbox", { name: "Reply to your client" })).toBeFocused();

  // Wide: a panel down the right, under the site's header, with the page
  // making room beside it, so nothing on the page is under it and every
  // home's buttons stay in reach. Escape puts it away with the keyboard back
  // on the button.
  for (const width of [1440, 1024]) {
    await agent.setViewportSize({ width, height: 900 });
    await agent.reload();
    await open.click();
    await expect(card).toBeVisible();
    expect(await card.evaluate((el) => el.matches(":modal"))).toBe(false);
    await expect(card.getByRole("heading", { name: "Porchcard", exact: true })).toBeFocused();
    await settle(card);
    const panel = (await card.boundingBox())!;
    expect(panel.x + panel.width).toBeGreaterThan(width - 40);
    expect(panel.width).toBeLessThanOrEqual(448);
    const header = (await agent.getByRole("banner").boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(Math.max(0, header.y + header.height));
    const under = await agent.evaluate(
      ({ x, y, width, height }) =>
        [...document.querySelectorAll("a, button, input, textarea, summary")]
          .filter((el) => !el.closest("dialog"))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.left < x + width && r.right > x && r.top < y + height && r.bottom > y;
          })
          .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim()),
      panel,
    );
    expect(under).toEqual([]);
    await agent.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await expect(open).toBeFocused();
  }

  // Another home's Porchcard while one is open: the keyboard goes to it, and
  // back to that home's button when it closes.
  await open.click();
  await expect(card.getByRole("heading", { name: "Porchcard", exact: true })).toBeFocused();
  const quillan = agent.getByRole("region", { name: "1204 Quillan St SE" });
  const other = quillan.getByRole("button", { name: "Porchcard for 1204 Quillan St SE" });
  await other.focus();
  await agent.keyboard.press("Enter");
  await expect(agent.getByRole("dialog", { name: "Porchcard for 1204 Quillan St SE" })).toBeVisible();
  await expect(card.getByRole("heading", { name: "Porchcard", exact: true })).toBeFocused();
  await agent.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(other).toBeFocused();

  // Reply, beside the page: the Porchcard stays, and the keyboard is in the
  // home's reply box, clear of it.
  await open.click();
  await card.getByRole("button", { name: "Reply to your client" }).click();
  const replyBox = home.getByRole("textbox", { name: "Reply to your client" });
  await expect(replyBox).toBeFocused();
  await expect(card).toBeVisible();
  const reply = (await replyBox.boundingBox())!;
  await settle(card);
  expect(reply.x + reply.width).toBeLessThan((await card.boundingBox())!.x);

  // Another agent can't open it at all.
  const stranger = await signInAgent(browser, "nosy-agent@example.com", "Nora Nosy");
  const response = await stranger.goto(dashboardUrl);
  expect(response?.status()).toBe(404);
  await expect(stranger.getByText(BEA_SAYS)).toHaveCount(0);
  await expect(stranger.getByRole("button", { name: /^Porchcard/ })).toHaveCount(0);
});

test("something liked in one home and passed on in another depends on the home, and is agreed only where they both liked it", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // (Homes no later spec needs quiet.)
  const HALVARD = "10421 Halvard Way NE";
  const CORBEL = "812 N Corbel St";
  const agent = await signInAgent(browser, "mia-mixed@example.com", "Mia Mixed");
  const { urls, dashboardUrl } = await createShare(agent, ["10421 Halvard", "812 N Corbel"], ["Ann", "Bob"]);
  // The heart, then the layout among what else they like.
  const likeLayout = async (page: Page, address: string) => {
    const home = homeIn(page, address);
    await heartOf(home).click();
    await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
    const more = await openMore(page, home);
    const what = more.getByRole("group", { name: "What else do you like?" });
    await what.getByRole("button", { name: "Layout" }).click();
    await expect(what.getByRole("button", { name: "Layout" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(more).toBeHidden();
  };

  // Ann likes the first home's layout. Bob likes the second's, and passes on
  // the first for its layout.
  const ann = await signedIn(browser);
  await ann.goto(urls.Ann);
  await likeLayout(ann, HALVARD);
  const bob = await signedIn(browser);
  await bob.goto(urls.Bob);
  await likeLayout(bob, CORBEL);
  const more = await openMore(bob, homeIn(bob, HALVARD));
  await more.getByRole("button", { name: "Not for me" }).click();
  const why = more.getByRole("group", { name: "What made you pass?" });
  await why.getByRole("button", { name: "Layout" }).click();
  await expect(why.getByRole("button", { name: "Layout" })).toHaveAttribute("aria-pressed", "true");
  await bob.keyboard.press("Escape");
  await expect(more).toBeHidden();

  // For Bob the layout depends on the home, once, on its own; and as they
  // haven't liked it in the same home, only Ann likes it.
  await agent.goto(dashboardUrl);
  const want = agent.getByRole("region", { name: "What they each want" });
  const person = (name: string) =>
    want.getByRole("listitem").filter({ has: agent.getByText(new RegExp(`^${name} (liked|passed on) (\\d|all|both)`)) });
  await expect(want).toContainText("Both like: nothing in common yet");
  await expect(want).toContainText("Only Ann: Layout");
  await expect(person("Ann")).toContainText(/Likes\s*Layout/);
  await expect(person("Bob")).toContainText("Bob liked 1 of 2 homes · passed on 1");
  await expect(person("Bob")).toContainText(/Depends on the home\s*Layout/);
  await expect(person("Bob")).not.toContainText(/Likes|Passes on/);

  // Ann likes the second home's layout too: now they agree on it there, and
  // it says where.
  await likeLayout(ann, CORBEL);
  await agent.reload();
  await expect(want).toContainText(`Both like: Layout (${CORBEL})`);
  await expect(want).not.toContainText("Only Ann");
  await expect(person("Bob")).toContainText(/Depends on the home\s*Layout/);
});

test("an agent hearts what a client said: their thread says Liked by, in stone, and it never leaves the link", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const SALTMARSH = "719 Saltmarsh Ln";
  const IVY_SAYS = "Is the garage heated? I'd use it as a workshop.";
  const agent = await signInAgent(browser, "hal-hearts@example.com", "Hal Hearts");
  const { urls, dashboardUrl } = await createShare(agent, ["719 Saltmarsh"], ["Ivy"]);

  // Ivy likes the home, and says something, shared on the public page too.
  const ivy = await signedIn(browser);
  await ivy.goto(urls.Ivy);
  const home = homeIn(ivy, SALTMARSH);
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  let sheet = await openComments(ivy, home);
  await sheet.getByLabel("Add a comment").fill(IVY_SAYS);
  await sheet.getByLabel(/share this anonymously/).check();
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(commentIn(sheet, "Ivy", IVY_SAYS)).toBeVisible();
  await expect(sheet.getByText(/^Liked by/)).toHaveCount(0);
  // The thread's small buttons each take a fingertip.
  for (const small of [
    sheet.getByRole("button", { name: "Post", exact: true }),
    sheet.getByRole("button", { name: "Make private" }),
    sheet.getByLabel("Add a comment"),
  ]) {
    expect(await missedTaps(small)).toEqual([]);
  }

  // The agent answers, and hearts what she said; never their own words.
  await agent.goto(dashboardUrl);
  const panel = agent.getByRole("region", { name: SALTMARSH });
  await panel.getByRole("textbox", { name: "Reply to your client" }).fill("It is, and wired for 240V.");
  await panel.getByRole("button", { name: "Reply", exact: true }).click();
  const reply = panel.getByRole("listitem").filter({ hasText: "It is, and wired for 240V." });
  await expect(reply).toBeVisible();
  await expect(reply.getByRole("button", { name: /^Like/ })).toHaveCount(0);
  const said = panel.getByRole("listitem").filter({ hasText: IVY_SAYS });
  const like = said.getByRole("button", { name: "Like Ivy's comment" });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  expect(await missedTaps(like)).toEqual([]);
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(like.locator(".lucide-heart")).toHaveClass(/fill-rose-600/);
  // It stays.
  await agent.reload();
  await expect(like).toHaveAttribute("aria-pressed", "true");

  // On her link: "Liked by Hal" under her words, in stone, not the agent's colour.
  await ivy.reload();
  sheet = await openComments(ivy, homeIn(ivy, SALTMARSH));
  const chip = commentIn(sheet, "Ivy", IVY_SAYS).getByText("Liked by Hal", { exact: true });
  await expect(chip).toBeVisible();
  // A note in stone, outlined: not filled like the spot chip, which is a button.
  await expect(chip).toHaveClass(/ring-stone-200/);
  await expect(chip).not.toHaveClass(/bg-/);
  const colours = await chip.evaluate((el) => {
    const brand = document.createElement("span");
    brand.style.color = "var(--brand)";
    el.append(brand);
    const value = getComputedStyle(brand).color;
    brand.remove();
    return { brand: value, background: getComputedStyle(el).backgroundColor, text: getComputedStyle(el).color };
  });
  expect(colours.background).not.toBe(colours.brand);
  expect(colours.text).not.toBe(colours.brand);
  // Only hers.
  await expect(sheet.getByText(/^Liked by/)).toHaveCount(1);

  // In public her words show, as a buyer's, and the agent's heart never does.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/homes/SAMPLE-1008");
  const outside = await openComments(visitor, homeIn(visitor, SALTMARSH));
  const shared = commentIn(outside, "A buyer", IVY_SAYS);
  await expect(shared).toBeVisible();
  await expect(shared).not.toContainText("Liked by");
  await expect(outside.getByText(/Liked by Hal/)).toHaveCount(0);
  const html = await (await visitor.request.get("/homes/SAMPLE-1008")).text();
  expect(html).toContain("Is the garage heated?");
  for (const never of ["Liked by Hal", "Hal Hearts"]) expect(html).not.toContain(never);
  // (Not even the field: "likedByMe" is a public comment's own.)
  expect(html).not.toMatch(/likedBy(?!Me)/);

  // Taken back, it's gone from her thread too.
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await agent.reload();
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await ivy.reload();
  sheet = await openComments(ivy, homeIn(ivy, SALTMARSH));
  await expect(commentIn(sheet, "Ivy", IVY_SAYS)).toBeVisible();
  await expect(sheet.getByText(/^Liked by/)).toHaveCount(0);
});

test("adding someone to a link whose one person was told it's private asks first, on the page and on the server", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "alex-alone@example.com", "Alex Alpha");
  const { url } = await createShare(agent, ["88 Heron Bluff"], ["Solo"]);

  // Solo's link tells her what she says is between her and Alex.
  const solo = await signedIn(browser);
  await solo.goto(url);
  let chat = await openComments(solo, homeIn(solo, "88 Heron Bluff Rd"));
  await expect(chat.getByText("Only you and Alex Alpha see this.")).toBeVisible();

  // Adding Newbie says what that means, and adds nobody until Alex says so.
  await agent.getByLabel("Their first name").fill("Newbie");
  await agent.getByRole("button", { name: "Add a person" }).click();
  const ask = agent.getByRole("group", { name: /^Solo was told only you two see their comments\./ });
  await expect(ask).toContainText("Newbie will see everything said so far.");
  await expect(agent.locator("p[tabindex='-1']").filter({ hasText: "Solo was told" })).toBeFocused();
  await expect(agent.getByLabel("Newbie's link")).toHaveCount(0);
  await expect(agent.getByRole("button", { name: "Add a person" })).toBeHidden();

  // The server asks too: an answer that isn't yes adds nobody.
  await agent.route("**/dashboard/shares/*", async (route) => {
    const body = route.request().postData();
    if (route.request().method() !== "POST" || !body) return route.continue();
    await route.continue({ postData: body.replace(/(name="[^"]*confirm"\r\n\r\n)yes/, "$1no") });
  });
  const refused = agent.waitForResponse(
    (res) => res.request().method() === "POST" && /name="[^"]*confirm"/.test(res.request().postData() ?? ""),
  );
  await ask.getByRole("button", { name: "Add Newbie anyway" }).click();
  await refused;
  await expect(ask).toBeVisible();
  await expect(agent.getByLabel("Newbie's link")).toHaveCount(0);
  await agent.unroute("**/dashboard/shares/*");

  // Yes: Newbie gets a link, and the cursor goes back to the name.
  await ask.getByRole("button", { name: "Add Newbie anyway" }).click();
  await expect(agent.getByLabel("Newbie's link")).toBeVisible();
  await expect(ask).toHaveCount(0);
  await expect(agent.getByLabel("Their first name")).toBeFocused();
  await expect(agent.getByLabel("Their first name")).toHaveValue("");

  // Solo's link no longer says it's just the two of them.
  await solo.reload();
  chat = await openComments(solo, homeIn(solo, "88 Heron Bluff Rd"));
  await expect(chat.getByText("Only Alex Alpha and people on this link see this.")).toBeVisible();

  // Nobody on it now was told that, so the next person is added straight away.
  await agent.getByLabel("Their first name").fill("Third");
  await agent.getByRole("button", { name: "Add a person" }).click();
  await expect(agent.getByLabel("Third's link")).toBeVisible();

  // Cancel leaves the link as it was, the name still there to change.
  const { url: unoUrl } = await createShare(agent, ["88 Heron Bluff"], ["Uno"]);
  expect(unoUrl).toBeTruthy();
  await agent.getByLabel("Their first name").fill("Dos");
  await agent.getByRole("button", { name: "Add a person" }).click();
  await agent.getByRole("group", { name: /^Uno was told/ }).getByRole("button", { name: "Cancel" }).click();
  await expect(agent.getByRole("group", { name: /^Uno was told/ })).toHaveCount(0);
  await expect(agent.getByLabel("Their first name")).toBeFocused();
  await expect(agent.getByLabel("Their first name")).toHaveValue("Dos");
  await expect(agent.getByLabel("Dos's link")).toHaveCount(0);
});

test("on a phone, picked homes stay in view whatever the search, and a bar leads on to who it's for", async ({ browser }) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "pip-picker@example.com", "Pip Picker");
  await agent.setViewportSize({ width: 393, height: 660 });
  await agent.goto("/dashboard/new");
  const cards = agent.getByRole("button", { name: /^\$/ });
  const next = agent.getByRole("button", { name: "Next", exact: true });
  const tray = agent.getByRole("list", { name: "Picked homes" });
  const pageWidth = () => agent.evaluate(() => document.documentElement.scrollWidth);
  await expect(cards.first()).toBeVisible();
  await expect(next).toHaveCount(0);

  await cards.filter({ hasText: "1204 Quillan" }).click();
  await expect(agent.getByText("1 of 3 picked")).toBeVisible();
  await expect(next).toBeVisible();

  // A search that leaves it out still shows it, above the homes, and it can come off from there.
  await agent.getByRole("searchbox").fill("Seattle");
  await expect(agent).toHaveURL(/q=Seattle/);
  await expect(cards.filter({ hasText: "1204 Quillan" })).toHaveCount(0);
  await expect(tray).toContainText("1204 Quillan St SE");
  expect((await tray.boundingBox())!.y).toBeLessThan((await cards.first().boundingBox())!.y);
  await tray.getByRole("button", { name: "Remove 1204 Quillan St SE" }).click();
  await expect(tray).toHaveCount(0);
  await expect(next).toHaveCount(0);
  await expect(agent.getByRole("button", { name: "Pick at least 1 home" })).toBeVisible();

  // Three picked: one row of them that slides rather than widening the page,
  // and Next goes to who it's for, ready to type.
  await agent.getByRole("searchbox").fill("");
  await expect(agent).toHaveURL(/\/dashboard\/new$/);
  for (const i of [0, 1, 2]) await cards.nth(i).click();
  await expect(agent.getByText("3 of 3 picked")).toBeVisible();
  await expect(tray.getByRole("listitem")).toHaveCount(3);
  expect(await pageWidth()).toBeLessThanOrEqual(393);
  await next.click();
  const name = agent.getByLabel("Person 1's first name");
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport();
  await expect(next).toHaveCount(0);
});

test("Remove and Restore keep the keyboard with the home, and each person's link buttons say whose they are", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "kim-keys@example.com", "Kim Keys");
  await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Ben", "Nina"]);
  const links = agent.getByRole("region", { name: "Their links" });
  for (const name of ["Ben", "Nina"]) {
    await expect(links.getByRole("link", { name: `Text ${name}`, exact: true })).toBeVisible();
    await expect(links.getByRole("button", { name: `Copy ${name}'s link`, exact: true })).toBeVisible();
    await expect(links.getByRole("link", { name: `Preview ${name}'s link`, exact: true })).toBeVisible();
  }

  await agent.getByRole("button", { name: "Remove 719 Saltmarsh Ln" }).focus();
  await agent.keyboard.press("Enter");
  const removed = agent.getByRole("region", { name: "Removed from their link" });
  await expect(removed.getByRole("button", { name: "Restore 719 Saltmarsh Ln" })).toBeFocused();
  await expect(agent.getByRole("status").filter({ hasText: "Removed from their link." })).toBeAttached();
  await agent.keyboard.press("Enter");
  await expect(removed).toHaveCount(0);
  await expect(agent.getByRole("button", { name: "Remove 719 Saltmarsh Ln" })).toBeFocused();
  await expect(agent.getByRole("status").filter({ hasText: "Back on their link." })).toBeAttached();
});

test("what someone thought of a home reads as one list: one 'and', 'or' for what they didn't like, and spots by where they are", () => {
  const listings = JSON.parse(readFileSync("supabase/seed/listings.json", "utf8")) as Listing[];
  const saltmarsh = listings.find((listing) => listing.ListingKey === "SAMPLE-1008")!;
  const [outside, livingRoom] = saltmarsh.Media.map(mediaKeyOf);
  const at = (mediaKey: string) => ({ place: spotPlace(saltmarsh, mediaKey) });

  expect(
    describeReaction({ reaction: "like", liked: ["layout"], disliked: [] }, ["Floating staircase", "Deck", at(outside)]),
  ).toBe("liked the layout, floating staircase, deck and a spot outside");
  expect(
    describeReaction({ reaction: "like", liked: ["location"], disliked: ["price"] }, ["Gas range"], ["Pedestal sink"]),
  ).toBe("liked the location and gas range but not the price or pedestal sink");
  expect(describeReaction({ reaction: "dislike", liked: [], disliked: ["layout", "bathrooms"] }, [], ["Bedrooms"])).toBe(
    "passed, didn't like the layout, bathrooms or bedrooms",
  );
  // Spots in the same room together; "photo 2" only for a photo that doesn't say what it shows.
  expect(
    describeReaction({ reaction: "like", liked: [], disliked: [] }, [at(livingRoom), at(livingRoom), at(outside)]),
  ).toBe("liked 2 spots in the living room and a spot outside");
  const unsaid = { ...saltmarsh, Media: saltmarsh.Media.map((photo) => ({ ...photo, ImageOf: undefined })) };
  expect(spotPlace(unsaid, livingRoom)).toBe("in photo 2");
  // A spot as it was saved, with nothing to say where: as before.
  expect(describeReaction({ reaction: "like", liked: ["layout"], disliked: [] }, ["@3,97"])).toBe(
    "liked the layout and a spot in a photo",
  );
  expect(describeReaction({ reaction: null, liked: [], disliked: [] }, ["@3,97", "@97,3"])).toBe(
    "liked 2 spots in the photos",
  );
});
