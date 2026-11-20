import { expect, test, type Page } from "@playwright/test";
import { createShare, detailsForm, enterCode, scrollToEnd, signInAgent, signUpBuyer, throughWelcome, toDetails, toFirstHome } from "./helpers";

const SMALL = { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const ON_ITS_SIDE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// A real touch swipe up, near the left edge, most of the way up the screen.
async function swipeUp(page: Page) {
  const { width, height } = page.viewportSize()!;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: width * 0.08, y }] });
  await touch("touchStart", height * 0.9);
  for (let i = 1; i <= 8; i++) {
    await touch("touchMove", height * (0.9 - i * 0.1));
    await page.waitForTimeout(12);
  }
  await touch("touchEnd");
}

test("signed out, the home page says what this is; See homes shows three homes straight away, then asks you to sign up", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // The home page: what this is, for agents and for buyers, and a way to start.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The social way to shop for homes.");
  await expect(page.getByRole("heading", { level: 2, name: "Send a few homes. Learn exactly what they want." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Shop for homes together." })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  // Two things to do at the top: Sign up, which goes to the form at its
  // foot, or see homes first. And an agent's way in, twice: where they're
  // reading, and by the form (which makes a buyer's account).
  const main = page.getByRole("main");
  await expect(main.getByRole("link")).toHaveText(["Sign up", "See homes", "Start free as an agent", "I'm an agent"]);
  await expect(main.getByRole("link", { name: "See homes" })).toHaveAttribute("href", "/browse");
  // Each of them a button, a fingertip tall: by the form, as wide as the form.
  for (const name of ["Start free as an agent", "I'm an agent"]) {
    const door = main.getByRole("link", { name });
    await expect(door).toHaveAttribute("href", "/login?as=agent");
    expect((await door.boundingBox())!.height, name).toBeGreaterThanOrEqual(48);
  }
  await main.getByRole("link", { name: "Sign up" }).click();
  const form = main.getByRole("form", { name: "Sign up" });
  await expect(form).toBeInViewport();
  const formBox = (await form.boundingBox())!;
  const agentBox = (await main.getByRole("link", { name: "I'm an agent" }).boundingBox())!;
  expect(agentBox.y).toBeGreaterThan(formBox.y + formBox.height);
  expect(agentBox.width).toBeGreaterThanOrEqual(formBox.width);

  // See homes, signed out: a home straight away, with no form in front of
  // it. Three of them; the sign-up waits at the end, out of sight.
  await main.getByRole("link", { name: "See homes" }).click();
  await page.waitForURL(/\/browse$/);
  await expect(page.getByRole("article").first()).toBeInViewport({ ratio: 0.9 });
  await expect(page.getByRole("region", { name: "Welcome" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Homes for you");
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("form", { name: "Sign up" })).toHaveCount(1);
  await expect(page.getByRole("form", { name: "Sign up" })).not.toBeInViewport();

  // After the third, sign up to see more. No more homes load.
  await page.evaluate(() => {
    const reel = document.querySelector<HTMLElement>("[data-reel]")!;
    reel.scrollTo({ top: reel.scrollHeight });
  });
  await expect(page.getByRole("heading", { name: "There's plenty more to see" })).toBeInViewport();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("article")).toHaveCount(3);

  // A mistake says which field, and keeps what was typed. (The phone is
  // optional, but has to be a whole number when it's there.)
  const gate = page.getByRole("form", { name: "Sign up" }).last();
  await gate.getByLabel("First name").fill("Robin");
  await gate.getByLabel(/^Phone/).fill("555-0100");
  await gate.getByLabel("Email").fill("robin@example.com");
  await gate.getByRole("button", { name: "Sign up free" }).click();
  await expect(gate.getByRole("alert")).toHaveText("Please add the phone number with its area code, or leave it empty.");
  await expect(gate.getByLabel(/^Phone/)).toHaveAttribute("aria-invalid", "true");
  await expect(gate.getByLabel("First name")).toHaveValue("Robin");
  await expect(gate.getByLabel("Email")).toHaveValue("robin@example.com");

  // Then the code from the email, right here (locally it's shown, since no
  // email goes out), and they're signed in where they are: a buyer, by the
  // name they gave, no password.
  await gate.getByLabel(/^Phone/).fill("(206) 555-0100");
  await gate.getByRole("button", { name: "Sign up free" }).click();
  await enterCode(page.getByRole("form", { name: "Sign up" }).last());
  // New here: what they are (shopping; their name they gave), then back.
  await throughWelcome(page, "buyer");
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText("R");
  await expect(page).toHaveURL(/localhost:\d+\/browse$/);

  // Signed in, the home page is their feed, with every home one tap away,
  // for as long as they scroll.
  await expect(page.getByRole("form", { name: "Sign up" })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, Robin");
  await expect(page.getByRole("banner").getByRole("link", { name: "Search", exact: true })).toHaveAttribute("href", "/search");
  await page.goto("/browse");
  await expect(page.getByRole("article").first()).toBeVisible();
  await scrollToEnd(page);
  await expect(page.getByRole("article")).toHaveCount(13);

  expect(pageErrors).toEqual([]);
});

test("on a phone, signed out, Browse opens on a home, and a swipe goes on to the next", async ({ browser }) => {
  for (const options of [SMALL, ON_ITS_SIDE]) {
    const page = await (await browser.newContext(options)).newPage();
    await page.goto("/browse");
    const name = `${options.viewport.width}x${options.viewport.height}`;
    // The first home has the screen: nothing to read or fill in before it.
    const homes = page.getByRole("article");
    await expect(homes.first(), name).toBeInViewport({ ratio: 0.9 });
    await expect(page.getByRole("region", { name: "Welcome" }), name).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Sign up" }), name).not.toBeInViewport();
    // Sign in is over it, for someone who has an account.
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }), name).toBeInViewport({ ratio: 1 });
    // A swipe moves on to the next home.
    await swipeUp(page);
    await expect(homes.nth(1), name).toBeInViewport({ ratio: 0.9 });
    await page.context().close();
  }
});

test("on a phone, the comment box and the sign-up button stay above the keyboard", async ({ browser }) => {
  const agent = await signInAgent(browser, `keys.${Date.now()}@example.com`, "Kay Board");
  const { url } = await createShare(agent, ["4127 Larkmoor Ave NE"]);
  const page = await (await browser.newContext(SMALL)).newPage();
  await page.goto(url);
  await toFirstHome(page);
  // A phone's keyboard covers the foot of the window without making the window smaller.
  const keyboard = (height: number) =>
    page.evaluate((covered) => {
      const view = window.visualViewport!;
      Object.defineProperty(view, "height", { configurable: true, get: () => innerHeight - covered });
      view.dispatchEvent(new Event("resize"));
    }, height);
  const bottomOf = async (el: ReturnType<Page["locator"]>) => {
    const box = (await el.boundingBox())!;
    return box.y + box.height;
  };
  const seen = 640 - 290;

  await page.getByRole("article").first().getByRole("button", { name: /^Comments/ }).click();
  const comments = page.getByRole("dialog", { name: "Comments" });
  const box = comments.getByRole("textbox").first();
  await expect(box).toBeVisible();
  await keyboard(290);
  await expect.poll(() => bottomOf(box)).toBeLessThanOrEqual(seen);
  expect((await comments.boundingBox())!.y).toBeGreaterThanOrEqual(0);

  // Sending it, signed out, asks who they are: the whole form within reach, Continue included.
  await box.fill("Love the porch");
  await box.press("Enter");
  const join = page.getByRole("dialog", { name: "Sign up to like and comment" });
  await expect(join).toBeVisible();
  await expect.poll(() => bottomOf(join)).toBeLessThanOrEqual(seen);
  expect((await join.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  const go = join.getByRole("button", { name: "Continue" });
  await go.scrollIntoViewIfNeeded();
  expect(await bottomOf(go)).toBeLessThanOrEqual(seen);

  // The keyboard away: back at the foot of the screen.
  await keyboard(0);
  await expect.poll(() => bottomOf(join)).toBe(640);
});

test("the page for agents tells the home page's pitch, and its button says what it does for whoever is looking", async ({ browser }) => {
  // Signed out: the same headline and the same three lines as the home page;
  // Start free, or see homes first.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/");
  const pitch = anon.locator("#agents");
  const headline = await pitch.getByRole("heading", { level: 2 }).innerText();
  const lines = await pitch.getByRole("listitem").allInnerTexts();
  expect(lines).toHaveLength(3);
  await anon.goto("/for-agents");
  const main = anon.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(headline);
  expect(await main.getByRole("listitem").allInnerTexts()).toEqual(lines);
  // (And under them, for everyone, one quiet line to the API, for an agent whose CRM does the sending.)
  await expect(main.getByRole("link")).toHaveText(["Start free", "See homes", "Connect them with the Porchcard API"]);
  await expect(main.getByRole("link", { name: "Connect them with the Porchcard API" })).toHaveAttribute("href", "/developers");
  await expect(main.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/login?as=agent");
  await expect(main.getByRole("link", { name: "See homes" })).toHaveAttribute("href", "/browse");
  await expect(main.getByRole("link", { name: "Start free" })).toBeInViewport({ ratio: 1 });

  // A buyer, signed in: the button says the account itself changes, with
  // what they get and what stays. No second button (Browse is in the bar).
  const buyer = await signUpBuyer(browser, "bea-becomes@example.com", "Bea");
  await buyer.goto("/for-agents");
  const become = buyer.getByRole("main").getByRole("button", { name: "Make my account an agent's" });
  await expect(become).toHaveAccessibleDescription("You'll get a Clients page for the people you send homes to. Your likes and follows stay.");
  await expect(buyer.getByRole("main").getByText("You'll get a Clients page for the people you send homes to. Your likes and follows stay.")).toBeVisible();
  await expect(buyer.getByRole("main").getByRole("link")).toHaveText(["Connect them with the Porchcard API"]);
  // It does what it says: an agent's account, by the name they have. Their
  // details are among their profile settings.
  await become.click();
  await buyer.waitForURL("**/dashboard");
  await expect(buyer.getByRole("banner").getByRole("link", { name: "Clients", exact: true })).toBeVisible();

  // An agent: their dashboard, by its name.
  await buyer.goto("/for-agents");
  await expect(buyer.getByRole("main").getByRole("link")).toHaveText(["Go to your clients", "Connect them with the Porchcard API"]);
  await expect(buyer.getByRole("main").getByRole("link", { name: "Go to your clients" })).toHaveAttribute("href", "/dashboard");
});

test("each sign-in form has a quiet way to the other, and a new agent's first screen asks only who they are", async ({ page }) => {
  // The plain form: an agent's is one tap away.
  await page.goto("/login?next=%2Fsearch");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Sign in or sign up");
  const toAgent = main.getByRole("link", { name: "I'm an agent" });
  expect((await toAgent.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await toAgent.click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Start free as an agent");
  await expect(page).toHaveURL(/\/login\?as=agent$/);

  // The agent's form: back to the plain one, to the page they were going to.
  await page.goto("/login?as=agent&next=%2Fsearch");
  const toBuyer = main.getByRole("link", { name: "Not an agent?" });
  expect((await toBuyer.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(toBuyer).toHaveAttribute("href", "/login?next=%2Fsearch");
  await page.goto("/login?as=agent");
  await expect(main.getByRole("link", { name: "Not an agent?" })).toHaveAttribute("href", "/login");
  await expect(main.getByRole("link", { name: "I'm an agent" })).toHaveCount(0);

  // Signed up as an agent: one question a screen, the first what they are
  // (the pros first), then their name, alone on its screen.
  await page.getByLabel("Email").fill("fay-firstrun@example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await enterCode(page);
  await page.waitForURL("**/welcome?as=agent");
  await expect(page).toHaveTitle("Welcome · Porchcard");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("What brings you to Porchcard?");
  await expect(main.getByRole("textbox")).toHaveCount(0);
  // No tabs to places that would only send them back here.
  await expect(page.getByRole("navigation", { name: "Clients" })).toHaveCount(0);
  await main.getByRole("button", { name: /^I'm an agent/ }).click();
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("What's your full name?");
  await expect(main.getByRole("textbox")).toHaveCount(1);
  await expect(main.getByRole("textbox", { name: "Full name" })).toBeFocused();
  await main.getByRole("textbox", { name: "Full name" }).fill("Fay Firstrun");
  await main.getByRole("button", { name: "Continue" }).click();
  // The rest may each be skipped (the color has one picked already), and
  // nothing about phones on the way: those are on Edit profile.
  for (const heading of ["Where are you located?", "What brokerage are you with?", "What's your MLS ID?", "Add a photo of you"]) {
    await expect(main.getByRole("heading", { level: 1 })).toHaveText(heading);
    await main.getByRole("button", { name: "Skip" }).click();
  }
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Pick your color");
  await main.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL("**/dashboard");

  // What wasn't asked is in Edit profile, empty, for when they want it.
  await toDetails(page);
  for (const label of ["Phone for clients (optional)", "Email for clients (optional)", "MLS ID (optional)"]) {
    await expect(detailsForm(page).getByLabel(label)).toHaveValue("");
  }
});
