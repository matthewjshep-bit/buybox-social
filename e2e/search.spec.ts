import { expect, test, type Page } from "@playwright/test";
import { commentsOf, heartOf, homeIn, joinAs, settle, signUpBuyer } from "./helpers";

// (A pin is named by its short price, its address and its price: "$689K, 719
// Saltmarsh Ln, $689,000". The home beside the map has a price to tap too.)
const pins = (page: Page) => page.getByRole("button", { name: /^\$\d+(\.\d+)?[KM], .*\$\d[\d,]*$/ });
// At least this many pins: homes that other tests added themselves can be
// for sale here too.
const atLeastPins = async (page: Page, n: number) =>
  expect.poll(() => pins(page).count()).toBeGreaterThanOrEqual(n);
const pressedPins = (page: Page) => pins(page).and(page.locator('[aria-pressed="true"]'));
// Pins can sit on top of each other when zoomed out; this picks one by name.
const tapPin = (page: Page, name: string) => page.getByRole("button", { name }).dispatchEvent("click");

test("the map beside one home at a time: filters, pins and the home pane follow each other", async ({ browser }) => {
  test.setTimeout(60_000);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // The map reports a broken background worker only as a console error, with a blank map.
  page.on("console", (message) => {
    if (message.type() === "error" && /worker/i.test(message.text())) pageErrors.push(message.text());
  });

  await page.goto("/search");
  await expect(page).toHaveTitle("Search homes · Porchcard");
  await expect(page.getByRole("heading", { name: "Washington homes for sale" })).toBeVisible();
  // The 13 sample homes, and any for sale that people in other tests added
  // themselves (those have no spot on the map here: nothing looks them up).
  const total = page.getByText(/^\d+ homes$/).first();
  await expect(total).toBeVisible();
  const allFound = Number((await total.textContent())!.split(" ")[0]);
  expect(allFound).toBeGreaterThanOrEqual(13);
  // Signed out, Search is only the homes: no Homes | People above the field.
  await expect(page.getByRole("group", { name: "Search for" })).toHaveCount(0);
  // The map draws, with a pin for every home, and the home pane beside it.
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1500);
  await atLeastPins(page, 13);
  await expect(page.getByRole("article").first()).toBeInViewport();
  await expect(pressedPins(page)).toHaveCount(1);
  // Read left to right as it's used: the list of homes, the one picked from
  // it, then the map. (Narrower, with no list: the home, then the map.)
  const left = async (css: string) => (await page.locator(css).first().boundingBox())!.x;
  const [listX, homeX, mapX] = [
    await left('ol[aria-label="Homes found"]'),
    await left('section[aria-label="Homes"]'),
    await left(".maplibregl-canvas"),
  ];
  expect(listX).toBe(0);
  expect(homeX).toBeGreaterThan(listX);
  expect(mapX).toBeGreaterThan(homeX);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('ol[aria-label="Homes found"]')).toBeHidden();
  expect(await left('section[aria-label="Homes"]')).toBe(0);
  expect(await left(".maplibregl-canvas")).toBeGreaterThan(400);
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(page.locator('ol[aria-label="Homes found"]')).toBeVisible();
  // Every pin shows its price, zoomed out too.
  for (const text of await pins(page).allTextContents()) expect(text).toMatch(/^\$\d+(\.\d+)?[KM]$/);
  // The map starts right under the filters, with no gap between.
  const filters = (await page.getByRole("search", { name: "Filter homes" }).boundingBox())!;
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  expect(Math.abs(map.y - (filters.y + filters.height))).toBeLessThan(2);

  // Beside the map, a list of what was found: a card per home, in its own
  // scroll, each bringing its home up and lighting its pin.
  const results = page.getByRole("list", { name: "Homes found" });
  const cards = results.getByRole("link");
  await expect(cards).toHaveCount(allFound);
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
  await expect(pressedPins(page)).toHaveCount(1);
  // The address keeps the home picked, so a reload comes back to it (even
  // when it's the first).
  await expect(page).toHaveURL(/\/search\?home=SAMPLE-1005$/);

  // Each filter narrows the homes and the map, and lands in the URL.
  // (Each filter is a button that opens its choices, and says what's chosen.)
  const menu = (id: string) => page.locator(`[data-filter="${id}"]`);
  await menu("rooms").click();
  await expect(page.getByRole("dialog", { name: "Beds & baths" })).toBeVisible();
  await page.getByRole("button", { name: "5+ bedrooms" }).click();
  await expect(page).toHaveURL(/beds=5/);
  await expect(menu("rooms")).toHaveText(/5\+ bd/);
  // (Counted by their pins: homes other tests added have none.)
  await expect(homeIn(page, "2205 Brackenfield Ct NW")).toBeAttached();
  await expect(homeIn(page, "24611 SE Foxglove Pl")).toBeAttached();
  await atLeastPins(page, 2);
  await expect.poll(() => pins(page).count()).toBeLessThan(13);

  await page.getByRole("button", { name: "Any bedrooms" }).click();
  await expect(menu("rooms")).toHaveText(/Beds & baths/);
  // Done puts the choices away, back to the button.
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(menu("rooms")).toBeFocused();
  await menu("price").click();
  await page.getByLabel("Maximum price").selectOption("800000");
  await expect(menu("price")).toHaveText(/Up to \$800K/);
  await atLeastPins(page, 5);
  await expect.poll(() => pins(page).count()).toBeLessThan(13);

  await page.getByLabel("Maximum price").selectOption("");
  // Escape puts them away too.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await menu("type").click();
  await page.getByRole("radio", { name: "Townhouses" }).check();
  await atLeastPins(page, 1);
  await expect.poll(() => pins(page).count()).toBeLessThan(13);
  await expect(homeIn(page, "3518 Wexford Ave N")).toBeAttached();
  await page.getByRole("radio", { name: "All home types" }).check();

  // The rest are under Filters, which counts those on: who listed it, say.
  await menu("more").click();
  await expect(page.getByRole("dialog", { name: "Home type" })).toBeHidden();
  await page.getByRole("radio", { name: "The MLS" }).check();
  await expect(page).toHaveURL(/by=mls/);
  await expect(menu("more")).toHaveText(/Filters\s*1/);
  await atLeastPins(page, 13);
  await page.getByRole("radio", { name: "An investor" }).check();
  await expect(page).toHaveURL(/by=investor/);
  await expect.poll(() => pins(page).count()).toBeLessThan(13);
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page).not.toHaveURL(/by=/);
  await expect(menu("more")).toHaveText(/^Filters$/);
  // A tap away puts them away.
  await page.getByLabel("City, ZIP, address or MLS number").click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByLabel("City, ZIP, address or MLS number").fill("Seattle");
  await page.getByLabel("City, ZIP, address or MLS number").press("Enter");
  await expect(page).toHaveURL(/q=Seattle/);
  await expect(page.getByRole("heading", { name: "Homes matching “Seattle”" })).toBeVisible();
  await atLeastPins(page, 2);
  await expect.poll(() => pins(page).count()).toBeLessThan(13);

  // Sorting by price puts the cheapest first. (Homes other tests added are
  // among them: the order is what's checked.)
  const prices = () =>
    page.getByRole("article").evaluateAll((homes) =>
      homes.map((home) => Number((home.textContent?.match(/\$(\d{1,3}(?:,\d{3})*)/)?.[1] ?? "0").replaceAll(",", ""))),
    );
  await page.goto("/search?sort=price-asc");
  await expect(page.getByRole("article").first()).toBeVisible();
  const up = await prices();
  expect(up).toContain(465000);
  expect(up).toEqual([...up].sort((x, y) => x - y));
  await page.getByRole("combobox", { name: "Sort:" }).selectOption("price-desc");
  await expect(page.getByRole("article").first()).toContainText("$2,450,000");

  // Picking a pin brings that home up beside the map, and lights its pin.
  const larkmoorPin = page.getByRole("button", { name: "4127 Larkmoor Ave NE, $985,000" });
  await tapPin(page, "4127 Larkmoor Ave NE, $985,000");
  await expect(homeIn(page, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });
  await expect(larkmoorPin).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/\/search\?sort=price-desc&home=SAMPLE-1001$/);

  // Scrolling to the next home moves the lit pin along (once the glide to the picked home ends).
  await page.waitForTimeout(800);
  await page.locator("[data-reel]").evaluate((reel) => reel.scrollBy({ top: reel.clientHeight }));
  await expect(larkmoorPin).toHaveAttribute("aria-pressed", "false");
  await expect(pressedPins(page)).toHaveCount(1);
  await expect(page).toHaveURL(/\/search\?sort=price-desc&home=SAMPLE-(?!1001$)\d+$/);

  // Beside the map, on a wide screen, it's the home itself, not just a look
  // at it: under the photo, one row with its X and its heart, its comments,
  // Save and More (nothing to send it with here: the pane has its own way),
  // and the comment bar alone at the foot; above the photo, its price to tap.
  await page.goto("/search?beds=4");
  const found = Number((await page.getByText(/^\d+ homes?$/).textContent())!.split(" ")[0]);
  await page.waitForTimeout(1500);
  await tapPin(page, "10421 Halvard Way NE, $1,349,000");
  const halvard = homeIn(page, "10421 Halvard Way NE");
  await expect(halvard).toBeInViewport({ ratio: 0.9 });
  // (Measured once the glide to the home has ended: the row is read in
  // several looks, and one taken mid-glide would put the buttons out of line.)
  await expect
    .poll(async () => {
      const before = (await halvard.boundingBox())!.y;
      await page.waitForTimeout(150);
      return (await halvard.boundingBox())!.y - before;
    })
    .toBe(0);
  const actions = halvard.locator("[data-actions]");
  const inPane = ["Pass on this home", /^Like 10421 Halvard Way NE/, /^Comments/, /^Save 10421 Halvard Way NE/, "More options"];
  await expect(actions.getByRole("button")).toHaveCount(inPane.length);
  for (const [i, name] of inPane.entries()) await expect(actions.getByRole("button").nth(i)).toHaveAccessibleName(name);
  await expect(heartOf(halvard)).toBeVisible();
  // Nothing on the photo, and no rail of round buttons down its side.
  await expect(halvard.locator("[data-rail]")).toBeHidden();
  // (The comments' count is part of the Comments button in the row: no
  // button of its own anywhere else.)
  await expect(halvard.getByRole("button", { name: /^Comments/ }).filter({ visible: true })).toHaveCount(1);
  await expect(halvard.getByRole("button", { name: /^Send/ }).filter({ visible: true })).toHaveCount(0);
  const bar = halvard.locator("[data-bar-row]");
  await expect(bar.getByRole("button")).toHaveCount(1);
  await expect(bar.getByRole("button")).toHaveAccessibleName("Add a comment…");
  // One row, each a fingertip wide, then the bar under it.
  const boxes = await actions.getByRole("button").evaluateAll((all) => all.map((el) => el.getBoundingClientRect().toJSON()));
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(2);
  }
  for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y).toBeGreaterThanOrEqual(boxes[0].y + boxes[0].height - 1);
  // The price and the address are the head of the home, above the photo, and
  // the photo under them keeps its size: wide as the pane, a 4:3 box.
  const head = (await halvard.locator("[data-home-head]").boundingBox())!;
  // (The photo itself, the one with words for it; the blur behind it is not
  // a picture.)
  const photoBox = (await halvard.getByRole("group", { name: /^Photos of/ }).getByRole("img").first().boundingBox())!;
  const pane = page.locator('section[aria-label="Homes"]');
  const paneBox = (await pane.boundingBox())!;
  expect(head.y + head.height).toBeLessThanOrEqual(photoBox.y + 1);
  expect(Math.abs(photoBox.width - paneBox.width)).toBeLessThan(2);
  expect(Math.abs(photoBox.height - (photoBox.width * 3) / 4)).toBeLessThan(2);
  // (The price is words to read, not a button, and the head is the way to
  // what the home is.)
  await expect(halvard.locator('[data-fact="Price"]')).toHaveText("$1,349,000");
  await expect(halvard.locator("[data-home-head]").getByRole("button", { name: "About this home" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  // Full screen is a button in the photo's top right corner, just under the
  // head, a fingertip wide; no big button under the words.
  await expect(halvard.getByRole("button", { name: /^Open full screen/ })).toHaveCount(0);
  const corner = pane.getByRole("button", { name: "Open full screen", exact: true });
  const cornerBox = (await corner.boundingBox())!;
  expect(cornerBox.width).toBeGreaterThanOrEqual(44);
  expect(cornerBox.height).toBeGreaterThanOrEqual(44);
  expect(paneBox.x + paneBox.width - (cornerBox.x + cornerBox.width)).toBeLessThan(20);
  expect(cornerBox.y).toBeGreaterThanOrEqual(head.y + head.height);
  expect(cornerBox.y - photoBox.y).toBeLessThan(20);

  // It opens the home full screen, with this search's homes to scroll through.
  await corner.click();
  await expect(page).toHaveURL(/\/homes\?beds=4&home=SAMPLE-1005$/);
  const full = homeIn(page, "10421 Halvard Way NE");
  await expect(full).toBeInViewport({ ratio: 0.9 });
  // Here it's the whole thing: the heart works (asking a signed-out visitor for a name).
  await heartOf(full).click();
  await joinAs(page, "Remy");
  await expect(heartOf(full)).toHaveAttribute("aria-pressed", "true");

  // On to another home: the address, and the way back to Search, follow it.
  const order = await page.locator("article[data-home]").evaluateAll((homes) => homes.map((home) => home.getAttribute("data-home")!));
  const at = order.indexOf("SAMPLE-1005");
  const down = at < order.length - 1;
  const next = order[down ? at + 1 : at - 1];
  await page.keyboard.press(down ? "ArrowDown" : "ArrowUp");
  await expect(page.locator(`article[data-home="${next}"]`)).toBeInViewport({ ratio: 0.9 });
  await expect(page).toHaveURL(new RegExp(`/homes\\?beds=4&home=${next}$`));
  // (The one at the top; the last screen has the same link, under "That's all".)
  await expect(page.getByRole("link", { name: "Back to search" }).first()).toHaveAttribute("href", `/search?beds=4&home=${next}`);
  // Escape goes back to the map, on that home.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/search\\?beds=4&home=${next}$`));
  await expect(page.locator(`article[data-home="${next}"]`)).toBeInViewport({ ratio: 0.9 });
  // The browser's Back goes to that home full screen, and back again to the
  // map as it was, on the home picked there.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/homes\\?beds=4&home=${next}$`));
  await expect(page.locator(`article[data-home="${next}"]`)).toBeInViewport({ ratio: 0.9 });
  await page.goBack();
  await expect(page).toHaveURL(/\/search\?beds=4&home=SAMPLE-1005$/);
  await expect(homeIn(page, "10421 Halvard Way NE")).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("button", { name: "10421 Halvard Way NE, $1,349,000" })).toHaveAttribute("aria-pressed", "true");

  // Full screen again, to the end of the search.
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/homes\\?beds=4&home=${next}$`));
  await expect(async () => {
    await page.evaluate(() => {
      const reel = document.querySelector<HTMLElement>("[data-reel]")!;
      reel.scrollTo({ top: reel.scrollHeight });
    });
    await expect(page.getByRole("heading", { name: "That's all" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("article")).toHaveCount(found);

  // Back to Search, on the last home shown.
  // (Search finds homes people added themselves too, so the last may be one of those.)
  const last = new URL(page.url()).searchParams.get("home");
  expect(last).toMatch(/^(SAMPLE-\d+|OWN-[\w-]+)$/);
  await expect(page.getByRole("region", { name: "The end" }).getByRole("link", { name: "Back to search" })).toHaveAttribute(
    "href",
    `/search?beds=4&home=${last}`,
  );
  await page.getByRole("link", { name: "Back to search" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/search\\?beds=4&home=${last}$`));
  await expect(page.locator(`article[data-home="${last}"]`)).toBeInViewport({ ratio: 0.9 });

  // (No "Liked by buyers" among the filters: Sort has "Most liked".)
  await expect(page.getByText("Liked by buyers")).toHaveCount(0);

  // A home's More opens it here, beside the map. (Its address is just words.)
  await page.goto("/homes/SAMPLE-1006");
  const brackenfield = homeIn(page, "2205 Brackenfield Ct NW");
  await expect(brackenfield).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("button", { name: /^2205 Brackenfield Ct NW, Issaquah/ })).toHaveCount(0);
  await brackenfield.getByRole("button", { name: "More options" }).filter({ visible: true }).first().click();
  const moreSheet = page.getByRole("dialog", { name: "More" });
  await settle(moreSheet);
  await moreSheet.getByRole("link", { name: "See it on the map" }).click();
  await expect(page).toHaveURL(/\/search\?home=SAMPLE-1006$/);
  await expect(homeIn(page, "2205 Brackenfield Ct NW")).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("button", { name: "2205 Brackenfield Ct NW, $1,089,000" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // No matches says so, once, where the home would be (between the count
  // and the map), and offers a way out. (Once the map page has finished
  // loading, so going on doesn't cut it off halfway.)
  await page.waitForLoadState("networkidle");
  await page.goto("/search?q=Spokane");
  // (Only words in the box: it says them back, and clearing them is the way out.)
  const none = page.getByText("No homes match “Spokane”.").filter({ visible: true });
  await expect(none).toHaveCount(1);
  await expect(page.getByText("0 homes", { exact: true })).toBeVisible();
  await expect(page.locator('section[aria-label="Homes"]').getByText("No homes match “Spokane”.")).toBeVisible();
  const zero = (await page.getByText("0 homes", { exact: true }).boundingBox())!;
  const said = (await none.boundingBox())!;
  expect(said.x).toBeGreaterThan(zero.x + zero.width);
  await expect(page.getByRole("link", { name: "Clear search", exact: true })).toHaveAttribute("href", "/search");
  // (Signed in since the like above: a word that finds no homes may be a
  // name, so people by it are a tap away.)
  await expect(page.getByRole("link", { name: "Search people for “Spokane”" }).filter({ visible: true })).toHaveAttribute(
    "href",
    "/search/people?q=Spokane",
  );
  // With a filter on as well, it's the filters that found nothing.
  await page.waitForLoadState("networkidle");
  await page.goto("/search?q=Spokane&beds=3");
  await expect(page.getByText("No homes match those filters.").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByText("No homes match “Spokane”.")).toHaveCount(0);
  // (Clearing the filters keeps the words.)
  await expect(page.getByRole("link", { name: "Clear filters", exact: true })).toHaveAttribute("href", "/search?q=Spokane");

  // A little narrower, the list makes way for the map: the map and one home
  // share the width, and what was found sits over the map on one line.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/search");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByRole("list", { name: "Homes found" })).toBeHidden();
  expect((await page.locator(".maplibregl-map").boundingBox())!.width).toBeGreaterThanOrEqual(480);
  const heading = (await page.getByRole("heading", { name: "Washington homes for sale" }).boundingBox())!;
  const sorted = (await page.getByRole("combobox", { name: "Sort:" }).boundingBox())!;
  expect(Math.abs(heading.y + heading.height / 2 - (sorted.y + sorted.height / 2))).toBeLessThan(4);

  expect(pageErrors).toEqual([]);
});

test("an address typed the way the app prints it finds the home: street and city, a few words of each, a ZIP with a street", async ({
  browser,
}) => {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const LAKEVIEW = "5902 Lakeview Terrace SE";
  await page.goto("/search");
  const field = page.getByLabel("City, ZIP, address or MLS number");
  // The box says what it takes.
  await expect(field).toHaveAttribute("placeholder", "City, ZIP, address or MLS #");
  // Typed in the box as a home's card has it (street, comma, city), and in
  // the page's address: the words in any order, capitals or not, with the
  // state or the MLS number among them.
  await field.fill(`${LAKEVIEW}, Mercer Island`);
  await field.press("Enter");
  await expect(page).toHaveURL(/q=5902\+Lakeview\+Terrace\+SE%2C\+Mercer\+Island/);
  await expect(page.getByText("1 home", { exact: true })).toBeVisible();
  await expect(homeIn(page, LAKEVIEW)).toBeAttached();
  for (const typed of [
    "lakeview mercer",
    "98040 lakeview",
    `${LAKEVIEW}, Mercer Island, WA 98040`,
    "mercer island wa",
    "SAMPLE-1013",
  ]) {
    await page.waitForLoadState("networkidle");
    await page.goto(`/search?q=${encodeURIComponent(typed)}`);
    await expect(page.getByText("1 home", { exact: true }), typed).toBeVisible();
    await expect(homeIn(page, LAKEVIEW), typed).toBeAttached();
    await expect(page.getByRole("list", { name: "Homes found" }).getByRole("link"), typed).toHaveCount(1);
  }
  // Every word has to be the home's: a street in another city finds nothing,
  // and neither does punctuation on its own.
  for (const typed of ["lakeview seattle", "98105 lakeview", ","]) {
    await page.waitForLoadState("networkidle");
    await page.goto(`/search?q=${encodeURIComponent(typed)}`);
    await expect(page.getByText("0 homes", { exact: true }), typed).toBeVisible();
  }
  // A city alone still finds all of its homes.
  await page.waitForLoadState("networkidle");
  await page.goto("/search?q=seattle");
  await atLeastPins(page, 2);
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
  const count = (await page.getByText(/^\d+ homes$/).first().boundingBox())!;
  const sort = (await page.getByRole("combobox", { name: "Sort:" }).boundingBox())!;
  expect(Math.abs(count.y + count.height / 2 - (sort.y + sort.height / 2))).toBeLessThan(4);
  await expect(page.getByRole("list", { name: "Homes found" })).toBeHidden();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await page.waitForTimeout(1000);
  // Zoomed out, the Seattle homes sit close together: their prices move apart,
  // each with a line to its home, so none covers another and every one can be
  // read and tapped. Each pin is named for the price it shows first.
  await atLeastPins(page, 13);
  await expect(pins(page).first()).toHaveAccessibleName(/^\$\d+(\.\d+)?[KM], \d+ /);
  await expect
    .poll(() =>
      pins(page).evaluateAll((chips) => {
        const boxes = chips.map((chip) => chip.getBoundingClientRect());
        const map = document.querySelector(".maplibregl-map")!.getBoundingClientRect();
        let trouble = 0;
        boxes.forEach((a, i) => {
          if (a.left < map.left || a.right > map.right || a.top < map.top || a.bottom > map.bottom) trouble++;
          boxes.slice(i + 1).forEach((b) => {
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) trouble++;
          });
        });
        return trouble;
      }),
    )
    .toBe(0);
  await tapPin(page, "4127 Larkmoor Ave NE, $985,000");
  await expect(page.locator(".maplibregl-canvas")).toBeHidden();
  await expect(homeIn(page, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("button", { name: "Map", exact: true })).toBeVisible();
  // A tap opens it full screen (the button in the row along the pane's foot,
  // named for the home showing).
  await page.getByRole("button", { name: "Open full screen: 4127 Larkmoor Ave NE", exact: true }).click();
  await expect(page).toHaveURL(/\/homes\?home=SAMPLE-1001$/);
  await expect(homeIn(page, "4127 Larkmoor Ave NE")).toBeInViewport({ ratio: 0.9 });
});

test("signed in, Search is homes or people: the switch sits above the field on a phone and the home keeps its button; a name with no homes leads to people", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const page = await signUpBuyer(browser, "sorrel.search@example.com", "Sorrel Mapper");
  // On a phone, and a small one: Homes | People in a row of its own above the
  // field, and under the filters the home still has "Open full screen" in
  // view, in one row with Map along the pane's foot, clear of it.
  for (const size of [
    { width: 390, height: 780 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/search");
    const form = page.getByRole("search", { name: "Filter homes" });
    const which = form.getByRole("group", { name: "Search for" });
    await expect(which.getByRole("link", { name: "Homes", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(which.getByRole("link", { name: "People", exact: true })).toHaveAttribute("href", "/search/people");
    const [tabs, field] = await Promise.all([which.boundingBox(), page.getByLabel("City, ZIP, address or MLS number").boundingBox()]);
    expect(tabs!.y + tabs!.height).toBeLessThanOrEqual(field!.y);
    expect((await which.getByRole("link", { name: "People", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const showing = (await page.getByRole("article").first().getAttribute("aria-label"))!;
    const open = page.getByRole("button", { name: `Open full screen: ${showing}`, exact: true });
    await expect(open).toBeInViewport({ ratio: 1 });
    const [button, map] = await Promise.all([open.boundingBox(), page.getByRole("button", { name: "Map", exact: true }).boundingBox()]);
    expect(Math.abs(button!.y - map!.y), `${size.width}x${size.height}`).toBeLessThan(2);
    expect(button!.x + button!.width, `${size.width}x${size.height}`).toBeLessThanOrEqual(map!.x);
    expect(button!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  }

  // A name finds no homes: it says the name back, and people by that name
  // are a tap away. Both ways out are a fingertip tall.
  await page.goto("/search?q=Zzyzx");
  await expect(page.getByText("No homes match “Zzyzx”.").filter({ visible: true })).toHaveCount(1);
  const people = page.getByRole("link", { name: "Search people for “Zzyzx”" }).filter({ visible: true });
  await expect(people).toHaveAttribute("href", "/search/people?q=Zzyzx");
  for (const link of [people, page.getByRole("link", { name: "Clear search", exact: true }).filter({ visible: true })]) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // A number in it is an address or a ZIP, not a person.
  await page.goto("/search?q=99999");
  await expect(page.getByText("No homes match “99999”.").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /^Search people for/ })).toHaveCount(0);
  // With a filter on as well, it's the filters that found nothing; the name still leads to people.
  await page.goto("/search?q=Zzyzx&beds=3");
  await expect(page.getByText("No homes match those filters.").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Search people for “Zzyzx”" }).filter({ visible: true })).toBeVisible();

  // Wide, the same switch is across the top, and the map still starts right under the filters.
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/search");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  const filters = (await page.getByRole("search", { name: "Filter homes" }).boundingBox())!;
  const map = (await page.locator(".maplibregl-map").boundingBox())!;
  expect(Math.abs(map.y - (filters.y + filters.height))).toBeLessThan(2);
  // And the home between the list and the map can be liked, passed on and
  // talked about right there. The heart: liked. The comment bar: they open over the
  // home, in its own pane. The X: passed, and on to the next home, with the
  // list and the address going with it.
  const first = page.getByRole("article").first();
  await expect(first).toBeInViewport({ ratio: 0.9 });
  const firstKey = (await first.getAttribute("data-home"))!;
  await heartOf(first).click();
  await expect(heartOf(first)).toHaveAttribute("aria-pressed", "true");
  // (The comment bar is the way to them.)
  await first.getByRole("button", { name: /^Add a comment…/ }).click();
  const comments = commentsOf(first);
  await expect(comments).toBeVisible();
  await expect(comments.getByRole("textbox", { name: "Add a comment" })).toBeFocused();
  const [paneBox, sheetBox] = [
    (await page.locator('section[aria-label="Homes"]').boundingBox())!,
    (await comments.boundingBox())!,
  ];
  expect(sheetBox.x).toBeGreaterThanOrEqual(paneBox.x - 1);
  expect(sheetBox.x + sheetBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
  await page.keyboard.press("Escape");
  await expect(comments).toBeHidden();
  await first.getByRole("button", { name: "Pass on this home" }).click();
  const second = page.getByRole("article").nth(1);
  await expect(second).toBeInViewport({ ratio: 0.9 });
  const secondKey = (await second.getAttribute("data-home"))!;
  expect(secondKey).not.toBe(firstKey);
  await expect(page.locator(`ol[aria-label="Homes found"] li[data-key="${secondKey}"] a`)).toHaveAttribute("aria-current", "true");
  await expect(page).toHaveURL(new RegExp(`home=${secondKey}$`));

  await page.getByRole("group", { name: "Search for" }).getByRole("link", { name: "People", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/search/people");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Find people");
});
