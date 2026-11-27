// An agent's own listings on their page: their MLS ID on their brand page
// ties the listings to them, and their page then leads with those (Listings),
// with what they've done one tap away (Activity). Anyone can see them, signed
// out too; each opens them all full screen, in order. Nothing anyone did on
// one of their links comes along. The IDs are given back at the end, so no
// later spec finds an agent with listings.
import { expect, test, type Page } from "@playwright/test";
import { createShare, detailsForm, heartOf, homeIn, joinAs, openComments, signedIn, signInAgent, toDetails } from "./helpers";

test.describe.configure({ mode: "serial" });

const LARKMOOR = "4127 Larkmoor Ave NE"; // SAMPLE-1001
const TAMSEN = "1880 Tamsen Ridge Pl SE"; // SAMPLE-1002
const HALVARD = "10421 Halvard Way NE"; // SAMPLE-1005, another agent's
const QUILLAN = "1204 Quillan St SE"; // SAMPLE-1009
const SECRET = "Between us, the roof worries me.";

let lia: Page;
let liaPage: string;
let liaId: string;

const sections = (page: Page) => page.getByRole("navigation", { name: "Sections" });
const grid = (page: Page) => page.getByRole("list", { name: "Listings" });

// The MLS ID among their details (Edit profile), and Save.
async function saveMlsId(page: Page, id: string) {
  await toDetails(page);
  await page.getByLabel("MLS ID (optional)").fill(id);
  await detailsForm(page).getByRole("button", { name: "Save details" }).click();
}

// The last screen of a reel on a page of its own.
async function toTheEnd(page: Page) {
  const end = page.getByRole("region", { name: "The end" });
  await expect(async () => {
    await page.evaluate(() => {
      const reel = document.querySelector<HTMLElement>("[data-reel]")!;
      reel.scrollTo({ top: reel.scrollHeight });
    });
    await expect(end).toBeInViewport({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  return end;
}

test("an agent adds their MLS ID and their listings lead their page", async ({ browser }) => {
  test.setTimeout(90_000);
  lia = await signInAgent(browser, "lia-listings@example.com", "Jordan Rivera");
  await lia.goto("/people/me");
  await lia.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  liaPage = new URL(lia.url()).pathname;
  liaId = liaPage.split("/").pop()!;
  // No ID yet: her page is as it always was.
  await expect(sections(lia)).toHaveCount(0);

  // An ID that isn't one is refused, under its own field.
  await saveMlsId(lia, "bad id!");
  await expect(lia.locator("#mlsAgentId-error")).toHaveText("Letters, numbers and dashes only, or leave it empty.");
  await expect(lia.getByLabel("MLS ID (optional)")).toBeFocused();
  await lia.getByLabel("MLS ID (optional)").fill("demo-1001");
  await detailsForm(lia).getByRole("button", { name: "Save details" }).click();
  await expect(detailsForm(lia).getByRole("status")).toHaveText("Saved");

  // Her page opens on her listings: Listings first, then Activity.
  await lia.goto(liaPage);
  await expect(sections(lia).getByRole("link")).toHaveText([/^Listings\s*4$/, "Activity"]);
  await expect(sections(lia).getByRole("link", { name: /^Listings/ })).toHaveAttribute("aria-current", "page");
  await expect(grid(lia).getByRole("link")).toHaveCount(4);
  const tile = grid(lia).locator('a[href*="home=SAMPLE-1001"]');
  await expect(tile).toContainText("3 beds");
  await expect(tile).toContainText(`${LARKMOOR}, Seattle`);
  await expect(tile).toContainText("$");
  // Only what's for sale: the sold copy of that home, same agent, isn't here.
  await expect(lia.getByRole("main")).not.toContainText("9 Sold Example Ct");
  // Nothing runs off the side of a phone.
  expect(await lia.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // The tiles are big enough to tap.
  const box = (await tile.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
});

test("a listing opens them all full screen on that home, and the way back is to Listings", async () => {
  test.setTimeout(60_000);
  await lia.goto(liaPage);
  await grid(lia).locator('a[href*="home=SAMPLE-1002"]').click();
  await lia.waitForURL(/\/reel\?from=listings(:|%3A)[0-9a-f-]{36}&home=SAMPLE-1002/);
  await expect(homeIn(lia, TAMSEN)).toBeInViewport({ ratio: 0.5 });

  // On a page of its own: back to her listings, and the end says that's all of them.
  await lia.reload();
  await expect(homeIn(lia, TAMSEN)).toBeInViewport({ ratio: 0.5 });
  await expect(lia.getByRole("link", { name: "Back to your listings" }).first()).toHaveAttribute(
    "href",
    `${liaPage}?tab=listings`,
  );
  const end = await toTheEnd(lia);
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's all");
});

test("signed out, an agent's page is their listings, with Activity one tap away", async ({ browser }) => {
  test.setTimeout(60_000);
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(liaPage);
  await expect(sections(anon).getByRole("link", { name: /^Listings/ })).toHaveAttribute("aria-current", "page");
  await expect(grid(anon).getByRole("link")).toHaveCount(4);
  await expect(anon.getByRole("link", { name: "Edit profile" })).toHaveCount(0);
  await expect(anon).toHaveTitle("Jordan Rivera · Porchcard");
  // Under them, where they are: a map, there on the listings and gone with Activity.
  // (The section, by its heading: once the map itself has drawn, its canvas is called "Map" too.)
  const mapSection = anon.locator('section[aria-labelledby="listings-map-title"]');
  await expect(mapSection).toBeVisible();
  await expect(mapSection.getByRole("heading", { name: "Map" })).toBeVisible();
  await anon.goto(`${liaPage}?tab=activity`);
  await expect(mapSection).toHaveCount(0);
  await anon.goto(liaPage);

  // All four, to the end, with nothing asking them to sign up on the way; Follow is the way in.
  await anon.goto(`/reel?from=listings:${liaId}&home=SAMPLE-1001`);
  await expect(homeIn(anon, LARKMOOR)).toBeInViewport({ ratio: 0.5 });
  const end = await toTheEnd(anon);
  await expect(end.getByRole("heading", { level: 2 })).toHaveText("That's all from Jordan");
  await expect(end.getByRole("link", { name: "Follow Jordan" })).toHaveAttribute(
    "href",
    `/login?next=${encodeURIComponent(liaPage)}`,
  );
  await expect(anon.getByRole("link", { name: "Back to Jordan's listings" }).first()).toHaveAttribute(
    "href",
    `${liaPage}?tab=listings`,
  );

  // Activity: what she's done, and no grid.
  await anon.goto(liaPage);
  await sections(anon).getByRole("link", { name: "Activity" }).click();
  await anon.waitForURL(/\?tab=activity$/);
  await expect(sections(anon).getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
  await expect(grid(anon)).toHaveCount(0);
  await expect(anon.getByText("Jordan hasn't liked anything yet.")).toBeVisible();
  await anon.context().close();
});

test("what she likes is on Activity, and its homes go back to Activity", async () => {
  test.setTimeout(60_000);
  await lia.goto("/homes/SAMPLE-1005");
  const halvard = homeIn(lia, HALVARD);
  await heartOf(halvard).click();
  await expect(heartOf(halvard)).toHaveAttribute("aria-pressed", "true");

  // Her page still opens on her listings; the like is on Activity.
  await lia.goto(liaPage);
  await expect(grid(lia).getByRole("link")).toHaveCount(4);
  await expect(lia.getByRole("main")).not.toContainText(HALVARD);
  await lia.goto(`${liaPage}?tab=activity`);
  await expect(lia.getByRole("link", { name: `${HALVARD}: liked this` })).toBeVisible();
  await expect(grid(lia)).toHaveCount(0);
  // What Activity shows is chosen on its first day's line, and stays on Activity.
  const filter = lia.locator("main [data-feed-filter]");
  await filter.locator("summary").click();
  await filter.getByRole("link", { name: "Liked" }).click();
  await expect(lia).toHaveURL(`${liaPage}?tab=activity&show=liked`);
  await expect(lia.getByRole("link", { name: `${HALVARD}: liked this` })).toBeVisible();
  // Chosen: it closes, and the keyboard stays on the word, which says the choice.
  await expect(filter.locator("summary")).toBeFocused();
  await expect(filter.locator("summary")).toContainText("Liked");
  await expect(filter.getByRole("link", { name: "Liked" })).toBeHidden();
  // The choice already on closes it too.
  await filter.locator("summary").click();
  await filter.getByRole("link", { name: "Liked" }).click();
  await expect(filter.getByRole("link", { name: "Liked" })).toBeHidden();
  await filter.locator("summary").click();
  await filter.getByRole("link", { name: "All" }).click();
  await expect(lia).toHaveURL(`${liaPage}?tab=activity`);
  await expect(grid(lia)).toHaveCount(0);

  // "See your taste" and her own face beside "You liked" go to Activity, not her listings.
  await lia.goto("/people/me?tab=activity");
  await expect(lia).toHaveURL(`${liaPage}?tab=activity`);
  await expect(grid(lia)).toHaveCount(0);

  await lia.goto(`/reel?from=${liaId}&home=SAMPLE-1005`);
  await expect(homeIn(lia, HALVARD)).toBeInViewport({ ratio: 0.5 });
  await expect(lia.getByRole("link", { name: "Back to your activity" }).first()).toHaveAttribute(
    "href",
    `${liaPage}?tab=activity`,
  );
  // Taken back, so no later spec counts it.
  await lia.goto("/homes/SAMPLE-1005");
  await heartOf(halvard).click();
  await expect(heartOf(halvard)).toHaveAttribute("aria-pressed", "false");
});

test("her own words lead her listing, after anyone else's, and its tile counts likes and comments", async ({ browser }) => {
  test.setTimeout(90_000);
  const TAKE = "New roof last spring, and the porch catches the evening sun.";
  // Someone says something on her listing first …
  const fan = await signedIn(browser);
  await fan.goto(`/reel?from=listings:${liaId}&home=SAMPLE-1002`);
  const fanHome = homeIn(fan, TAMSEN);
  await heartOf(fanHome).click();
  await joinAs(fan, "Fay");
  await expect(heartOf(fanHome)).toHaveAttribute("aria-pressed", "true");
  const fanChat = await openComments(fan, fanHome);
  await fanChat.getByLabel("Add a comment").fill("Is the yard fenced?");
  await fanChat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(fanChat.getByText("Is the yard fenced?")).toBeVisible();
  // … then she says what she has to say about it.
  await lia.goto(`/reel?from=listings:${liaId}&home=SAMPLE-1002`);
  const chat = await openComments(lia, homeIn(lia, TAMSEN));
  await chat.getByLabel("Add a comment").fill(TAKE);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByText(TAKE)).toBeVisible();
  // And once more someone else, newer than hers.
  const late = await signedIn(browser);
  await late.goto(`/reel?from=listings:${liaId}&home=SAMPLE-1002`);
  const lateChat = await openComments(late, homeIn(late, TAMSEN));
  await lateChat.getByLabel("Add a comment").fill("Love the trees.");
  await lateChat.getByRole("button", { name: "Post", exact: true }).click();
  await joinAs(late, "Lou");
  await expect(lateChat.getByText("Love the trees.")).toBeVisible();

  // Anyone, on her page: the tile says how many liked it and how many comments.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(liaPage);
  const tile = grid(anon).locator('a[href*="home=SAMPLE-1002"]');
  await expect(tile).toContainText(/1\s*like/);
  await expect(tile).toContainText(/3\s*comments/);
  // One nobody's touched says nothing of the kind.
  await expect(grid(anon).locator('a[href*="home=SAMPLE-1001"]')).not.toContainText(/comment|like/);

  // Into it: under the photo, the latest comments count the like, show all
  // three, and the first of them is what she said, not the newest.
  await tile.click();
  await anon.waitForURL(/\/reel\?/);
  const latest = homeIn(anon, TAMSEN).getByRole("group", { name: "Latest comments" });
  await expect(latest).toContainText("1 like");
  const rows = latest.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(latest).toContainText("New roof last spring");
  // Each comment is a row big enough to tap.
  const row = (await rows.first().getByRole("button").boundingBox())!;
  expect(row.height).toBeGreaterThanOrEqual(44);
  // Hers leads, in her name; the newest, from someone else, comes after it.
  await expect(rows.first()).toContainText("Jordan");
  await expect(rows.first()).toContainText("New roof last spring");
  await expect(rows.first()).not.toContainText("Love the trees");
  await expect(rows.nth(1)).toContainText("Love the trees");
});

test("an MLS ID is theirs only under their name, one profile per ID, and nobody without listings gets the tabs", async ({ browser }) => {
  test.setTimeout(90_000);
  const noel = await signInAgent(browser, "noel-listings@example.com", "Noel Nolistings");
  // Someone else's ID (it's on every one of their listings): refused, and none of their listings are Noel's.
  await saveMlsId(noel, "DEMO-1001");
  await expect(noel.locator("#mlsAgentId-error")).toHaveText("That MLS ID is listed under another name.");
  await expect(noel.getByLabel("MLS ID (optional)")).toBeFocused();
  // Under that name too, it's still on one profile only.
  await noel.getByLabel("Full name").fill("Jordan Rivera");
  await detailsForm(noel).getByRole("button", { name: "Save details" }).click();
  await expect(noel.locator("#mlsAgentId-error")).toHaveText("That MLS ID is on another profile.");
  await noel.getByLabel("Full name").fill("Noel Nolistings");
  // An ID no listing has: saved, and their page is as it was.
  await noel.getByLabel("MLS ID (optional)").fill("NOBODY-1");
  await detailsForm(noel).getByRole("button", { name: "Save details" }).click();
  await expect(detailsForm(noel).getByRole("status")).toHaveText("Saved");
  await noel.goto("/people/me");
  await noel.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(noel.getByRole("heading", { level: 1 })).toContainText("Noel");
  await expect(sections(noel)).toHaveCount(0);
  await expect(grid(noel)).toHaveCount(0);
  // Their listings, asked for by address: there are none, so it's every home.
  const noelId = noel.url().split("/").pop()!;
  await noel.goto(`/reel?from=listings:${noelId}`);
  await expect(noel.getByRole("article").first()).toBeVisible();
  await expect(noel.getByRole("link", { name: /listings$/ })).toHaveCount(0);
  await noel.context().close();
});

test("privacy: what a client says on the agent's link never shows on the agent's listings", async ({ browser }) => {
  test.setTimeout(120_000);
  const pat = await signInAgent(browser, "pat-listings@example.com", "Daniel Okafor");
  await saveMlsId(pat, "DEMO-1003");
  await expect(detailsForm(pat).getByRole("status")).toHaveText("Saved");
  const { url } = await createShare(pat, ["1204 Quillan"], ["Toby"]);
  await pat.goto("/people/me");
  await pat.waitForURL(/\/people\/[0-9a-f-]{36}$/);
  const patPage = new URL(pat.url()).pathname;
  await expect(grid(pat).getByRole("link")).toHaveCount(2);

  // Toby, on Daniel's link, says something about Daniel's own listing.
  const toby = await signedIn(browser);
  await toby.goto(url);
  const quillan = homeIn(toby, QUILLAN);
  await quillan.scrollIntoViewIfNeeded();
  const chat = await openComments(toby, quillan);
  // (Kept to Daniel: what's public by default isn't the point here.)
  await chat.getByRole("button", { name: "Keep it to Daniel Okafor" }).click();
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");
  await expect(chat.getByText(SECRET)).toBeVisible();

  // Anyone else, on Daniel's page and in Daniel's listings full screen: none of it.
  const anon = await (await browser.newContext()).newPage();
  for (const path of [patPage, `${patPage}?tab=activity`, `/reel?from=listings:${patPage.split("/").pop()}&home=SAMPLE-1009`]) {
    const html = await (await anon.request.get(path)).text();
    expect(html).toContain("Daniel");
    for (const secret of [SECRET, "Toby", "@example.com"]) expect(html).not.toContain(secret);
  }
  await anon.goto(`/reel?from=listings:${patPage.split("/").pop()}&home=SAMPLE-1009`);
  await expect(homeIn(anon, QUILLAN)).toBeInViewport({ ratio: 0.5 });
  await expect(anon.locator("body")).not.toContainText(SECRET);

  // The IDs go back: with none, the tabs go too.
  await saveMlsId(pat, "");
  await expect(detailsForm(pat).getByRole("status")).toHaveText("Saved");
  await pat.goto(patPage);
  await expect(sections(pat)).toHaveCount(0);
  await saveMlsId(lia, "");
  await expect(detailsForm(lia).getByRole("status")).toHaveText("Saved");
  await lia.goto(liaPage);
  await expect(sections(lia)).toHaveCount(0);
});
