import { expect, test, type Page } from "@playwright/test";
import { heartOf, homeIn, joinAs, settle } from "./helpers";

const pins = (page: Page) => page.getByRole("button", { name: /\$\d[\d,]*$/ });
// Pins can sit on top of each other when zoomed out; this picks one by name.
const tapPin = (page: Page, name: string) => page.getByRole("button", { name }).dispatchEvent("click");

test("the map beside one home at a time: filters, pins and the home pane follow each other", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // The map reports a broken background worker only as a console error, with a blank map.
  page.on("console", (message) => {
    if (message.type() === "error" && /worker/i.test(message.text())) pageErrors.push(message.text());
  });

  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "Washington homes for sale" })).toBeVisible();
  await expect(page.getByText("13 homes")).toBeVisible();
  // The map draws, with a pin for every home, and the home pane beside it.
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(pins(page)).toHaveCount(13);
  await expect(page.getByRole("article").first()).toBeInViewport();
  await expect(page.getByRole("button", { name: /\$\d[\d,]*$/, pressed: true })).toHaveCount(1);
  // Every pin shows its price, zoomed out too.
  await expect(pins(page)).toHaveText(Array(13).fill(/^\$\d+(\.\d+)?[KM]$/));
  // The map starts right under the filters, with no gap between.
  const filters = (await page.getByRole("search", { name: "Filter homes" }).boundingBox())!;
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  expect(Math.abs(map.y - (filters.y + filters.height))).toBeLessThan(2);

  // Beside the map, a list of what was found: a card per home, in its own
  // scroll, each bringing its home up and lighting its pin.
  const results = page.getByRole("list", { name: "Homes found" });
  const cards = results.getByRole("link");
  await expect(cards).toHaveCount(13);
  for (const name of await cards.evaluateAll((links) => links.map((a) => a.getAttribute("aria-label") ?? ""))) {
    expect(name).toMatch(/^Show \d+ /);
    expect(name).not.toMatch(/\$[\d,]+$/);
  }
  expect(await results.evaluate((el) => getComputedStyle(el).overflowY)).toBe("auto");
  expect(await results.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const firstHome = await page.getByRole("article").first().getAttribute("aria-label");
  await results.evaluate((el) => el.scrollBy({ top: 400 }));
  await expect.poll(() => results.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("article", { name: firstHome! })).toBeInViewport({ ratio: 0.9 });
  const halvardCard = page.getByRole("link", { name: "Show 10421 Halvard Way NE", exact: true });
  await halvardCard.click();
  await expect(homeIn(page, "10421 Halvard Way NE")).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("button", { name: "10421 Halvard Way NE, $1,349,000" })).toHaveAttribute("aria-pressed", "true");
  await expect(halvardCard).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: /\$\d[\d,]*$/, pressed: true })).toHaveCount(1);

  // Each filter narrows the homes and the map, and lands in the URL.
  await page.getByLabel("Bedrooms").selectOption("5");
  await expect(page).toHaveURL(/beds=5/);
  await expect(page.getByText("2 homes")).toBeVisible();
  await expect(homeIn(page, "2205 Brackenfield Ct NW")).toBeAttached();
  await expect(homeIn(page, "24611 SE Foxglove Pl")).toBeAttached();
  await expect(pins(page)).toHaveCount(2);

  await page.getByLabel("Bedrooms").selectOption("");
  await page.getByLabel("Maximum price").selectOption("800000");
  await expect(page.getByText("5 homes")).toBeVisible();

  await page.getByLabel("Maximum price").selectOption("");
  await page.getByLabel("Home type").selectOption("townhouse");
  await expect(page.getByText("1 home", { exact: true })).toBeVisible();
  await expect(homeIn(page, "3518 Wexford Ave N")).toBeAttached();

  await page.getByLabel("Home type").selectOption("");
  await page.getByLabel("City, ZIP or address").fill("Seattle");
  await page.getByLabel("City, ZIP or address").press("Enter");
  await expect(page).toHaveURL(/q=Seattle/);
  await expect(page.getByRole("heading", { name: "Homes matching “Seattle”" })).toBeVisible();
  await expect(page.getByText("2 homes")).toBeVisible();

  // Sorting by price puts the cheapest first.
  await page.goto("/search?sort=price-asc");
  await expect(page.getByRole("article").first()).toContainText("$465,000");
  await page.getByRole("combobox", { name: "Sort:" }).selectOption("price-desc");
  await expect(page.getByRole("article").first()).toContainText("$2,450,000");

  // Picking a pin brings that home up beside the map, and lights its pin.
  const larkmoorPin = page.getByRole("button", { name: "4127 Larkmoor Ave NE, $985,000" });
  await tapPin(page, "4127 Larkmoor Ave NE, $985,000");
  await expect(homeIn(page, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });
  await expect(larkmoorPin).toHaveAttribute("aria-pressed", "true");

  // Scrolling to the next home moves the lit pin along (once the glide to the picked home ends).
  await page.waitForTimeout(800);
  await page.locator("[data-reel]").evaluate((reel) => reel.scrollBy({ top: reel.clientHeight }));
  await expect(larkmoorPin).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: /\$\d[\d,]*$/, pressed: true })).toHaveCount(1);

  // Beside the map, a home is just a look: nothing to like, say or tap on it.
  await page.goto("/search?beds=4");
  const found = Number((await page.getByText(/^\d+ homes?$/).textContent())!.split(" ")[0]);
  await page.waitForTimeout(1500);
  await tapPin(page, "10421 Halvard Way NE, $1,349,000");
  const halvard = homeIn(page, "10421 Halvard Way NE");
  await expect(halvard).toBeInViewport({ ratio: 0.9 });
  await expect(heartOf(halvard)).toHaveCount(0);
  await expect(halvard.getByRole("button", { name: "Add a comment…" })).toHaveCount(0);
  await expect(halvard.getByRole("button", { name: "Next photo" })).toHaveCount(0);
  await expect(halvard.getByRole("button", { name: /^\$1,349,000/ })).toHaveCount(0);

  // Tapping it opens it full screen, with this search's homes to scroll through.
  await halvard.getByRole("group", { name: /^Photos of/ }).click();
  await expect(page).toHaveURL(/\/homes\?beds=4&home=SAMPLE-1005$/);
  const full = homeIn(page, "10421 Halvard Way NE");
  await expect(full).toBeInViewport({ ratio: 0.9 });
  // Here it's the whole thing: the heart works (asking a signed-out visitor for a name).
  await heartOf(full).click();
  await joinAs(page, "Remy");
  await expect(heartOf(full)).toHaveAttribute("aria-pressed", "true");
  await expect(async () => {
    await page.evaluate(() => {
      const reel = document.querySelector<HTMLElement>("[data-reel]")!;
      reel.scrollTo({ top: reel.scrollHeight });
    });
    await expect(page.getByRole("heading", { name: "That's every home in this search" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("article")).toHaveCount(found);

  // Back to the map as it was.
  await page.getByRole("link", { name: "Back to map" }).click();
  await expect(page).toHaveURL(/\/search\?beds=4&home=SAMPLE-1005$/);
  await expect(homeIn(page, "10421 Halvard Way NE")).toBeInViewport({ ratio: 0.9 });

  // "Liked by buyers" keeps only homes with likes. A like is a heart here too.
  await expect(page.locator("label").filter({ hasText: "Liked by buyers" }).locator(".lucide-heart")).toBeVisible();
  await page.getByLabel("Liked by buyers").check();
  await expect(page).toHaveURL(/liked=1/);
  await expect(homeIn(page, "10421 Halvard Way NE")).toBeAttached();

  // A home's address, like its price, can be liked or talked about, and it
  // opens the home here, beside the map.
  await page.goto("/homes/SAMPLE-1006");
  await page.getByRole("button", { name: /^2205 Brackenfield Ct NW, Issaquah/ }).click();
  const address = page.getByRole("group", { name: "Address" });
  await settle(address);
  await address.getByRole("link", { name: "See it on the map" }).click();
  await expect(page).toHaveURL(/\/search\?home=SAMPLE-1006$/);
  await expect(homeIn(page, "2205 Brackenfield Ct NW")).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("button", { name: "2205 Brackenfield Ct NW, $1,089,000" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // No matches says so and offers a way out.
  await page.goto("/search?q=Spokane");
  await expect(page.getByText("No homes match those filters.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear all filters" })).toHaveAttribute("href", "/search");

  expect(pageErrors).toEqual([]);
});

test("on a phone, homes and the map are a tap apart, and a pin opens its home", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/search");
  await expect(page.locator(".maplibregl-canvas")).toBeHidden();
  await expect(page.getByRole("article").first()).toBeVisible();
  // The filters scroll sideways, faded at the edge with more past it.
  const row = page.locator("[data-filter-row]");
  await expect(row).toHaveAttribute("data-fade", "end");
  expect(await row.evaluate((el) => getComputedStyle(el).maskImage)).toContain("linear-gradient");
  await row.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(row).toHaveAttribute("data-fade", "start");
  // What was found, and the sort, on one line; no list here.
  const count = (await page.getByText("13 homes", { exact: true }).boundingBox())!;
  const sort = (await page.getByRole("combobox", { name: "Sort:" }).boundingBox())!;
  expect(Math.abs(count.y + count.height / 2 - (sort.y + sort.height / 2))).toBeLessThan(4);
  await expect(page.getByRole("list", { name: "Homes found" })).toBeHidden();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1000);
  await tapPin(page, "4127 Larkmoor Ave NE, $985,000");
  await expect(page.locator(".maplibregl-canvas")).toBeHidden();
  await expect(homeIn(page, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("button", { name: "Map", exact: true })).toBeVisible();
  // A tap opens it full screen.
  await homeIn(page, "4127 Larkmoor Ave NE").getByRole("button", { name: /^Open full screen/ }).click();
  await expect(page).toHaveURL(/\/homes\?home=SAMPLE-1001$/);
  await expect(homeIn(page, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });
});
