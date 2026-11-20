import { expect, test, type Page } from "@playwright/test";
import { createShare, enterCode, saveDetails, signInAgent, signUpBuyer } from "./helpers";

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

// The places in the bar, left to right, as they're drawn: each one's word
// (the last thing in it, under its icon), and where it and its word are.
const places = (page: Page) =>
  page.getByRole("banner").evaluate((header) =>
    [...header.querySelectorAll<HTMLElement>('nav[aria-label="Main"] a, nav[aria-label="Main"] button')]
      .filter((control) => control.getBoundingClientRect().width > 0)
      .map((control) => {
        const word = control.querySelector<HTMLElement>(":scope > span:last-of-type");
        const [box, text] = [control.getBoundingClientRect(), word?.getBoundingClientRect()];
        return {
          word: word?.innerText.trim() ?? "",
          left: box.left,
          right: box.right,
          top: box.top,
          width: box.width,
          height: box.height,
          wordLeft: text?.left ?? 0,
          wordRight: text?.right ?? 0,
          wordTop: text?.top ?? 0,
          wordHeight: text?.height ?? 0,
        };
      }),
  );

// Six places with their names under their icons, in one row, each a
// fingertip's size, none over its neighbour, and nothing off the side.
async function expectNamedPlaces(page: Page, names: string[], where: string) {
  const width = page.viewportSize()!.width;
  const bar = await places(page);
  expect(bar.map((place) => place.word), where).toEqual(names);
  for (const [i, place] of bar.entries()) {
    const label = `${place.word} ${where}`;
    expect(place.width, label).toBeGreaterThanOrEqual(44);
    expect(place.height, label).toBeGreaterThanOrEqual(44);
    // The word is drawn (not kept for screen readers only), all of it inside its place.
    expect(place.wordHeight, label).toBeGreaterThanOrEqual(10);
    expect(place.wordRight - place.wordLeft, label).toBeGreaterThan(10);
    expect(place.wordLeft, label).toBeGreaterThanOrEqual(place.left);
    expect(place.wordRight, label).toBeLessThanOrEqual(place.right);
    // One row: the same height on the page, the words in one line.
    expect(place.top, label).toBe(bar[0].top);
    expect(Math.abs(place.wordTop - bar[0].wordTop), label).toBeLessThanOrEqual(1);
    if (i > 0) expect(place.left, label).toBeGreaterThanOrEqual(bar[i - 1].right);
  }
  expect(bar[0].left, where).toBeGreaterThanOrEqual(0);
  expect(bar.at(-1)!.right, where).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), where).toBeLessThanOrEqual(width);
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

  // On the sign-in page itself there's no Sign in up there: it would only
  // lead to where they are. The form is the one thing to do.
  for (const path of ["/login", "/login?as=agent", "/login?next=%2Fsearch"]) {
    await page.goto(path);
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "For agents", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Porchcard" })).toHaveAttribute("href", "/");
    await expect(header.getByRole("link")).toHaveCount(2);
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
    await expect(page.getByRole("main").getByLabel("Email")).toBeVisible();
  }
});

test("signed in, you're one button: your places and Sign out are behind your initial", async ({ browser }) => {
  const page = await signUpBuyer(browser, "hollis-header@example.com", "Hollis Header");
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/search");
  const header = page.getByRole("banner");
  const me = header.getByRole("button", { name: "Account menu" });
  await expect(me).toContainText("H");
  // Clients are an agent's: not in a buyer's header.
  await expect(header.getByRole("link", { name: "Clients" })).toHaveCount(0);
  const meBox = await size(page, "Account menu", "button");
  expect(meBox.width).toBeGreaterThanOrEqual(44);
  expect(meBox.height).toBeGreaterThanOrEqual(44);
  // No Sign out beside it.
  await expect(header.getByRole("button", { name: "Sign out" })).toBeHidden();
  await expect(header.getByRole("link", { name: "Your profile" })).toBeHidden();

  // It opens your places, under it, on the screen.
  await me.click();
  await expect(me).toHaveAttribute("aria-expanded", "true");
  const profile = header.getByRole("link", { name: "Your profile" });
  await expect(profile).toBeVisible();
  const inMenu = page.locator("#account-menu");
  // The first of them is their own page. The bell isn't repeated in here:
  // it's in the bar, by name.
  await expect(inMenu.getByRole("link").first()).toHaveText("Your profile");
  await expect(inMenu.getByRole("link", { name: /Notifications/ })).toHaveCount(0);
  await expect(header.getByRole("link", { name: /^Notifications/ })).toHaveCount(1);
  await expect(header.getByRole("link", { name: /^Notifications/ })).toHaveAttribute("href", "/activity");
  await expect(header.getByRole("link", { name: "Clients", exact: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
  // Two places the bar has no room for: the homes you saved, and people by name.
  const savedHomes = inMenu.getByRole("link", { name: "Saved homes", exact: true });
  const findPeople = inMenu.getByRole("link", { name: "Find people", exact: true });
  await expect(savedHomes).toHaveAttribute("href", "/people/me?show=saved");
  await expect(findPeople).toHaveAttribute("href", "/search/people");
  for (const link of [savedHomes, findPeople]) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // All of it on a small phone's screen, Sign out included.
  await expect(header.getByRole("button", { name: "Sign out" })).toBeInViewport({ ratio: 1 });
  const [menu, button] = await Promise.all([profile.boundingBox(), me.boundingBox()]);
  expect(menu!.y).toBeGreaterThanOrEqual(button!.y + button!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Tab goes into it, and ↑ and ↓ move through it; Escape shuts it and the
  // keyboard is back on you.
  await page.keyboard.press("Tab");
  await expect(header.getByText("hollis-header@example.com")).toBeVisible();
  await expect(profile).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(savedHomes).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(findPeople).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(inMenu.getByRole("link", { name: "I'm an agent", exact: true })).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowUp");
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
  await page.goto("/browse");
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
  // you open it; from then on, there it's marked.) Anywhere else, "Me" in
  // the bar isn't marked as where you are; on your own page it is, with the
  // line the other places have.
  await expect(me).not.toHaveAttribute("aria-current");
  await me.click();
  await profile.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hollis (you)");
  await expect(profile).toBeHidden();
  await page.reload();
  await expect(me).toHaveAttribute("aria-current", "page");
  const underline = (control: typeof me) => control.evaluate((el) => getComputedStyle(el, "::after").backgroundColor);
  const line = await underline(me);
  expect(line).not.toBe("rgba(0, 0, 0, 0)");
  await me.click();
  await expect(profile).toHaveAttribute("aria-current", "page");
  await expect(profile).toHaveAttribute("href", new URL(page.url()).pathname);
  await page.keyboard.press("Escape");
  // Editing it is still yours: marked there too, and on your saved homes.
  await page.goto("/people/me/edit");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Edit profile");
  await expect(me).toHaveAttribute("aria-current", "true");
  await page.goto("/people/me?show=saved");
  await expect(me).toHaveAttribute("aria-current", "page");
  // Anywhere else the line is under that place, the same line, and not under you.
  await page.goto("/search");
  await expect(me).not.toHaveAttribute("aria-current");
  expect(await underline(me)).toBe("rgba(0, 0, 0, 0)");
  expect(await underline(header.getByRole("link", { name: "Search", exact: true }))).toBe(line);
  await me.click();

  // And out.
  await header.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  // (The sign-in page: its form is the way in, with no Sign in above it.)
  await expect(header.getByRole("link", { name: "For agents", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(header.getByRole("button", { name: "Account menu" })).toHaveCount(0);
});

test("an agent's dashboard is in their colour, and the header is just Search, Clients, the bell and their initial", async ({
  browser,
}) => {
  // Merlot.
  const agent = await signInAgent(browser, "hana-header@example.com", "Hana Header");
  await agent.setViewportSize({ width: 360, height: 640 });
  await agent.goto("/dashboard");
  const header = agent.getByRole("banner");
  // Home, as the logo is too; no Map or Admin in the bar.
  await expect(header.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
  for (const name of ["Map", "Admin"]) {
    await expect(header.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(header.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("href", "/search");
  // Their clients, a tap from anywhere, by name even on a small phone (the
  // word under its icon), a fingertip wide, and marked as where they are
  // anywhere in the dashboard. One link, not two.
  const clients = header.getByRole("link", { name: "Clients", exact: true });
  await expect(clients).toHaveCount(1);
  await expect(clients.getByText("Clients", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(clients).toHaveAttribute("href", "/dashboard");
  await expect(clients).toHaveAttribute("aria-current", "page");
  const clientsBox = await size(agent, "Clients", "link");
  expect(clientsBox.width).toBeGreaterThanOrEqual(44);
  expect(clientsBox.height).toBeGreaterThanOrEqual(44);
  expect(await background(agent)).toBe("rgb(122, 46, 59)");
  await expect(header.getByRole("button", { name: "Sign out" })).toBeHidden();
  expect(await agent.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // It isn't repeated under their face, and nor is the bell: the bar has
  // both by name. Their own places are there (their listings among them:
  // those are theirs, not their clients'), and no "I'm an agent".
  const me = header.getByRole("button", { name: "Account menu" });
  await expect(me).not.toHaveAttribute("aria-current");
  await me.click();
  const inMenu = agent.locator("#account-menu");
  await expect(inMenu.getByRole("link").first()).toHaveText("Your profile");
  await expect(inMenu.getByRole("link", { name: "Clients" })).toHaveCount(0);
  await expect(inMenu.getByRole("link", { name: /Notifications/ })).toHaveCount(0);
  await expect(inMenu.getByRole("link", { name: "I'm an agent" })).toHaveCount(0);
  await expect(inMenu.getByRole("link")).toHaveText(["Your profile", "Listings", "Saved homes", "Find people"]);
  await expect(inMenu.getByRole("link", { name: "Listings" })).toHaveAttribute("href", "/dashboard/listings");
  await expect(header.getByRole("link", { name: "Clients", exact: true })).toHaveCount(1);
  await agent.keyboard.press("Escape");
  await agent.goto("/dashboard/links");
  await expect(clients).toHaveAttribute("aria-current", "true");
  // Their listings aren't part of Clients: there, it isn't where they are,
  // and its tabs aren't over the page.
  await agent.goto("/dashboard/listings");
  await expect(agent.getByRole("heading", { level: 1 })).toHaveText("Listings");
  await expect(clients).not.toHaveAttribute("aria-current");
  await expect(agent.getByRole("navigation", { name: "Clients" })).toHaveCount(0);

  // Anywhere else, the site's own colour, and Search is where you are on the map.
  await agent.goto("/search");
  expect(await background(agent)).toBe("rgb(36, 115, 188)");
  await expect(header.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(clients).not.toHaveAttribute("aria-current");

  // A new colour, saved: the logo has it at once, with no reload.
  // (Their colour is among their details, on Edit profile.)
  await agent.goto("/dashboard/profile");
  await agent.waitForURL(/\/people\/me\/edit#details$/);
  // (Edit profile is theirs: "Me" is where they are, not Clients.)
  await expect(me).toHaveAttribute("aria-current", "true");
  await expect(clients).not.toHaveAttribute("aria-current");
  await agent.getByRole("button", { name: "Plum" }).click();
  // (The swatch shows the colour picked. The Save under it stays the site's
  // own, like every other button on this page.)
  await expect(agent.getByRole("button", { name: "Save details", exact: true })).toHaveCSS(
    "background-color",
    "rgb(36, 115, 188)",
  );
  await saveDetails(agent);
  await agent.getByRole("banner").getByRole("link", { name: "Clients", exact: true }).click();
  await agent.waitForURL("**/dashboard");
  await expect.poll(() => background(agent)).toBe("rgb(75, 59, 120)");
});

test("on a phone every place in the bar has its name under its icon, in one row, with nothing off the side", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // An agent, on a small phone: Clients in place of Send.
  const agent = await signInAgent(browser, "nell-names@example.com", "Nell Names");
  await agent.setViewportSize({ width: 360, height: 640 });
  const hers = ["Home", "Clients", "Popular", "Search", "Notifications", "Me"];
  // (Home, their Clients, Search and its people side, their own page, and
  // over the homes full screen, where the bar is white on the dark.)
  for (const path of ["/", "/dashboard", "/search", "/search/people", "/people/me/edit", "/browse"]) {
    await agent.goto(path);
    await expectNamedPlaces(agent, hers, `for an agent on ${path}`);
    // The logo has made room for them: Home, first in the bar, goes where it went.
    const header = agent.getByRole("banner");
    await expect(header.getByRole("link", { name: "Porchcard" })).toBeHidden();
    await expect(header.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/");
    // Still one bar, as tall as it was.
    expect((await header.getByRole("navigation", { name: "Main" }).boundingBox())!.height).toBe(56);
  }

  // A buyer: Send in place of Clients.
  const buyer = await signUpBuyer(browser, "ned-names@example.com", "Ned Names");
  await buyer.setViewportSize({ width: 390, height: 780 });
  const his = ["Home", "Popular", "Search", "Send", "Notifications", "Me"];
  for (const path of ["/", "/search", "/send", "/activity", "/browse"]) {
    await buyer.goto(path);
    await expectNamedPlaces(buyer, his, `for a buyer on ${path}`);
  }
  // The word under the bell is the bell's: one link, named whole for a
  // screen reader, and marked on its own page.
  await buyer.goto("/activity");
  await expect(buyer.getByRole("banner").getByRole("link", { name: /^Notifications/ })).toHaveCount(1);
  await expect(buyer.getByRole("banner").getByRole("link", { name: "Notifications", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // And on the smallest phone it still fits.
  await buyer.setViewportSize({ width: 360, height: 640 });
  await buyer.goto("/");
  await expectNamedPlaces(buyer, his, "for a buyer on a 360px phone");

  // From a tablet up there's room for the logo again, beside the same names.
  await buyer.setViewportSize({ width: 1024, height: 768 });
  await buyer.goto("/");
  await expect(buyer.getByRole("banner").getByRole("link", { name: "Porchcard" })).toBeVisible();
  expect((await places(buyer)).map((place) => place.word)).toEqual(["Porchcard", ...his]);
});

test("the bar has no Browse: Search is where homes are found; the homes full screen are still a page, with the bar there", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const page = await signUpBuyer(browser, "bree-browse@example.com", "Bree Browse");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Browse", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Search", exact: true })).toHaveAttribute("href", "/search");
  // Every home full screen, at its own address: a page, not a pop-out, with
  // the bar over it and the other places one tap away.
  await page.goto("/browse");
  await expect(page).toHaveTitle("Browse · Porchcard");
  await expect(page.getByRole("article").first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Homes" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: /^Notifications/ })).toBeVisible();
  await header.getByRole("link", { name: "Search", exact: true }).click();
  await page.waitForURL(/\/search$/);
  await page.goBack();
  await page.waitForURL(/\/browse$/);
  await expect(page.getByRole("article").first()).toBeVisible();

  // On a phone too.
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/browse");
  await expect(page.getByRole("dialog", { name: "Homes" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Home", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Search", exact: true })).toBeVisible();

  // The old address, with no home asked for, is the same place.
  await page.goto("/reel");
  await expect(page).toHaveURL(/\/browse$/);
  // With a home asked for it stays as it was: that home, first.
  await page.goto("/reel?home=SAMPLE-1002");
  await expect(page).toHaveURL(/\/reel\?home=SAMPLE-1002$/);
  await expect(page.locator("article[data-home]").first()).toHaveAttribute("data-home", "SAMPLE-1002");
});

test("on someone's link, which has no bar, an agent's Clients is under their face", async ({ browser }) => {
  test.setTimeout(90_000);
  const sender = await signInAgent(browser, "sal-sender-header@example.com", "Sal Sender");
  const { url } = await createShare(sender, ["4127 Larkmoor"], ["Robin"]);
  const agent = await signInAgent(browser, "ada-header@example.com", "Ada Header");
  await agent.goto(url);
  const header = agent.getByRole("banner");
  // The sender's header: the bell and Ada's face, no row of places.
  await expect(header.getByRole("link", { name: "Home", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: /^Notifications/ })).toHaveAttribute("href", "/activity");
  await header.getByRole("button", { name: "Account menu" }).click();
  const inMenu = agent.locator("#account-menu");
  await expect(inMenu.getByRole("link", { name: "Clients", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(inMenu.getByRole("link", { name: /Notifications/ })).toHaveCount(0);
  expect(await agent.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("an agent new here goes straight to getting started: a real redirect, not the dashboard first", async ({ page }) => {
  await page.goto("/for-agents");
  await page.getByRole("link", { name: "Start free" }).click();
  await page.getByLabel("Email").fill("nameless-header@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await page.waitForURL("**/welcome**");
  const response = await page.request.get("/dashboard", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/welcome");
});

test("an address that isn't here: a 404 with a way home and to Search", async ({ page, request }) => {
  expect((await request.get("/no-such-page")).status()).toBe(404);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "Search homes" })).toHaveAttribute("href", "/search");
  // The header is there, as on any page.
  await expect(page.getByRole("banner").getByRole("link", { name: "Porchcard" })).toBeVisible();

  // A home that's gone (a link to one that sold): the header too, though the
  // feed would have drawn it, and what most likely happened.
  expect((await page.goto("/homes/NOPE-123"))!.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that home");
  await expect(page.getByRole("banner").getByRole("link", { name: "Porchcard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Search homes" })).toHaveAttribute("href", "/search");

  // Someone who isn't here says the same.
  expect((await page.goto("/people/00000000-0000-0000-0000-000000000000"))!.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");
  await page.getByRole("link", { name: "Search homes" }).click();
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
