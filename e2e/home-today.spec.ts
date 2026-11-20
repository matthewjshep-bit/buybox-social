// Home, signed in: one feed for everyone, never empty. What the people you
// follow did, woven together with what everyone's liking this week, new deals
// and listings pros just put up, homes near where you said you are, and homes
// picked for you. An agent's clients aren't on it: they're on Clients.
import { expect, test, type Locator } from "@playwright/test";
import { enterListingYourself, heartOf, signInAgent, signUpBuyer } from "./helpers";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);

test("someone who follows nobody still has a full feed: popular homes, a new listing, homes near them, homes picked for them; people to follow among it on a phone", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  // An agent puts up a listing of their own.
  const agent = await signInAgent(browser, "lin-newlisting@example.com", "Lin Newlisting");
  await agent.goto("/dashboard/listings/new");
  const form = await enterListingYourself(agent);
  await form.getByLabel("Add photos").setInputFiles([{ name: "one.png", mimeType: "image/png", buffer: PNG }]);
  await form.getByLabel("Street address").fill("77 Fresh Start Rd");
  await form.getByLabel("City").fill("Tacoma");
  await form.getByLabel("ZIP").fill("98402");
  await form.getByLabel("Price", { exact: true }).fill("455000");
  await form.getByLabel("Beds").fill("3");
  await form.getByLabel("Baths").fill("2");
  await form.getByLabel("Sq ft", { exact: true }).fill("1500");
  await form.getByRole("button", { name: "Add listing" }).click();
  await agent.waitForURL(/\/dashboard\/listings$/);

  // Someone else likes a home: it's popular this week.
  const fan = await signUpBuyer(browser, "pia-popular@example.com", "Pia Popular");
  await fan.goto("/homes/SAMPLE-1009");
  const quillan = fan.getByRole("article", { name: "1204 Quillan St SE" });
  await heartOf(quillan).click();
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");

  // Una, new, follows nobody; she says where she is on Edit profile.
  const page = await signUpBuyer(browser, "una-today@example.com", "Una Today");
  await page.goto("/people/me/edit");
  const where = page.getByRole("form", { name: "Your location" });
  await where.getByLabel("City and state").fill("Olympia, WA");
  await where.getByRole("button", { name: "Save location" }).click();
  await expect(where.getByRole("status")).toHaveText("Saved");
  await page.goto("/people/me");
  await expect(page.getByText("Olympia, WA")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, Una");
  // One feed: nothing to choose between.
  await expect(page.getByRole("group", { name: "Show" })).toHaveCount(0);
  const stream = page.getByRole("region", { name: "Your feed" });
  const cards = stream.getByRole("listitem").filter({ has: page.getByRole("link", { name: /^.+: / }) });
  expect(await cards.count()).toBeGreaterThanOrEqual(6);
  // Each says why it's there.
  // (However many others like it too, in a run with other tests.)
  await expect(stream.getByText(/^Popular this week · \d+ likes?/).first()).toBeVisible();
  await expect(stream.getByRole("link", { name: /^1204 Quillan St SE: Popular this week/ })).toHaveCount(1);
  await expect(stream.getByText("Lin Newlisting", { exact: true }).first()).toBeVisible();
  await expect(stream.getByRole("link", { name: "77 Fresh Start Rd: Lin Newlisting added a new listing" })).toHaveCount(1);
  // (Olympia's one home is in it as popular already: the rest of Washington, then.)
  await expect(stream.getByText(/^Near you in (Olympia|Washington)$/).first()).toBeAttached();
  // (Here, with a dozen homes in all, those near her are all of them: none
  // left to pick for her. With more homes, picks come too.)
  await expect(stream.getByText(/^(Near you in .+|Picked for you, from what you like|Homes to start with)$/).first()).toBeAttached();
  // Each home once.
  const labels = await stream.getByRole("link", { name: /^.+: / }).evaluateAll((links) =>
    links.map((link) => (link.getAttribute("aria-label") ?? "").split(":")[0]),
  );
  expect(new Set(labels).size).toBe(labels.length);

  // On a phone there's no rail beside the feed: people to follow are in it,
  // after the first few homes, once.
  const people = page.getByRole("region", { name: "People to follow" });
  await expect(people).toHaveCount(1);
  const top = async (part: Locator) => (await part.boundingBox())!.y;
  expect(await top(people)).toBeGreaterThan(await top(cards.nth(2)));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // A card opens the feed's homes full screen, on that one.
  await stream.getByRole("link", { name: /^1204 Quillan St SE: / }).click();
  await page.waitForURL(/\/reel\?from=feed&home=SAMPLE-1009/);
  await expect(page.getByRole("article", { name: "1204 Quillan St SE" })).toBeInViewport({ ratio: 0.5 });
});

test("an agent's home is the same feed: no box about clients, no pills; their clients are on Clients", async ({ browser }) => {
  const agent = await signInAgent(browser, "nia-nobox@example.com", "Nia Nobox");
  await agent.goto("/");
  await expect(agent.getByText("Send your first homes")).toHaveCount(0);
  await expect(agent.getByRole("region", { name: "Your clients" })).toHaveCount(0);
  await expect(agent.getByRole("group", { name: "Show" })).toHaveCount(0);
  await expect(agent.getByRole("region", { name: "Your feed" }).getByRole("listitem").first()).toBeVisible();
  // Clients, in the bar, is where they are.
  await agent.getByRole("banner").getByRole("link", { name: "Clients", exact: true }).click();
  await agent.waitForURL((url) => url.pathname === "/dashboard");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Clients");
});
