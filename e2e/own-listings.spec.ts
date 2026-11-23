// Listings an agent (or an investor showing their deals) adds themselves:
// what it is, its photos, whether it's on their profile. Theirs to change
// and take away; on their profile for anyone; never in the homes everyone
// browses, and never anyone else's to edit.
import { expect, test, type Locator } from "@playwright/test";
import { enterListingYourself, heartOf, saveDetails, signInAgent, signUpBuyer } from "./helpers";

// A tiny PNG, as a photo would arrive.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);
const ADDRESS = "742 Dealmaker Ave";

// A row's controls (links or buttons, by name) all sit on one line, each a
// fingertip tall, none off the side of the row.
async function expectOneLine(row: Locator, names: string[]) {
  const edge = (await row.boundingBox())!;
  const boxes = [];
  for (const name of names) {
    const control = row.getByRole("link", { name }).or(row.getByRole("button", { name }));
    await expect(control).toBeVisible();
    boxes.push((await control.boundingBox())!);
  }
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.y + box.height / 2 - (boxes[0].y + boxes[0].height / 2))).toBeLessThan(2);
    expect(box.x).toBeGreaterThanOrEqual(edge.x);
    expect(box.x + box.width).toBeLessThanOrEqual(edge.x + edge.width);
  }
}

test("an agent adds a listing with photos; it leads their profile, opens full screen, and is found in Search until it's hidden", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "liv.listings@example.com", "Liv Listings");
  await agent.goto("/dashboard/listings");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Listings");
  await agent.getByRole("link", { name: "Add a listing" }).click();
  // One way at a time: it opens on "Find it" alone, and entering one by hand is asked for under it.
  await expect(agent.getByRole("region", { name: "Find it" })).toBeVisible();
  await expect(agent.getByRole("form", { name: "Listing details" })).toHaveCount(0);
  await expect(agent.getByRole("main").getByRole("heading", { level: 2 })).toHaveText(["Find it"]);
  const form = await enterListingYourself(agent);
  // The cursor is in its first box, and the page's address says it's open: a reload keeps it so.
  await expect(form.getByLabel("Street address")).toBeFocused();
  await expect(agent).toHaveURL(/\/dashboard\/listings\/new\?manual=1$/);
  await agent.reload();
  await expect(form).toBeVisible();
  await expect(agent.getByRole("button", { name: "Not there? Enter it yourself" })).toHaveCount(0);

  // What's wrong is said, by the field.
  await form.getByLabel("Street address").fill(ADDRESS);
  await form.getByLabel("City").fill("Tacoma");
  await form.getByLabel("ZIP").fill("9840");
  await form.getByLabel("Price", { exact: true }).fill("$425,000");
  await form.getByLabel("Beds").fill("3");
  await form.getByLabel("Baths").fill("2");
  await form.getByLabel("Sq ft", { exact: true }).fill("1,640");
  await form.getByLabel("Description").fill("New roof, original fir floors.");
  await form.getByRole("button", { name: "Add listing" }).click();
  await expect(form.getByRole("alert")).toHaveText("Enter a 5-digit ZIP code.");
  // What was typed is still there: only the ZIP needs fixing.
  await expect(form.getByLabel("Street address")).toHaveValue(ADDRESS);
  await form.getByLabel("ZIP").fill("98402");
  await form.getByRole("button", { name: "Add listing" }).click();
  // Back to their listings, where it is: kept, but not on their profile until it has a photo.
  await agent.waitForURL(/\/dashboard\/listings$/);
  const row = agent.getByRole("list", { name: "Your listings" }).getByRole("listitem").filter({ hasText: ADDRESS });
  await expect(row).toContainText("Add a photo to show it");
  // Not on her profile, so nothing to send or to star (and no line about the star).
  await expect(row.getByRole("link", { name: `Send ${ADDRESS}` })).toHaveCount(0);
  await expect(row.getByRole("button", { name: `Feature ${ADDRESS}` })).toHaveCount(0);
  await expect(agent.getByRole("link", { name: "Change the layout" })).toBeVisible();
  await expect(agent.getByRole("main")).not.toContainText("starred listing");
  await row.getByRole("link", { name: `Edit ${ADDRESS}` }).click();
  await agent.waitForURL(/\/dashboard\/listings\/OWN-[\w-]+$/);
  const editUrl = new URL(agent.url()).pathname;
  const key = decodeURIComponent(editUrl.split("/").pop()!);
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(agent.url()).pathname;
  await expect(agent.getByRole("main")).not.toContainText(ADDRESS);

  // Two photos; the second made first.
  await agent.goto(editUrl);
  const photos = agent.getByRole("region", { name: "Photos" });
  await photos.getByLabel("Add photos").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: PNG },
    { name: "two.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(photos.getByRole("list", { name: "Photos" }).getByRole("listitem")).toHaveCount(2);
  await expect(agent.getByRole("main")).toContainText("On your profile");
  const firstBefore = await photos.getByRole("img", { name: "Photo 1" }).getAttribute("src");
  await photos.getByRole("button", { name: "Make photo 2 first" }).click();
  await expect(photos.getByRole("img", { name: "Photo 1" })).not.toHaveAttribute("src", firstBefore!);

  // A visitor, signed out: it leads Liv's listings, and opens them full screen on it.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(profile);
  const grid = visitor.getByRole("list", { name: "Listings" });
  const tile = grid.getByRole("link", { name: new RegExp(ADDRESS) });
  await expect(tile).toContainText("$425,000");
  await expect(tile).toHaveAttribute("href", new RegExp(`^/reel\\?from=listings%3A[\\w-]+&home=${key}$`));
  // Its photo is served as a plain image. (The photos sit beside the words'
  // link: they swipe, and open it themselves.)
  const src = await grid.getByRole("group", { name: `Photos of ${ADDRESS}` }).locator("img").first().getAttribute("src");
  expect(src).toContain("listing-photo");
  // Found in Search, by its street, beside the MLS homes. (Not in Browse.)
  const searchFor = async () => (await visitor.request.get(`/search?q=${encodeURIComponent("Dealmaker")}`)).text();
  expect(await searchFor()).toContain(ADDRESS);
  // Listed by an agent: found among an agent's homes, not an investor's or the MLS's.
  const listedBy = async (by: string) => (await visitor.request.get(`/search?q=Dealmaker&by=${by}`)).text();
  expect(await listedBy("agent")).toContain(ADDRESS);
  expect(await listedBy("investor")).not.toContain(ADDRESS);
  expect(await listedBy("mls")).not.toContain(ADDRESS);
  expect(await (await visitor.request.get("/reel")).text()).not.toContain(ADDRESS);
  // Its own page works for anyone with the address.
  await visitor.goto(`/homes/${key}`);
  const home = visitor.getByRole("article", { name: ADDRESS });
  await expect(home).toContainText("$425,000");
  // (Who listed it is in "About this home", opened from the head over the photo; not in More.)
  const about = home.getByRole("region", { name: "About this home" });
  await expect(about).toBeHidden();
  await home.getByRole("button", { name: "About this home" }).click();
  await expect(about).toBeVisible();
  await expect(about).toContainText("Listed by Liv Listings");
  await visitor.keyboard.press("Escape");
  await expect(about).toBeHidden();
  await home.getByRole("button", { name: "More options" }).click();
  await expect(visitor.getByRole("dialog", { name: "More" })).not.toContainText("Listed by");
  await visitor.keyboard.press("Escape");

  // The price changed; then hidden: off the profile, still theirs.
  await agent.goto(editUrl);
  const details = agent.getByRole("form", { name: "Listing details" });
  await details.getByLabel("Price", { exact: true }).fill("399000");
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details.getByRole("status")).toHaveText("Saved");
  await visitor.goto(profile);
  await expect(grid.getByRole("link", { name: new RegExp(ADDRESS) })).toContainText("$399,000");

  // Marked closed, it's sold: out of the homes for sale, found under Sold,
  // or by "sold" or "closed" typed with the rest (the same thing here).
  await details.getByText("Closed", { exact: true }).click();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(agent.getByRole("main")).toContainText("Closed · On your profile");
  expect(await searchFor()).not.toContain(ADDRESS);
  const searchSold = async (query: string) => (await visitor.request.get(`/search?${query}`)).text();
  expect(await searchSold("q=Dealmaker&sold=1")).toContain(ADDRESS);
  expect(await searchSold(`q=${encodeURIComponent("sold Dealmaker")}`)).toContain(ADDRESS);
  expect(await searchSold(`q=${encodeURIComponent("Dealmaker, closed")}`)).toContain(ADDRESS);
  await visitor.goto("/search?q=Dealmaker");
  await expect(visitor.getByRole("article", { name: ADDRESS })).toHaveCount(0);
  await visitor.locator('[data-filter="status"]').click();
  await visitor.getByRole("radio", { name: "Sold" }).check();
  await expect(visitor).toHaveURL(/sold=1/);
  await expect(visitor.getByRole("article", { name: ADDRESS })).toBeVisible();
  await expect(visitor.locator('[data-filter="status"]')).toHaveText("Sold");

  // Hidden (closed or not): off the profile and out of Search, still theirs.
  await details.getByLabel("Show on my profile").uncheck();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(agent.getByRole("main")).toContainText("Hidden");
  await visitor.goto(profile);
  await expect(visitor.getByRole("main")).not.toContainText(ADDRESS);
  // Hidden, it's out of Search too.
  expect(await searchFor()).not.toContain(ADDRESS);
  expect(await searchSold("q=Dealmaker&sold=1")).not.toContain(ADDRESS);
  await agent.goto("/dashboard/listings");
  await expect(agent.getByRole("list", { name: "Your listings" })).toContainText(ADDRESS);

  // Nobody else can open it to edit: another agent, or a buyer.
  const other = await signInAgent(browser, "otto.listings@example.com", "Otto Listings");
  expect((await other.request.get(editUrl)).status()).toBe(404);
  const buyer = await signUpBuyer(browser, "bo.listings@example.com", "Bo Listings");
  await buyer.goto(editUrl);
  await expect(buyer).not.toHaveURL(new RegExp(editUrl));

  // Deleted, asked twice: gone from their list.
  await agent.goto(editUrl);
  await agent.getByRole("button", { name: "Delete this listing" }).click();
  await agent.getByRole("button", { name: "Tap again to delete it" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  await expect(agent.getByRole("main")).not.toContainText(ADDRESS);
  // And its photo with it.
  const photo = decodeURIComponent(src!).match(/\/listing-photo\/[0-9a-f-]+/)![0];
  expect((await visitor.request.get(photo)).status()).toBe(404);
});

test("a listing added with its photos in one go is on their profile at once, with Edit under it on their own profile", async ({
  browser,
}) => {
  const agent = await signInAgent(browser, "gus.listings@example.com", "Gus Listings");
  await agent.goto("/dashboard/listings/new");
  const form = await enterListingYourself(agent);
  await form.getByLabel("Add photos").setInputFiles([
    { name: "one.png", mimeType: "image/png", buffer: PNG },
    { name: "two.png", mimeType: "image/png", buffer: PNG },
  ]);
  await expect(form.getByRole("list", { name: "Photos to add" }).getByRole("listitem")).toHaveCount(2);
  await form.getByRole("button", { name: "Remove photo 2" }).click();
  await expect(form.getByRole("list", { name: "Photos to add" }).getByRole("listitem")).toHaveCount(1);
  await form.getByLabel("Street address").fill("9 Onestep Ct");
  await form.getByLabel("City").fill("Kent");
  await form.getByLabel("ZIP").fill("98030");
  await form.getByLabel("Price", { exact: true }).fill("510000");
  await form.getByLabel("Beds").fill("4");
  await form.getByLabel("Baths").fill("2");
  await form.getByLabel("Sq ft", { exact: true }).fill("1900");
  await form.getByRole("button", { name: "Add listing" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  const row = agent.getByRole("list", { name: "Your listings" }).getByRole("listitem").filter({ hasText: "9 Onestep Ct" });
  await expect(row).toContainText("On your profile");

  // Their own profile opens on it, with the way to change it right under it.
  await agent.goto("/people/me");
  const grid = agent.getByRole("list", { name: "Listings" });
  await expect(grid.getByRole("link", { name: /9 Onestep Ct/ }).first()).toBeVisible();
  await expect(grid.getByRole("link", { name: "Edit 9 Onestep Ct" })).toHaveAttribute("href", /^\/dashboard\/listings\/OWN-/);
  // Nobody else gets that.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(new URL(agent.url()).pathname);
  await expect(visitor.getByRole("list", { name: "Listings" }).getByRole("link", { name: /9 Onestep Ct/ })).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Edit 9 Onestep Ct" })).toHaveCount(0);
});

test("a home found by its address is added with one tap, says who listed it, and comes off again", async ({ browser }) => {
  const agent = await signInAgent(browser, "fay.listings@example.com", "Fay Listings");
  await agent.goto("/dashboard/listings/new");
  const find = agent.getByRole("region", { name: "Find it" });
  await find.getByRole("searchbox", { name: "Find it by address, city, ZIP or MLS number" }).fill("Quillan");
  await find.getByRole("button", { name: "Add 1204 Quillan St SE" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  const row = agent.getByRole("list", { name: "Your listings" }).getByRole("listitem").filter({ hasText: "1204 Quillan St SE" });
  await expect(row).toContainText("On your profile");
  // It can be sent from here: the way to a link, with this home picked.
  await expect(row.getByRole("link", { name: "Send 1204 Quillan St SE" })).toHaveAttribute("href", "/dashboard/new?home=SAMPLE-1009");
  // On a small phone (360px) Send, Remove and the star share one line under the words.
  await agent.setViewportSize({ width: 360, height: 740 });
  await expectOneLine(row, ["Send 1204 Quillan St SE", "Remove 1204 Quillan St SE", "Feature 1204 Quillan St SE"]);
  expect(await agent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Found again (by its street and city this time), it says it's already there.
  await agent.goto("/dashboard/listings/new");
  await find.getByRole("searchbox", { name: "Find it by address, city, ZIP or MLS number" }).fill("1204 Quillan St SE, Olympia");
  await expect(find.getByRole("list", { name: "Homes found" })).toContainText("Added");
  await expect(find.getByRole("button", { name: "Add 1204 Quillan St SE" })).toHaveCount(0);

  // On her profile for anyone, with whoever listed it named under it: it's the home everyone shares.
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(agent.url()).pathname;
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(profile);
  const tile = visitor.getByRole("list", { name: "Listings" }).getByRole("link", { name: /1204 Quillan St SE/ });
  await expect(tile).toContainText("Listed by Daniel Okafor");
  await expect(tile).toHaveAttribute("href", /home=SAMPLE-1009$/);

  // Removed: off her profile; the home itself is still there.
  await agent.goto("/dashboard/listings");
  await row.getByRole("button", { name: "Remove 1204 Quillan St SE" }).click();
  await expect(row).toHaveCount(0);
  await visitor.goto(profile);
  await expect(visitor.getByRole("main")).not.toContainText("1204 Quillan St SE");
  expect((await visitor.request.get("/homes/SAMPLE-1009")).status()).toBe(200);
});

test("a deal's own numbers show when they're given, and the price per square foot only when it's wanted", async ({ browser }) => {
  const agent = await signInAgent(browser, "ivy.listings@example.com", "Ivy Listings");
  await agent.setViewportSize({ width: 1440, height: 900 });
  await agent.goto("/dashboard/listings/new");
  const form = await enterListingYourself(agent);
  await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
  await form.getByLabel("Street address").fill("31 Flipper Ln");
  await form.getByLabel("City").fill("Auburn");
  await form.getByLabel("ZIP").fill("98001");
  await form.getByLabel("Price", { exact: true }).fill("300000");
  await form.getByLabel("Beds").fill("3");
  await form.getByLabel("Baths").fill("1");
  await form.getByLabel("Sq ft", { exact: true }).fill("1200");
  const more = form.getByRole("group", { name: "More to show (optional)" });
  await more.getByLabel("After repair value").fill("$465,000");
  await more.getByLabel("Estimated rehab").fill("60000");
  await more.getByLabel("Show price per sq ft").uncheck();
  await form.getByRole("button", { name: "Add listing" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  await agent.getByRole("link", { name: "Edit 31 Flipper Ln" }).click();
  await agent.waitForURL(/\/dashboard\/listings\/OWN-[\w-]+$/);
  const editUrl = new URL(agent.url()).pathname;
  const key = decodeURIComponent(editUrl.split("/").pop()!);

  // On the home itself, beside the photo: the details open from the panel's
  // "more" (the deal's numbers, and no price per square foot).
  const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await visitor.goto(`/homes/${key}`);
  const home = visitor.getByRole("article", { name: "31 Flipper Ln" });
  const facts = home.getByRole("list", { name: "The details" });
  await expect(facts).toHaveCount(0);
  await home.getByRole("button", { name: "more", exact: true }).click();
  await expect(facts).toContainText("After repair value");
  await expect(facts).toContainText("$465,000");
  await expect(facts).toContainText("Estimated rehab");
  await expect(facts).toContainText("$60,000");
  await expect(home).not.toContainText("Price per sq ft");

  // Emptied and ticked again: the numbers go, the price per square foot comes back.
  const details = agent.getByRole("form", { name: "Listing details" });
  await expect(details.getByLabel("After repair value")).toHaveValue("465000");
  await details.getByLabel("After repair value").fill("");
  await details.getByLabel("Estimated rehab").fill("");
  await details.getByLabel("Show price per sq ft").check();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details.getByRole("status")).toHaveText("Saved");
  await visitor.reload();
  await home.getByRole("button", { name: "more", exact: true }).click();
  await expect(facts).toContainText("Price per sq ft");
  await expect(facts).toContainText("$250");
  await expect(home).not.toContainText(/After repair value|Estimated rehab/);
});

test("an MLS listing of theirs is changed through their own copy, which takes its place on their profile", async ({ browser }) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "elise.copy@example.com", "Elise Navarro");
  await agent.goto("/dashboard/profile");
  await agent.getByLabel("MLS ID (optional)").fill("DEMO-1004");
  await saveDetails(agent);

  // Her two listings from the MLS, each with Edit.
  await agent.goto("/dashboard/listings");
  // (Her listings are a place of their own, under her face: not a tab of Clients.)
  await expect(agent.getByRole("navigation", { name: "Clients" })).toHaveCount(0);
  const fromMls = agent.getByRole("list", { name: "Listings from the MLS" });
  await expect(fromMls.getByRole("listitem")).toHaveCount(2);
  // Each can be sent as it is, and what the star does is said once above them.
  await expect(fromMls.getByRole("link", { name: /^Send / })).toHaveCount(2);
  await expect(fromMls.getByRole("link", { name: "Send 96 Fernhollow Ln" })).toHaveAttribute("href", "/dashboard/new?home=SAMPLE-1004");
  await expect(agent.getByRole("main")).toContainText("The starred listing shows first on your profile.");
  await fromMls.getByRole("button", { name: "Edit 96 Fernhollow Ln" }).click();
  await agent.waitForURL(/\/dashboard\/listings\/OWN-[\w-]+$/);
  const editUrl = new URL(agent.url()).pathname;
  // Her copy: its facts and photos as they were, hers to change.
  const details = agent.getByRole("form", { name: "Listing details" });
  await expect(details.getByLabel("Street address")).toHaveValue("96 Fernhollow Ln");
  await expect(details.getByLabel("Price", { exact: true })).toHaveValue("839000");
  expect(await agent.getByRole("region", { name: "Photos" }).getByRole("list", { name: "Photos" }).getByRole("listitem").count()).toBeGreaterThan(0);
  await details.getByLabel("Price", { exact: true }).fill("815000");
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details.getByRole("status")).toHaveText("Saved");

  // With hers now, and no longer listed twice; asked again, there's nothing more to copy.
  await agent.goto("/dashboard/listings");
  await expect(agent.getByRole("list", { name: "Your listings" })).toContainText("96 Fernhollow Ln");
  await expect(fromMls.getByRole("listitem")).toHaveCount(1);
  await expect(fromMls).not.toContainText("96 Fernhollow Ln");

  // On her profile: once, at her price; the MLS's own home is untouched.
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(new URL(agent.url()).pathname);
  const tiles = visitor.getByRole("list", { name: "Listings" }).getByRole("link", { name: /96 Fernhollow Ln/ });
  await expect(tiles).toHaveCount(1);
  await expect(tiles).toContainText("$815,000");
  await visitor.goto("/homes/SAMPLE-1004");
  await expect(visitor.getByRole("article", { name: "96 Fernhollow Ln" })).toContainText("$839,000");

  // Everyone browsing meets the MLS's home, so that's where the likes are:
  // her copy's tile counts them with its own, each person once.
  const likesOnTile = async () => {
    await visitor.goto(new URL(agent.url()).pathname);
    await expect(tiles).toHaveCount(1);
    return Number(((await tiles.textContent()) ?? "").match(/(\d+)\s*likes?/)?.[1] ?? 0);
  };
  const before = await likesOnTile();
  const fan = await signUpBuyer(browser, `fern.fan.${Date.now()}@example.com`, "Fern");
  await fan.goto("/homes/SAMPLE-1004");
  const original = fan.getByRole("article", { name: "96 Fernhollow Ln" });
  await heartOf(original).click();
  await expect(heartOf(original)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(likesOnTile).toBe(before + 1);
  // The same person likes her copy too, opened from her profile: still once.
  await fan.goto(new URL(agent.url()).pathname);
  await fan.getByRole("list", { name: "Listings" }).getByRole("link", { name: /96 Fernhollow Ln/ }).first().click();
  await fan.waitForURL(/\/reel\?from=listings/);
  const copy = fan.getByRole("article", { name: "96 Fernhollow Ln" });
  await expect(copy).toContainText("$815,000");
  await heartOf(copy).click();
  await expect(heartOf(copy)).toHaveAttribute("aria-pressed", "true");
  expect(await likesOnTile()).toBe(before + 1);
  // And someone else, on the copy alone: one more.
  const second = await signUpBuyer(browser, `saul.second.${Date.now()}@example.com`, "Saul");
  await second.goto(new URL(agent.url()).pathname);
  await second.getByRole("list", { name: "Listings" }).getByRole("link", { name: /96 Fernhollow Ln/ }).first().click();
  await second.waitForURL(/\/reel\?from=listings/);
  const his = second.getByRole("article", { name: "96 Fernhollow Ln" });
  await heartOf(his).click();
  await expect(heartOf(his)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(likesOnTile).toBe(before + 2);

  // Someone else can't make a copy of hers: another agent's page for it isn't there.
  const other = await signInAgent(browser, "omar.copy@example.com", "Omar Copy");
  expect((await other.request.get(editUrl)).status()).toBe(404);
});

test("a video by its link plays with the photos, after them; a link that isn't one is refused", async ({ browser }) => {
  const agent = await signInAgent(browser, "val.listings@example.com", "Val Listings");
  await agent.goto("/dashboard/listings/new");
  const form = await enterListingYourself(agent);
  await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
  await form.getByLabel("Street address").fill("5 Walkthrough Way");
  await form.getByLabel("City").fill("Renton");
  await form.getByLabel("ZIP").fill("98055");
  await form.getByLabel("Price", { exact: true }).fill("640000");
  await form.getByLabel("Beds").fill("3");
  await form.getByLabel("Baths").fill("2");
  await form.getByLabel("Sq ft", { exact: true }).fill("1500");
  await form.getByRole("button", { name: "Add listing" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  await agent.getByRole("link", { name: "Edit 5 Walkthrough Way" }).click();
  await agent.waitForURL(/\/dashboard\/listings\/OWN-[\w-]+$/);
  const key = decodeURIComponent(new URL(agent.url()).pathname.split("/").pop()!);

  const videos = agent.getByRole("region", { name: "Videos" });
  // (No file storage here, so no uploading: by link only.)
  await expect(videos.getByText("Upload a video")).toHaveCount(0);
  await videos.getByLabel("Video link").fill("https://example.com/not-a-video");
  await videos.getByRole("button", { name: "Add" }).click();
  await expect(videos.getByRole("alert")).toHaveText("Paste a YouTube, Vimeo or Loom link.");
  await videos.getByLabel("Video link").fill("https://youtu.be/dQw4w9WgXcQ");
  await videos.getByRole("button", { name: "Add" }).click();
  await expect(videos.getByRole("list", { name: "Videos" }).getByRole("listitem")).toHaveText(/YouTube video/);
  await expect(videos.getByLabel("Video link")).toHaveValue("");
  // The same one twice is refused.
  await videos.getByLabel("Video link").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await videos.getByRole("button", { name: "Add" }).click();
  await expect(videos.getByRole("alert")).toHaveText("That video is already on it.");
  // Still on their profile with its photo leading: the video never leads.
  await expect(agent.getByRole("main")).toContainText("On your profile");
  await expect(agent.getByRole("region", { name: "Photos" }).getByRole("list", { name: "Photos" }).getByRole("listitem")).toHaveCount(1);

  // On the home: its photo first, then the video, its still until it's on screen.
  const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await visitor.goto(`/homes/${key}`);
  const home = visitor.getByRole("article", { name: "5 Walkthrough Way" });
  const still = home.getByRole("img", { name: "YouTube video" });
  await expect(still).toHaveCount(1);
  await expect(still.locator("img")).toHaveAttribute("src", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  await expect(home.locator("iframe")).toHaveCount(0);
  // On it, it plays by itself, silently, and its sound is a tap away.
  await home.getByRole("button", { name: "Next photo" }).click();
  const player = home.locator("iframe");
  await expect(player).toHaveAttribute("src", /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&mute=1/);
  await expect(home).toBeInViewport({ ratio: 0.9 });
  await expect(async () => {
    await home.getByRole("button", { name: "Turn sound on" }).click({ timeout: 2000 });
    await expect(player).toHaveAttribute("src", /autoplay=1&mute=0/, { timeout: 1000 });
  }).toPass();
  await expect(home.getByRole("button", { name: "Turn sound off" })).toHaveAttribute("aria-pressed", "true");

  // Taken off again.
  await videos.getByRole("button", { name: "Remove video 1" }).click();
  await expect(videos.getByRole("list", { name: "Videos" })).toHaveCount(0);
});

test("an agent chooses how their listings are laid out, which one leads, and marks one closed", async ({ browser }) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "lou.listings@example.com", "Lou Listings");
  const add = async (address: string, price: string) => {
    await agent.goto("/dashboard/listings/new");
    const form = await enterListingYourself(agent);
    await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
    await form.getByLabel("Street address").fill(address);
    await form.getByLabel("City").fill("Burien");
    await form.getByLabel("ZIP").fill("98166");
    await form.getByLabel("Price", { exact: true }).fill(price);
    await form.getByLabel("Beds").fill("3");
    await form.getByLabel("Baths").fill("2");
    await form.getByLabel("Sq ft", { exact: true }).fill("1400");
    await form.getByRole("button", { name: "Add listing" }).click();
    await agent.waitForURL(/\/dashboard\/listings$/);
  };
  await add("1 Layout Ln", "500000");
  await add("2 Layout Ln", "600000");
  await add("3 Layout Ln", "700000");
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(agent.url()).pathname;
  const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const grid = visitor.getByRole("list", { name: "Listings" });
  const tiles = grid.getByRole("listitem");
  const widthOf = async (n: number) => (await tiles.nth(n).boundingBox())!.width;

  // To start with: featured, the newest leading, full width, the rest two across.
  await visitor.goto(profile);
  await expect(grid).toHaveAttribute("data-layout", "featured");
  await expect(tiles.nth(0)).toContainText("3 Layout Ln");
  expect(await widthOf(0)).toBeGreaterThan((await widthOf(1)) * 1.8);

  // Another one leads.
  await agent.goto("/dashboard/listings");
  await agent.getByRole("button", { name: "Feature 1 Layout Ln" }).click();
  await expect(agent.getByRole("button", { name: "1 Layout Ln is featured" })).toHaveAttribute("aria-pressed", "true");
  await visitor.reload();
  await expect(tiles.nth(0)).toContainText("1 Layout Ln");

  // Three across: all the same size, still in that order. (The layout is
  // among their profile's settings, a link away from their listings.)
  await agent.getByRole("link", { name: "Change the layout" }).click();
  await agent.waitForURL(/\/people\/me\/edit#layout$/);
  const layout = agent.getByRole("radiogroup", { name: "Layout on your profile" });
  await expect(layout.getByRole("radio", { name: "Featured" })).toHaveAttribute("aria-checked", "true");
  await layout.getByRole("radio", { name: "3 across" }).click();
  await expect(agent.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await visitor.reload();
  await expect(grid).toHaveAttribute("data-layout", "grid3");
  expect(Math.abs((await widthOf(0)) - (await widthOf(2)))).toBeLessThan(2);
  expect((await tiles.nth(0).boundingBox())!.y).toBe((await tiles.nth(2).boundingBox())!.y);
  await expect(tiles.nth(0)).toContainText("1 Layout Ln");

  // A plain list: one under the other.
  await layout.getByRole("radio", { name: "List" }).click();
  await expect(layout.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  await visitor.reload();
  await expect(grid).toHaveAttribute("data-layout", "list");
  expect((await tiles.nth(1).boundingBox())!.y).toBeGreaterThan((await tiles.nth(0).boundingBox())!.y);
  expect(Math.abs((await tiles.nth(1).boundingBox())!.x - (await tiles.nth(0).boundingBox())!.x)).toBeLessThan(2);

  // One marked closed: still on the profile, and it says so.
  await agent.goto("/dashboard/listings");
  await agent.getByRole("link", { name: "Edit 2 Layout Ln" }).click();
  await agent.waitForURL(/\/dashboard\/listings\/OWN-[\w-]+$/);
  const details = agent.getByRole("form", { name: "Listing details" });
  await expect(details.getByRole("radio", { name: "Available" })).toBeChecked();
  await details.getByText("Closed", { exact: true }).click();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details.getByRole("status")).toHaveText("Saved");
  await expect(agent.getByRole("main")).toContainText("Closed · On your profile");
  await visitor.reload();
  const closed = tiles.filter({ hasText: "2 Layout Ln" });
  await expect(closed).toContainText("Closed");
  await expect(tiles.filter({ hasText: "3 Layout Ln" })).not.toContainText("Closed");
  // Closed and hidden are different things: hidden, it's off the profile, and still closed when it's back.
  await details.getByLabel("Show on my profile").uncheck();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(agent.getByRole("main")).toContainText("Hidden");
  await visitor.reload();
  await expect(grid).not.toContainText("2 Layout Ln");
  await agent.reload();
  await expect(details.getByRole("radio", { name: "Closed" })).toBeChecked();
});

test("on a phone a listing's address and price are never cut short, and Send starts a link with that listing picked", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const LONG = "18204 Northeast Meadowbrook Parkway Unit 12B";
  const agent = await signInAgent(browser, "pam.listings@example.com", "Pam Listings");
  await agent.setViewportSize({ width: 390, height: 780 });
  await agent.goto("/dashboard/listings/new");
  const form = await enterListingYourself(agent);
  await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
  await form.getByLabel("Street address").fill(LONG);
  await form.getByLabel("City").fill("Sedro-Woolley");
  await form.getByLabel("ZIP").fill("98284");
  await form.getByLabel("Price", { exact: true }).fill("1250000");
  await form.getByLabel("Beds").fill("4");
  await form.getByLabel("Baths").fill("3");
  await form.getByLabel("Sq ft", { exact: true }).fill("2600");
  await form.getByRole("button", { name: "Add listing" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  const row = agent.getByRole("list", { name: "Your listings" }).getByRole("listitem").filter({ hasText: LONG });
  await expect(row).toContainText("On your profile");

  // All of the address and the price line, on as many lines as they take:
  // nothing clipped, nothing off the side of the screen.
  const whole = (line: Locator) =>
    line.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth && box.left >= 0 && box.right <= window.innerWidth;
    });
  const address = row.getByRole("heading", { name: LONG });
  await expect(address).toBeVisible();
  expect(await whole(address)).toBe(true);
  // (It's too long for one line at this width, so it's on two or more.)
  expect((await address.boundingBox())!.height).toBeGreaterThan(40);
  expect(await whole(row.getByText("$1,250,000 · Sedro-Woolley"))).toBe(true);
  expect(await agent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Under the words: Send and Edit side by side, the star at the end; the same on a smaller phone.
  const controls = [`Send ${LONG}`, `Edit ${LONG}`, `Feature ${LONG}`];
  await expectOneLine(row, controls);
  expect((await row.getByRole("link", { name: `Send ${LONG}` }).boundingBox())!.y).toBeGreaterThan(
    (await address.boundingBox())!.y + (await address.boundingBox())!.height,
  );
  await agent.setViewportSize({ width: 360, height: 740 });
  await expectOneLine(row, controls);
  expect(await whole(address)).toBe(true);
  expect(await agent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // What the star does is said once, above the rows.
  await expect(agent.getByRole("main")).toContainText("The starred listing shows first on your profile.");

  // Send: on to Send homes, with this listing already picked.
  await agent.setViewportSize({ width: 390, height: 780 });
  await row.getByRole("link", { name: `Send ${LONG}` }).click();
  await agent.waitForURL(/\/dashboard\/new\?home=OWN-[\w-]+$/);
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Send this home");
  const picked = agent.getByRole("button", { pressed: true });
  await expect(picked).toHaveCount(1);
  await expect(picked).toContainText(LONG);
  await expect(agent.getByRole("button", { name: "Next", exact: true })).toBeEnabled();

  // Closed, it stays on her profile (so it keeps its star), but a link takes only homes for sale: no Send.
  await agent.goto("/dashboard/listings");
  await row.getByRole("link", { name: `Edit ${LONG}` }).click();
  await agent.waitForURL(/\/dashboard\/listings\/OWN-[\w-]+$/);
  const details = agent.getByRole("form", { name: "Listing details" });
  await details.getByText("Closed", { exact: true }).click();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details.getByRole("status")).toHaveText("Saved");
  await agent.goto("/dashboard/listings");
  await expect(row).toContainText("Closed · On your profile");
  await expect(row.getByRole("link", { name: `Send ${LONG}` })).toHaveCount(0);
  await expect(row.getByRole("link", { name: `Edit ${LONG}` })).toBeVisible();
  await expect(row.getByRole("button", { name: `Feature ${LONG}` })).toBeVisible();
});

test("an agent's listings sort newest or most active, and a closed deal still takes likes and comments", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const agent = await signInAgent(browser, "sol.sorter@example.com", "Sol Sorter");
  const add = async (address: string) => {
    await agent.goto("/dashboard/listings/new");
    const form = await enterListingYourself(agent);
    await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
    await form.getByLabel("Street address").fill(address);
    await form.getByLabel("City").fill("Burien");
    await form.getByLabel("ZIP").fill("98166");
    await form.getByLabel("Price", { exact: true }).fill("450000");
    await form.getByLabel("Beds").fill("3");
    await form.getByLabel("Baths").fill("2");
    await form.getByLabel("Sq ft", { exact: true }).fill("1400");
    await form.getByRole("button", { name: "Add listing" }).click();
    await agent.waitForURL(/\/dashboard\/listings$/);
  };
  await add("1 Sort Ln");
  await add("2 Sort Ln");
  await add("3 Sort Ln");
  // The newest is a deal done: it goes after the ones still available.
  await agent.getByRole("link", { name: "Edit 3 Sort Ln" }).click();
  const details = agent.getByRole("form", { name: "Listing details" });
  await details.getByText("Closed", { exact: true }).click();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details.getByRole("status")).toHaveText("Saved");
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const profile = new URL(agent.url()).pathname;

  // Nothing featured: newest first (the closed one last), with Newest and
  // Most active to pick from.
  const fan = await signUpBuyer(browser, `cleo.closed.${Date.now()}@example.com`, "Cleo");
  await fan.goto(profile);
  const sorts = fan.getByRole("group", { name: "Sort listings" });
  await expect(sorts.getByRole("link")).toHaveText(["Newest", "Most active"]);
  await expect(sorts.getByRole("link", { name: "Newest" })).toHaveAttribute("aria-current", "true");
  const tiles = fan.getByRole("list", { name: "Listings" }).getByRole("listitem");
  await expect(tiles.nth(0)).toContainText("2 Sort Ln");
  await expect(tiles.nth(1)).toContainText("1 Sort Ln");
  await expect(tiles.nth(2)).toContainText("3 Sort Ln");

  // The closed one takes a like and a comment from someone signed in.
  await tiles.nth(2).getByRole("link").first().click();
  await fan.waitForURL(/\/reel\?from=listings/);
  const closed = fan.getByRole("article", { name: "3 Sort Ln" });
  await heartOf(closed).click();
  await expect(heartOf(closed)).toHaveAttribute("aria-pressed", "true");
  await closed.getByRole("button", { name: "Add a comment…" }).click();
  const sheet = closed.getByRole("region", { name: "Comments" });
  await sheet.getByLabel("Add a comment").fill("What a project");
  await sheet.getByLabel("Add a comment").press("Enter");
  await expect(sheet).toContainText("What a project");
  await expect(sheet).not.toContainText("sign in");

  // Most active: the closed one leads now, and the homes opened from there go in that order.
  await fan.goto(profile);
  await sorts.getByRole("link", { name: "Most active" }).click();
  await expect(sorts.getByRole("link", { name: "Most active" })).toHaveAttribute("aria-current", "true");
  await expect(tiles.nth(0)).toContainText("3 Sort Ln");
  await expect(tiles.nth(1)).toContainText("2 Sort Ln");
  await tiles.nth(0).getByRole("link").first().click();
  await fan.waitForURL(/from=listings%3A[\w-]+%3Aactive|from=listings:[\w-]+:active/);
  await expect(fan.getByText(/· 1 of 3$/).filter({ visible: true }).first()).toBeVisible();

  // One featured: Featured is the first choice, and it leads there.
  await agent.goto("/dashboard/listings");
  await agent.getByRole("button", { name: "Feature 2 Sort Ln" }).click();
  await expect(agent.getByRole("button", { name: "2 Sort Ln is featured" })).toHaveAttribute("aria-pressed", "true");
  await fan.goto(profile);
  await expect(sorts.getByRole("link")).toHaveText(["Featured", "Newest", "Most active"]);
  await expect(tiles.nth(0)).toContainText("2 Sort Ln");
  await expect(tiles.nth(2)).toContainText("3 Sort Ln");
  await sorts.getByRole("link", { name: "Newest" }).click();
  await expect(sorts.getByRole("link", { name: "Newest" })).toHaveAttribute("aria-current", "true");
  await expect(tiles.nth(0)).toContainText("2 Sort Ln");
  await expect(tiles.nth(2)).toContainText("3 Sort Ln");
});
