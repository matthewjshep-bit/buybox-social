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

test("an agent adds a listing with photos; it leads their profile, opens full screen, and stays out of what everyone browses", async ({
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
  // Its photo is served as a plain image.
  const src = await tile.locator("img").getAttribute("src");
  expect(src).toContain("listing-photo");
  // Not in the homes everyone browses, nor in a search for its street.
  expect(await (await visitor.request.get("/reel")).text()).not.toContain(ADDRESS);
  expect(await (await visitor.request.get(`/search?q=${encodeURIComponent("Dealmaker")}`)).text()).not.toContain(ADDRESS);
  // Its own page works for anyone with the address.
  await visitor.goto(`/homes/${key}`);
  const home = visitor.getByRole("article", { name: ADDRESS });
  await expect(home).toContainText("$425,000");
  await expect(home).toContainText("Listed by Liv Listings");

  // The price changed; then hidden: off the profile, still theirs.
  await agent.goto(editUrl);
  const details = agent.getByRole("form", { name: "Listing details" });
  await details.getByLabel("Price", { exact: true }).fill("399000");
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(details.getByRole("status")).toHaveText("Saved");
  await visitor.goto(profile);
  await expect(grid.getByRole("link", { name: new RegExp(ADDRESS) })).toContainText("$399,000");
  await details.getByLabel("Show on my profile").uncheck();
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(agent.getByRole("main")).toContainText("Hidden");
  await visitor.goto(profile);
  await expect(visitor.getByRole("main")).not.toContainText(ADDRESS);
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

  // On the home itself, beside the photo: the deal's numbers, and no price per square foot.
  const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await visitor.goto(`/homes/${key}`);
  const home = visitor.getByRole("article", { name: "31 Flipper Ln" });
  await expect(home).toContainText("After repair value");
  await expect(home).toContainText("$465,000");
  await expect(home).toContainText("Estimated rehab");
  await expect(home).toContainText("$60,000");
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
  await expect(home).toContainText("Price per sq ft");
  await expect(home).toContainText("$250");
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
  const agent = await signInAgent(browser, "vic.listings@example.com", "Vic Listings");
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

  // On the home: its photo first, then the video, waiting to be played.
  const visitor = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await visitor.goto(`/homes/${key}`);
  const home = visitor.getByRole("article", { name: "5 Walkthrough Way" });
  const play = home.getByRole("button", { name: /^Play video/ });
  await expect(play).toHaveCount(1);
  await expect(play.locator("img")).toHaveAttribute("src", "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");

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
