import { expect, test, type Page } from "@playwright/test";
import { signInAgent, signUpBuyer } from "./helpers";

// The logo's coloured tile, whatever page it's on.
const logoTile = (page: Page) =>
  page.getByRole("banner").getByRole("link", { name: "BuyBox Social" }).locator("span").first();

const background = (page: Page) => logoTile(page).evaluate((el) => getComputedStyle(el).backgroundColor);

async function size(page: Page, name: string, role: "link" | "button") {
  const box = await page.getByRole("banner").getByRole(role, { name, exact: true }).boundingBox();
  return { width: box!.width, height: box!.height };
}

test("signed out on a small phone: Sign in beside Sign up, and nothing runs off the side", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/search");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Sign up", exact: true })).toBeVisible();
  // The map is where you are.
  await expect(header.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  for (const name of ["BuyBox Social", "Map", "Sign in", "Sign up"]) {
    const box = await size(page, name, "link");
    expect(box.width, name).toBeGreaterThanOrEqual(44);
    expect(box.height, name).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // The same over the full-screen feed.
  await page.goto("/");
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Sign up", exact: true })).toBeVisible();
});

test("signed in, you're one button: your places and Sign out are behind your initial", async ({ browser }) => {
  const page = await signUpBuyer(browser, "hollis-header@example.com", "Hollis Header");
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/search");
  const header = page.getByRole("banner");
  const me = header.getByRole("button", { name: "Your profile" });
  await expect(me).toHaveText("H");
  expect(await size(page, "Your profile", "button")).toEqual({ width: 44, height: 44 });
  // No Sign out beside it.
  await expect(header.getByRole("button", { name: "Sign out" })).toBeHidden();
  await expect(header.getByRole("link", { name: "Your profile" })).toBeHidden();

  // It opens your places, under it, on the screen.
  await me.click();
  await expect(me).toHaveAttribute("aria-expanded", "true");
  const profile = header.getByRole("link", { name: "Your profile" });
  await expect(profile).toBeVisible();
  await expect(header.getByRole("link", { name: "Activity", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
  const [menu, button] = await Promise.all([profile.boundingBox(), me.boundingBox()]);
  expect(menu!.y).toBeGreaterThanOrEqual(button!.y + button!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Tab goes into it; Escape shuts it and the keyboard is back on you.
  await page.keyboard.press("Tab");
  await expect(header.getByText("hollis-header@example.com")).toBeVisible();
  await expect(profile).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profile).toBeHidden();
  await expect(me).toBeFocused();
  await expect(me).toHaveAttribute("aria-expanded", "false");

  // Going somewhere from it closes it. (Your page is made the first time
  // you open it; from then on, there it's marked.)
  await me.click();
  await profile.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hollis (you)");
  await expect(profile).toBeHidden();
  await page.reload();
  await me.click();
  await expect(profile).toHaveAttribute("aria-current", "page");
  await expect(profile).toHaveAttribute("href", new URL(page.url()).pathname);

  // And out.
  await header.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(header.getByRole("button", { name: "Your profile" })).toHaveCount(0);
});

test("an agent's dashboard is in their colour, header and all, and named in words on a phone", async ({ browser }) => {
  // Merlot.
  const agent = await signInAgent(browser, "hana-header@example.com", "Hana Header");
  await agent.setViewportSize({ width: 360, height: 640 });
  await agent.goto("/dashboard");
  const header = agent.getByRole("banner");
  const dashboard = header.getByRole("link", { name: "Dashboard" });
  await expect(dashboard).toHaveText("Dashboard");
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toHaveAttribute("aria-current", "page");
  expect(await background(agent)).toBe("rgb(122, 46, 59)");
  await expect(header.getByRole("button", { name: "Sign out" })).toBeHidden();
  expect(await agent.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Their brand page is in the dashboard too; their menu has it.
  await agent.goto("/dashboard/profile");
  await expect(dashboard).toHaveAttribute("aria-current", "true");
  await header.getByRole("button", { name: "Your profile" }).click();
  await expect(header.getByRole("link", { name: "Dashboard" }).last()).toBeVisible();
  await agent.keyboard.press("Escape");

  // Anywhere else, the site's own colour.
  await agent.goto("/search");
  expect(await background(agent)).toBe("rgb(31, 95, 91)");
  await expect(dashboard).not.toHaveAttribute("aria-current");
});

test("an address that isn't here: a 404 with a way home and to the map", async ({ page, request }) => {
  expect((await request.get("/no-such-page")).status()).toBe(404);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Open the map" })).toHaveAttribute("href", "/search");
  // Someone who isn't here says the same.
  expect((await page.goto("/people/00000000-0000-0000-0000-000000000000"))!.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await page.getByRole("link", { name: "Open the map" }).click();
  await page.waitForURL("**/search");
});

test("a page that breaks says so, with Try again and a way home", async ({ page }) => {
  await page.goto("/e2e/broken");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Something went wrong");
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  // Trying again asks again; it's still broken, and still says so.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Something went wrong");
  await page.getByRole("link", { name: "Go home" }).click();
  await page.waitForURL((url) => url.pathname === "/");
});

test("nothing keeps moving on its own: every animation on the main pages ends", async ({ browser }) => {
  const page = await signUpBuyer(browser, "still-header@example.com", "Still Header");
  // A loading shape breathes twice, then holds still.
  expect(
    await page.evaluate(() => {
      const shape = document.createElement("span");
      shape.className = "animate-pulse";
      document.body.append(shape);
      const count = getComputedStyle(shape).animationIterationCount;
      shape.remove();
      return count;
    }),
  ).toBe("2");
  for (const path of ["/", "/search", "/people/me", "/activity"]) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    const endless = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().endTime === Infinity)
        .map((animation) => (animation as CSSAnimation).animationName ?? "transition"),
    );
    expect(endless, path).toEqual([]);
  }
});
