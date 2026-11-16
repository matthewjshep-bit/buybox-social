// Listings an agent (or an investor showing their deals) adds themselves:
// what it is, its photos, whether it's on their profile. Theirs to change
// and take away; on their profile for anyone; never in the homes everyone
// browses, and never anyone else's to edit.
import { expect, test } from "@playwright/test";
import { signInAgent, signUpBuyer } from "./helpers";

// A tiny PNG, as a photo would arrive.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);
const ADDRESS = "742 Dealmaker Ave";

test("an agent adds a listing with photos; it leads their profile, opens full screen, and stays out of what everyone browses", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "liv.listings@example.com", "Liv Listings");
  await agent.goto("/dashboard/listings");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Listings");
  await agent.getByRole("link", { name: "Add a listing" }).click();
  const form = agent.getByRole("form", { name: "Listing details" });

  // What's wrong is said, by the field.
  await form.getByLabel("Street address").fill(ADDRESS);
  await form.getByLabel("City").fill("Tacoma");
  await form.getByLabel("ZIP").fill("9840");
  await form.getByLabel("Price").fill("$425,000");
  await form.getByLabel("Beds").fill("3");
  await form.getByLabel("Baths").fill("2");
  await form.getByLabel("Sq ft").fill("1,640");
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
  await details.getByLabel("Price").fill("399000");
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
  const form = agent.getByRole("form", { name: "Listing details" });
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
  await form.getByLabel("Price").fill("510000");
  await form.getByLabel("Beds").fill("4");
  await form.getByLabel("Baths").fill("2");
  await form.getByLabel("Sq ft").fill("1900");
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
  await find.getByRole("searchbox", { name: "Find it by address or MLS number" }).fill("Quillan");
  await find.getByRole("button", { name: "Add 1204 Quillan St SE" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);
  const row = agent.getByRole("list", { name: "Your listings" }).getByRole("listitem").filter({ hasText: "1204 Quillan St SE" });
  await expect(row).toContainText("On your profile");
  // Found again, it says it's already there.
  await agent.goto("/dashboard/listings/new");
  await find.getByRole("searchbox", { name: "Find it by address or MLS number" }).fill("Quillan");
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
