import { expect, test } from "@playwright/test";
import { joinAs } from "./helpers";

const card = (page: import("@playwright/test").Page, address: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("link", { name: new RegExp(address) }) });

test("map-and-list search with filters, pins, sorting and the pop-out", async ({ browser }) => {
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
  // The map draws, with a pin for every home.
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByRole("button", { name: /\$\d[\d,]*$/ })).toHaveCount(13);

  // Each filter narrows the list and the map, and lands in the URL.
  await page.getByLabel("Bedrooms").selectOption("5");
  await expect(page).toHaveURL(/beds=5/);
  await expect(page.getByText("2 homes")).toBeVisible();
  await expect(card(page, "2205 Brackenfield")).toBeVisible();
  await expect(card(page, "24611 SE Foxglove")).toBeVisible();
  await expect(page.getByRole("button", { name: /\$\d[\d,]*$/ })).toHaveCount(2);

  await page.getByLabel("Bedrooms").selectOption("");
  await page.getByLabel("Maximum price").selectOption("800000");
  await expect(page.getByText("5 homes")).toBeVisible();

  await page.getByLabel("Maximum price").selectOption("");
  await page.getByLabel("Home type").selectOption("townhouse");
  await expect(page.getByText("1 home", { exact: true })).toBeVisible();
  await expect(card(page, "3518 Wexford")).toBeVisible();

  await page.getByLabel("Home type").selectOption("");
  await page.getByLabel("City, ZIP or address").fill("Seattle");
  await page.getByLabel("City, ZIP or address").press("Enter");
  await expect(page).toHaveURL(/q=Seattle/);
  await expect(page.getByRole("heading", { name: "Homes matching “Seattle”" })).toBeVisible();
  await expect(page.getByText("2 homes")).toBeVisible();

  // Sorting by price puts the cheapest first.
  await page.goto("/search?sort=price-asc");
  await expect(page.getByRole("listitem").first()).toContainText("$465,000");
  await page.getByRole("combobox", { name: "Sort:" }).selectOption("price-desc");
  await expect(page.getByRole("listitem").first()).toContainText("$2,450,000");

  // Clicking a pin opens a preview on the map and highlights its card.
  await page.getByRole("button", { name: "4127 Larkmoor Ave NE, $985,000" }).click();
  await expect(page.getByRole("button", { name: "4127 Larkmoor Ave NE, $985,000" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const popup = page.locator(".maplibregl-popup");
  await expect(popup).toContainText("4127 Larkmoor Ave NE, Seattle");

  // Opening a card shows the pop-out over the search, and Escape returns to it.
  await card(page, "1880 Tamsen Ridge").getByRole("link").click();
  await expect(page).toHaveURL(/\/homes\/SAMPLE-1002$/);
  const dialog = page.getByRole("dialog", { name: "Home details" });
  await expect(dialog.getByText("Maya Chen")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/search\?sort=price-desc$/);

  // The thumbs-up likes a home straight from the card (asking a signed-out visitor for a name).
  const heart = page.getByRole("button", { name: "Like 10421 Halvard Way NE" });
  await heart.click();
  await joinAs(page, "Remy");
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "Like 10421 Halvard Way NE" })).toHaveAttribute("aria-pressed", "true");

  // "Liked by buyers" keeps only homes with likes.
  await page.getByLabel("Liked by buyers").check();
  await expect(page).toHaveURL(/liked=1/);
  await expect(card(page, "10421 Halvard Way")).toBeVisible();
  for (const item of await page.getByRole("listitem").all()) {
    await expect(item).toContainText(/\d+ likes?/);
  }

  // No matches says so and offers a way out.
  await page.goto("/search?q=Spokane");
  await expect(page.getByText("No homes match those filters.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clear all filters" })).toHaveAttribute("href", "/search");

  expect(pageErrors).toEqual([]);
});

test("on a phone the map is one tap away", async ({ page }) => {
  await page.goto("/search");
  await expect(page.locator(".maplibregl-canvas")).toBeHidden();
  await page.getByRole("button", { name: "Map" }).click();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByText("13 homes")).toBeVisible();
});
