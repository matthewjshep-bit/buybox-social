// Someone's page, for whoever shares links with them: what's between the two
// of them comes first. And anyone's own page: a few words about themselves,
// and (an agent) a few links.
import { expect, test } from "@playwright/test";
import { createShare, detailsForm, heartOf, homeIn, saveDetails, signedIn, signInAgent, signUpBuyer } from "./helpers";

const CORBEL = "812 N Corbel St";

test("an agent's page leads with what's between them and their client, and says what they wrote about themselves", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const agent = await signInAgent(browser, "tara.about@example.com", "Tara About");
  const { urls, dashboardUrl } = await createShare(agent, ["812 N Corbel"], ["Juno"]);

  // Tara writes about herself, with her brokerage's site; a link that isn't one is refused.
  await agent.goto("/people/me");
  await agent.waitForURL(/\/people\/[\w-]+$/);
  const taraPage = new URL(agent.url()).pathname;
  await agent.getByRole("link", { name: "Edit profile" }).click();
  await agent.waitForURL(/\/people\/me\/edit$/);
  const form = agent.getByRole("form", { name: "Edit about you" });
  await form.getByRole("textbox", { name: "About you", exact: true }).fill("Eastside homes, first-time buyers.");
  await form.getByLabel("Link 1 name").fill("Our office");
  await form.getByLabel("Link 1 address").fill("not a web address");
  // (Her name is among her details: she has no "Your name" card of its own.)
  await expect(agent.getByRole("form", { name: "Your name" })).toHaveCount(0);
  // She's changed her company too, in the card above, and not saved it yet.
  const company = detailsForm(agent).getByLabel("Company (optional)");
  await company.fill("Tara Homes");
  const saveAbout = form.getByRole("button", { name: "Save about", exact: true });
  await saveAbout.click();
  await expect(form.getByRole("alert")).toContainText("doesn't look like a web address");
  await expect(form.getByRole("status")).toHaveCount(0);
  await form.getByLabel("Link 1 address").fill("tara-homes.example.com");
  await saveAbout.click();
  // Saved there: the page stays put and says so, the way "Save details"
  // does, so what she typed in the card above isn't lost. No Cancel: the way
  // back is at the top of the page.
  await expect(form.getByRole("status")).toHaveText("Saved");
  await expect(agent).toHaveURL(/\/people\/me\/edit$/);
  await expect(form.getByRole("link", { name: "Cancel" })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Cancel" })).toHaveCount(0);
  await expect(company).toHaveValue("Tara Homes");
  // Both buttons say what they save, in the one colour (the site's blue),
  // whatever colour she picked for her brand.
  const saveHers = detailsForm(agent).getByRole("button", { name: "Save details", exact: true });
  const blue = "rgb(36, 115, 188)";
  // (The pointer is still on the one just pressed, which lightens it.)
  await agent.mouse.move(0, 0);
  await expect(saveAbout).toHaveCSS("background-color", blue);
  await expect(saveHers).toHaveCSS("background-color", blue);
  await saveDetails(agent);
  // Changed again, it no longer says it's saved.
  await form.getByRole("textbox", { name: "About you", exact: true }).pressSequentially(" ");
  await expect(form.getByRole("status")).toHaveCount(0);
  // Back to her page, which says all of it.
  await agent.getByRole("link", { name: "Your profile" }).click();
  await agent.waitForURL(new RegExp(`${taraPage}$`));
  const header = agent.getByRole("region", { name: "Tara About (you)" });
  await expect(header).toContainText("Eastside homes, first-time buyers.");
  await expect(header).toContainText("Tara Homes");
  await expect(header.getByRole("link", { name: "Our office" })).toHaveAttribute("href", "https://tara-homes.example.com/");

  // Juno, signed in, on her link, likes the home; Tara answers her there.
  const juno = await signedIn(browser);
  await juno.goto(urls.Juno);
  const home = homeIn(juno, CORBEL);
  await home.scrollIntoViewIfNeeded();
  await heartOf(home).click();
  await expect(heartOf(home)).toHaveAttribute("aria-pressed", "true");
  await agent.goto(`${dashboardUrl}?tab=homes`);
  const panel = agent.getByRole("region", { name: CORBEL });
  await panel.getByLabel("Reply to your client").fill("Glad you like it. Want to see it Friday?");
  await panel.getByRole("button", { name: "Reply" }).click();
  await expect(panel.getByText("Glad you like it. Want to see it Friday?")).toBeVisible();

  // On Tara's page, the first thing Juno sees is what's between them: the
  // home Tara sent her, opening her own link, and what Tara said there.
  await juno.goto(taraPage);
  const between = juno.getByRole("region", { name: "Between you and Tara" });
  await expect(between).toBeVisible();
  await expect(between).toContainText("1 home Tara sent you");
  await expect(between).toContainText("Tara: “Glad you like it. Want to see it Friday?”");
  await expect(between.getByRole("link")).toHaveAttribute("href", new URL(urls.Juno).pathname);
  // First, right there as the page opens.
  await expect(between).toBeInViewport();
  // Her answer to Juno stays on the link: never on Tara's page.
  await expect(juno.locator("[data-card-link]")).toHaveCount(0);
  // And what Tara wrote about herself.
  await expect(juno.getByRole("main")).toContainText("Eastside homes, first-time buyers.");

  // Tara, on Juno's page: the same, the other way round.
  await juno.goto("/people/me");
  await juno.waitForURL(/\/people\/[\w-]+$/);
  await agent.goto(new URL(juno.url()).pathname);
  const back = agent.getByRole("region", { name: /^Between you and / });
  await expect(back).toContainText(/You sent \w+ 1 home/);
  await expect(back.getByRole("link")).toHaveAttribute("href", new URL(dashboardUrl).pathname);

  // Someone with nothing between them sees no such thing.
  const stranger = await signUpBuyer(browser, "stan.about@example.com", "Stan About");
  await stranger.goto(taraPage);
  await expect(stranger.getByRole("heading", { level: 1 })).toHaveText("Tara About");
  await expect(stranger.getByRole("region", { name: /^Between you and / })).toHaveCount(0);
});

test("a buyer writes a few words about themselves, and has no links to add", async ({ browser }) => {
  const page = await signUpBuyer(browser, "bea.about@example.com", "Bea About");
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  await page.getByRole("link", { name: "Edit profile" }).click();
  await page.waitForURL(/\/people\/me\/edit$/);
  const form = page.getByRole("form", { name: "Edit about you" });
  await expect(form.getByRole("group", { name: "Links" })).toHaveCount(0);
  await form.getByRole("textbox", { name: "About you", exact: true }).fill("Looking for a craftsman near a park.");
  // Saved there, like their name in the card above: the page stays put and
  // says so (leaving would lose a name typed and not saved yet).
  await form.getByRole("button", { name: "Save about", exact: true }).click();
  await expect(form.getByRole("status")).toHaveText("Saved");
  await expect(page).toHaveURL(/\/people\/me\/edit$/);
  await page.getByRole("link", { name: "Your profile" }).click();
  await page.waitForURL(/\/people\/[\w-]+$/);
  await expect(page.getByRole("main")).toContainText("Looking for a craftsman near a park.");
});

test("a buyer changes their name on Edit profile; everyone else still sees only the first of it", async ({ browser }) => {
  const page = await signUpBuyer(browser, "una.today@example.com", "Una Today");
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  const unaPage = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Una (you)");
  await page.getByRole("link", { name: "Edit profile" }).click();
  await page.waitForURL(/\/people\/me\/edit$/);

  // A card of its own: the name as she gave it, and what people see of it.
  const card = page.getByRole("region", { name: "Your name" });
  const form = card.getByRole("form", { name: "Your name" });
  const name = form.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("Una Today");
  await expect(form).toContainText("People see your first name only.");
  const save = form.getByRole("button", { name: "Save name", exact: true });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await name.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // [P] Never an email for a name: it would show whole.
  await name.fill("una.today@example.com");
  await save.click();
  await expect(form.getByRole("alert")).toHaveText("Type a first name, not an email");
  await expect(form.getByRole("status")).toHaveCount(0);

  // Saved there: the page stays put and says so.
  await name.fill("Uma Today");
  await save.click();
  await expect(form.getByRole("status")).toHaveText("Saved");
  await expect(form.getByRole("alert")).toHaveCount(0);
  await expect(page).toHaveURL(/\/people\/me\/edit$/);
  // Still there when the page is opened again.
  await page.reload();
  await expect(name).toHaveValue("Uma Today");

  // Her profile says Uma, to her and to anyone else, and never her surname.
  await page.getByRole("link", { name: "Your profile" }).click();
  await page.waitForURL(new RegExp(`${unaPage}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Uma (you)");
  await expect(page.getByRole("region", { name: "Uma (you)" })).not.toContainText("Today");
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(unaPage);
  await expect(anon.getByRole("heading", { level: 1 })).toHaveText("Uma");
  await expect(anon.getByRole("main")).not.toContainText("Today");
  await expect(anon.getByRole("main")).not.toContainText("Una");

  // And so does her card on Home (beside the feed, on a wide screen).
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const you = page.getByRole("region", { name: "You", exact: true });
  await expect(you.getByRole("link", { name: "Uma", exact: true })).toBeVisible();
  await expect(you).not.toContainText("Today");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hi, Uma");
});
