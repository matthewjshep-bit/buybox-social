import { expect, test, type Browser, type Page } from "@playwright/test";
import { createShare, signInAgent, signUpBuyer } from "./helpers";

// The light pages are made of one kit (lib/ui.ts, components/ui.tsx): one
// button, one text box, one face for each kind of person, prices in the
// display type. These check what a person sees, not the class names.

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false };

// Every button, and every link drawn as one (a fill, an edge or a ring), in
// the header, the page and any open sheet: how tall it is, whether its ends
// are round, and how wide each of its icons is. A card that's a link (taller
// than any button), a word that acts (no shape of its own) and a chip that
// carries a photo aren't buttons.
async function buttonShapes(page: Page) {
  return page.evaluate(() => {
    const roots = [...document.querySelectorAll("header, main, dialog[open]")];
    const controls = new Set(roots.flatMap((root) => [...root.querySelectorAll<HTMLElement>("a, button")]));
    return [...controls].flatMap((el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      // A ring is a shadow; an empty one (every Tailwind shadow layer starts as one) isn't an edge.
      const ring = style.boxShadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,? ?/g, "").trim();
      const drawn =
        style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
        parseFloat(style.borderTopWidth) >= 1 ||
        (ring !== "" && ring !== "none");
      if (!box.height || box.height >= 64 || !drawn || el.closest("[hidden]") || el.querySelector("img")) return [];
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40);
      const round = parseFloat(style.borderTopLeftRadius) >= box.height / 2 - 0.5;
      const icons = [...el.children]
        .filter((child) => child instanceof SVGElement && getComputedStyle(child).display !== "none")
        .map((icon) => Math.round(icon.getBoundingClientRect().width));
      return [{ name, height: Math.round(box.height), round, icons }];
    });
  });
}

async function expectKitButtons(page: Page, where: string) {
  const shapes = await buttonShapes(page);
  expect(shapes.length, where).toBeGreaterThan(0);
  for (const shape of shapes) {
    expect(shape.round, `${where}: ${shape.name}`).toBe(true);
    expect([44, 48], `${where}: ${shape.name} is ${shape.height}px`).toContain(shape.height);
    // Never squeezed by the words beside it, on the narrowest phone too.
    for (const width of shape.icons) expect(width, `${where}: ${shape.name}'s icon`).toBeGreaterThanOrEqual(12);
  }
}

// What a colour token is right here (the agent's brand on their pages).
const colourOf = (page: Page, token: string) =>
  page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    (document.querySelector("main") ?? document.body).append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);

// A text box with the keyboard in it: its own solid ring in the brand
// colour, and no second outline around that.
async function expectFieldFocus(page: Page, label: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.focus();
  const brand = await colourOf(page, "var(--brand)");
  const style = await field.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, ring: s.boxShadow, edge: s.borderTopColor, height: el.getBoundingClientRect().height };
  });
  expect(style.outline, label).toBe("none");
  expect(style.ring, label).toContain(`${brand} 0px 0px 0px 2px`);
  expect(style.edge, label).toBe(brand);
  return style;
}

async function signIn(browser: Browser, email: string) {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return page;
}

test("the agent's pages: every button round-ended at 44 or 48px, text boxes ringed in their colour, prices in the display type", async ({
  browser,
}) => {
  const agent = await signInAgent(browser, "una-kit@example.com", "Una Kit");
  await expectKitButtons(agent, "dashboard");
  const ink = await colourOf(agent, "var(--ink)");

  // Their own page: their face in ink, as it is in the header beside it.
  await agent.goto("/people/me");
  await expect(agent.locator("#profile-name")).toHaveText("Una (you)");
  const big = agent.locator("#profile-name").locator("xpath=preceding-sibling::span[1]");
  expect(await big.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ink);

  // Picking homes for a link: the search box, and each home's price.
  await agent.goto("/dashboard/new");
  const search = await expectFieldFocus(agent, "Search by address, city, ZIP or MLS number");
  expect(search.height).toBe(48);
  const heading = await agent.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).fontFamily);
  const price = agent.getByRole("button", { name: /812 N Corbel/ }).getByText("$724,900");
  expect(await price.evaluate((el) => getComputedStyle(el).fontFamily)).toBe(heading);

  const { dashboardUrl } = await createShare(agent, ["812 N Corbel"], ["Kit"]);
  await agent.goto(dashboardUrl);
  await expectKitButtons(agent, "client page");
  const home = agent.getByRole("region", { name: "812 N Corbel St" });
  expect(await home.getByText("$724,900").evaluate((el) => getComputedStyle(el).fontFamily)).toBe(heading);
  // ...on a 360px phone, where Text, Copy and Preview share the card...
  const wide = agent.viewportSize();
  await agent.setViewportSize({ width: 360, height: 640 });
  await expectKitButtons(agent, "client page at 360px");
  // ...and in the home's Porchcard, open beside it.
  await home.getByRole("button", { name: "Porchcard for 812 N Corbel St" }).click();
  await expect(agent.getByRole("dialog", { name: "Porchcard" })).toBeVisible();
  await expectKitButtons(agent, "Porchcard");
  await agent.keyboard.press("Escape");
  await expect(agent.getByRole("dialog", { name: "Porchcard" })).toBeHidden();
  if (wide) await agent.setViewportSize(wide);

  // The agent's own words in the thread, under their face in ink, as everywhere.
  await expectFieldFocus(agent, "Reply to your client");
  await home.getByLabel("Reply to your client").fill("I can show you this one on Saturday.");
  await home.getByRole("button", { name: "Reply", exact: true }).click();
  const said = home.getByRole("listitem").filter({ hasText: "I can show you this one on Saturday." });
  await expect(said).toBeVisible();
  const face = said.locator("span[aria-hidden]").filter({ hasText: /^U$/ }).first();
  expect(await face.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ink);
  // ...and the same face in the header.
  const mine = agent.getByRole("button", { name: "Your profile" }).locator("span").first();
  expect(await mine.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(ink);

  await agent.goto("/dashboard/profile");
  await expectKitButtons(agent, "brand");
  await expectFieldFocus(agent, "Full name");
});

test("a buyer's pages, sign-in and the admin are the same kit, and a buyer's face is the brand's colour", async ({
  browser,
}) => {
  // Signing in: the one text box and the one button.
  const out = await (await browser.newContext(DESKTOP)).newPage();
  await out.goto("/login");
  await expectKitButtons(out, "sign in");
  await expectFieldFocus(out, "Email");

  const buyer = await signUpBuyer(browser, "kit-buyer@example.com", "Kira Kit");
  const brand = await colourOf(buyer, "var(--brand)");
  const mine = buyer.getByRole("button", { name: "Your profile" }).locator("span").first();
  expect(await mine.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(brand);

  // Nothing yet on their page or their bell: said the same way, with a way on.
  await buyer.goto("/people/me");
  await expect(buyer.getByText("Your page fills up as you go")).toBeVisible();
  await expectKitButtons(buyer, "profile");
  const big = buyer.locator("#profile-name").locator("xpath=preceding-sibling::span[1]");
  expect(await big.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(brand);
  await buyer.goto("/activity");
  await expect(buyer.getByText("Nothing yet")).toBeVisible();
  await expectKitButtons(buyer, "activity");

  // The admin: buttons and the search box, and people's faces by who they are
  // (an agent of its own, so this test needs nothing from the one above).
  await signInAgent(browser, "ulla-kit@example.com", "Ulla Kit");
  const admin = await signIn(browser, "matt@shepflips.com");
  for (const path of ["/admin", "/admin/people", "/admin/homes"]) {
    await admin.goto(path);
    await expectKitButtons(admin, path);
  }
  await admin.goto("/admin/people?q=kit");
  await expectFieldFocus(admin, "Search");
  const rowFace = async (name: string) =>
    admin
      .getByRole("main")
      .getByRole("link", { name: new RegExp(name) })
      .locator("span[aria-hidden]")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await rowFace("Ulla Kit")).toBe(await colourOf(admin, "var(--ink)"));
  expect(await rowFace("Kira Kit")).toBe(await colourOf(admin, "var(--brand)"));
});
