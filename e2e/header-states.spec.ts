import { expect, test, type Page } from "@playwright/test";
import { enterCode, signInAgent, signUpBuyer } from "./helpers";

// The colour things in the header take (Porchcard blue, or an agent's own
// on their dashboard): what a swatch of the brand colour comes out as there.
const background = (page: Page) =>
  page.getByRole("banner").evaluate((el) => {
    const swatch = document.createElement("span");
    swatch.style.backgroundColor = "var(--brand)";
    el.append(swatch);
    const color = getComputedStyle(swatch).backgroundColor;
    swatch.remove();
    return color;
  });

async function size(page: Page, name: string, role: "link" | "button") {
  const box = await page.getByRole("banner").getByRole(role, { name, exact: true }).boundingBox();
  return { width: box!.width, height: box!.height };
}

test("signed out, the header is just For agents and Sign in, even on a small phone, and nothing runs off the side", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const path of ["/search", "/"]) {
    await page.goto(path);
    const header = page.getByRole("banner");
    // Just the logo, For agents and Sign in: no Home, no Map, no Sign up, no bell.
    await expect(header.getByRole("link")).toHaveCount(3);
    await expect(header.getByRole("button")).toHaveCount(0);
    for (const name of ["Porchcard", "For agents", "Sign in"]) {
      const box = await size(page, name, "link");
      expect(box.width, name).toBeGreaterThanOrEqual(44);
      expect(box.height, name).toBeGreaterThanOrEqual(44);
    }
    await expect(header.getByRole("link", { name: "For agents", exact: true })).toHaveAttribute("href", "/for-agents");
    // (Back to this page once they're in.)
    await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
      "href",
      path === "/" ? "/login" : `/login?next=${encodeURIComponent(path)}`,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  }
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

  // Tab goes into it, and ↑ and ↓ move through it; Escape shuts it and the
  // keyboard is back on you.
  await page.keyboard.press("Tab");
  await expect(header.getByText("hollis-header@example.com")).toBeVisible();
  await expect(profile).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(header.getByRole("link", { name: "Activity", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(profile).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(profile).toBeHidden();
  await expect(me).toBeFocused();
  await expect(me).toHaveAttribute("aria-expanded", "false");

  // Tab on past its end: it closes, so whatever the keyboard reaches next is
  // never hidden under it, and the keyboard stays there.
  await me.click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("End");
  await expect(header.getByRole("button", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(profile).toBeHidden();
  await expect(me).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#account-menu, header")))).toBe(false);

  // Over the homes full screen, ↓ in it stays in it: the home behind doesn't change.
  await page.goto("/reel");
  await me.click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowDown");
  await expect(profile).toBeVisible();
  expect(await page.locator("[data-reel]").evaluate((reel) => reel.scrollTop)).toBe(0);

  // A tap on the photo beside it only closes it; the next tap there is the
  // one that picks the spot.
  // (Where the photo on screen is drawn: the homes either side are there
  // too, out of sight, and it's fitted inside its frame.)
  const beside = await page.evaluate(() => {
    const img = [...document.querySelectorAll<HTMLImageElement>('[role="group"][aria-label^="Photos of"] img')].find(
      (photo) => {
        const box = photo.getBoundingClientRect();
        return photo.complete && box.top >= 0 && box.top < innerHeight / 2 && box.left >= 0 && box.left < innerWidth / 2;
      },
    )!;
    const box = img.getBoundingClientRect();
    const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
    return { x: box.x + (box.width - img.naturalWidth * scale) / 2 + 20, y: box.y + box.height / 2 };
  });
  await page.mouse.click(beside.x, beside.y);
  await expect(profile).toBeHidden();
  await page.waitForTimeout(500);
  await expect(page.locator("[data-spot-card]")).toHaveCount(0);
  await page.mouse.click(beside.x, beside.y);
  await expect(page.locator("[data-spot-card]")).toBeVisible();
  await page.goto("/search");

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

test("an agent's dashboard is in their colour, and the header is just Search, the bell and their initial, the Dashboard under it", async ({
  browser,
}) => {
  // Merlot.
  const agent = await signInAgent(browser, "hana-header@example.com", "Hana Header");
  await agent.setViewportSize({ width: 360, height: 640 });
  await agent.goto("/dashboard");
  const header = agent.getByRole("banner");
  // No Home (the logo is the way home), no Map, no Dashboard or Admin in the bar.
  for (const name of ["Home", "Map", "Dashboard", "Admin"]) {
    await expect(header.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(header.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("href", "/search");
  expect(await background(agent)).toBe("rgb(122, 46, 59)");
  await expect(header.getByRole("button", { name: "Sign out" })).toBeHidden();
  expect(await agent.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // The Dashboard is under their initial, marked as where they are, on their
  // brand page too.
  await header.getByRole("button", { name: "Your profile" }).click();
  const dashboard = header.getByRole("link", { name: "Dashboard" });
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toHaveAttribute("aria-current", "page");
  await agent.keyboard.press("Escape");
  await agent.goto("/dashboard/profile");
  await header.getByRole("button", { name: "Your profile" }).click();
  await expect(dashboard).toHaveAttribute("aria-current", "true");
  await agent.keyboard.press("Escape");

  // Anywhere else, the site's own colour, and Search is where you are on the map.
  await agent.goto("/search");
  expect(await background(agent)).toBe("rgb(36, 115, 188)");
  await expect(header.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("aria-current", "page");

  // A new colour, saved: the logo has it at once, with no reload.
  await agent.goto("/dashboard/profile");
  await agent.getByRole("button", { name: "Plum" }).click();
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL("**/dashboard");
  await expect.poll(() => background(agent)).toBe("rgb(75, 59, 120)");
});

test("an agent with no name yet goes straight to add it: a real redirect, not the dashboard first", async ({ page }) => {
  await page.goto("/for-agents");
  await page.getByRole("link", { name: "Start free" }).click();
  await page.getByLabel("Email").fill("nameless-header@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await page.waitForURL("**/dashboard/profile");
  const response = await page.request.get("/dashboard", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/dashboard/profile");
});

test("an address that isn't here: a 404 with a way home and to the map", async ({ page, request }) => {
  expect((await request.get("/no-such-page")).status()).toBe(404);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Open the map" })).toHaveAttribute("href", "/search");
  // The header is there, as on any page.
  await expect(page.getByRole("banner").getByRole("link", { name: "Porchcard" })).toBeVisible();

  // A home that's gone (a link to one that sold): the header too, though the
  // feed would have drawn it, and what most likely happened.
  expect((await page.goto("/homes/NOPE-123"))!.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that home");
  await expect(page.getByRole("banner").getByRole("link", { name: "Porchcard" })).toBeVisible();
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
  // The tab says so too.
  await expect(page).toHaveTitle("Something went wrong · Porchcard");
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  // Trying again asks again; it's still broken, and still says so.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Something went wrong");
  await page.getByRole("link", { name: "Go home" }).click();
  await page.waitForURL((url) => url.pathname === "/");
});

test("nothing keeps moving on its own: every animation on the main pages ends within 5s", async ({ browser }) => {
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
    // (A spinner turns while something's on its way: that's what it means.)
    const long = await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => (animation as CSSAnimation).animationName !== "spin")
        .filter((animation) => Number(animation.effect?.getComputedTiming().endTime) > 5000)
        .map((animation) => (animation as CSSAnimation).animationName ?? "transition"),
    );
    expect(long, path).toEqual([]);
  }
});
