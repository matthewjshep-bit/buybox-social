// Someone's page, for whoever shares links with them: what's between the two
// of them comes first. And anyone's own page: a few words about themselves,
// and (an agent) a few links.
import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, signedIn, signInAgent, signUpBuyer } from "./helpers";

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
  await agent.getByRole("button", { name: "Add a description and links" }).click();
  const form = agent.getByRole("form", { name: "Edit about you" });
  await form.getByRole("textbox", { name: "About you", exact: true }).fill("Eastside homes, first-time buyers.");
  await form.getByLabel("Link 1 name").fill("Our office");
  await form.getByLabel("Link 1 address").fill("not a web address");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByRole("alert")).toContainText("doesn't look like a web address");
  await form.getByLabel("Link 1 address").fill("tara-homes.example.com");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  const header = agent.getByRole("region", { name: "Tara (you)" });
  await expect(header).toContainText("Eastside homes, first-time buyers.");
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
  // Above everything else Tara has done.
  const filters = juno.getByRole("navigation", { name: "Show" });
  expect((await between.boundingBox())!.y).toBeLessThan((await filters.boundingBox())!.y);
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
  await expect(stranger.getByRole("heading", { level: 1 })).toHaveText("Tara");
  await expect(stranger.getByRole("region", { name: /^Between you and / })).toHaveCount(0);
});

test("a buyer writes a few words about themselves, and has no links to add", async ({ browser }) => {
  const page = await signUpBuyer(browser, "bea.about@example.com", "Bea About");
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  await page.getByRole("button", { name: "Add a few words about yourself" }).click();
  const form = page.getByRole("form", { name: "Edit about you" });
  await expect(form.getByRole("group", { name: "Links" })).toHaveCount(0);
  await form.getByRole("textbox", { name: "About you", exact: true }).fill("Looking for a craftsman near a park.");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("Looking for a craftsman near a park.");
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});
