import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createShare, heartOf, homeIn, openComments, openMore, signInAgent } from "./helpers";

const emailsTo = (address: string) =>
  readFileSync("test-results-server.log", "utf8")
    .split("\n")
    .filter((line) => line.includes(`[email] to=${address} `));

// The page's next word to the server (a server action), answered: a link
// saying it's been opened, or the agent's page saying it's been seen.
const actionAnswered = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

test("an agent's phone and email for clients: checked, kept as digits, and never the login email", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const agent = await signInAgent(browser, "casey-contact@example.com", "Casey Agent");
  await agent.goto("/dashboard/profile");
  // (Next's route announcer is an alert too.)
  const alert = agent.locator("form").getByRole("alert");
  const phone = agent.getByLabel("Phone for clients (optional)");
  const email = agent.getByLabel("Email for clients (optional)");
  // Nothing shows on links until they type it: never their login email.
  await expect(phone).toHaveValue("");
  await expect(email).toHaveValue("");

  // A number without its area code says so, under the field, and saves nothing.
  await phone.fill("555-0142");
  await agent.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText("Please enter a phone number with the area code, or leave it empty.");
  await expect(phone).toHaveAttribute("aria-invalid", "true");
  await expect(phone).toHaveValue("555-0142");
  await expect(agent).toHaveURL(/\/dashboard\/profile$/);

  // So does an address that can't be one, even with a good phone beside it.
  await phone.fill("(206) 555-0142");
  await email.fill("casey@nowhere");
  await agent.getByRole("button", { name: "Save" }).click();
  await expect(alert).toHaveText("Please enter a valid email address, or leave it empty.");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveValue("casey@nowhere");
  await agent.reload();
  await expect(phone).toHaveValue("");
  await expect(email).toHaveValue("");

  // Both good: saved, and shown back as a phone number.
  await phone.fill("(206) 555-0142");
  await email.fill("Casey@Harborpine.example");
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
  await agent.goto("/dashboard/profile");
  await expect(phone).toHaveValue("(206) 555-0142");
  await expect(email).toHaveValue("casey@harborpine.example");

  // Kept as digits: that's all the link's call button is made of.
  const { url } = await createShare(agent, ["96 Fernhollow"], ["Robin"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  await expect(homeIn(client, "96 Fernhollow Ln")).toBeInViewport({ ratio: 0.9 });
  await client.getByRole("button", { name: "Contact" }).click();
  const contact = client.getByRole("dialog", { name: "Contact Casey Agent" });
  await expect(contact.getByRole("link", { name: "Call Casey" })).toHaveAttribute("href", "tel:2065550142");
  await expect(contact.getByRole("link", { name: "Email Casey" })).toHaveAttribute(
    "href",
    /^mailto:casey@harborpine\.example\?subject=/,
  );

  // Cleared, they're gone from the link.
  await agent.goto("/dashboard/profile");
  await phone.fill("");
  await email.fill("");
  await agent.getByRole("button", { name: "Save" }).click();
  await agent.waitForURL(/\/dashboard$/);
  await client.reload();
  await client.getByRole("button", { name: "Contact" }).click();
  await expect(contact).toBeVisible();
  await expect(contact.getByRole("link")).toHaveCount(0);
  await expect(contact.getByRole("button", { name: "Ask to see it" })).toBeVisible();
});

test("a home that's gone from the listings can't go on a new link, and nothing is made", async ({ browser }) => {
  const agent = await signInAgent(browser, "gone-agent@example.com", "Gale Agent");
  await agent.goto("/dashboard/new");
  await agent.getByRole("button", { name: /812 N Corbel/ }).click();
  await agent.getByLabel("Person 1's first name").fill("Zuri");
  // The home goes between picking it and creating the link. Every sample home is
  // for sale and a test can't reach the database to mark one sold, so this asks
  // for a key that isn't listed: it checks the refusal and that no link is made.
  // The "for sale" (Active) check itself is read in createShare until C1 adds a
  // sold sample to point this at.
  await agent.route("**/dashboard/new", async (route) => {
    const body = route.request().postData();
    if (route.request().method() !== "POST" || !body?.includes("SAMPLE-1003")) return route.continue();
    await route.continue({ postData: body.replace("SAMPLE-1003", "SAMPLE-SOLD") });
  });
  await agent.getByRole("button", { name: /Create link/ }).click();
  await expect(agent.getByText("One of those homes is no longer available.")).toHaveAttribute("role", "alert");
  await expect(agent).toHaveURL(/\/dashboard\/new$/);
  await agent.unroute("**/dashboard/new");

  // No link was made.
  await agent.goto("/dashboard");
  await expect(agent.getByRole("link", { name: /Zuri/ })).toHaveCount(0);
});

test("the dashboard leads with what's new, and says when each link was opened, never counting the agent", async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const agent = await signInAgent(browser, "olive-opens@example.com", "Olive Opens");
  const { url } = await createShare(agent, ["88 Heron Bluff", "719 Saltmarsh"], ["Owen"]);
  const row = agent.getByRole("region", { name: "Links you've sent" }).getByRole("link", { name: /Owen/ });
  const news = agent.getByRole("region", { name: "What's new" });

  // Sent, and nothing since.
  await agent.goto("/dashboard");
  await expect(row).toContainText("Not opened yet");
  await expect(row.getByRole("listitem").filter({ hasText: "88 Heron Bluff Rd" })).toBeVisible();
  // Said once for the link, not under every home.
  await expect(row.getByText("No reactions yet")).toHaveCount(1);
  await expect(row).not.toHaveAccessibleName(/new since you last looked/);
  await expect(news).toContainText("Nothing yet.");

  // The agent looking at their own link doesn't count as it being opened.
  await Promise.all([actionAnswered(agent), agent.goto(url)]);
  await agent.goto("/dashboard");
  await expect(row).toContainText("Not opened yet");

  // Owen opens it: the agent sees when, and hears about it.
  const owen = await (await browser.newContext()).newPage();
  await Promise.all([actionAnswered(owen), owen.goto(url)]);
  await agent.reload();
  await expect(row).toContainText(/Opened (yesterday, )?\d{1,2}:\d{2} [ap]m/);
  await expect(row).not.toContainText("Not opened yet");
  await expect.poll(() => emailsTo("olive-opens@example.com").length).toBe(1);
  expect(emailsTo("olive-opens@example.com")[0]).toContain("Owen opened your link to 2 homes");

  // [P] Opens are for the agent only: the link never says it was seen.
  await expect(owen.getByText(/opened/i)).toHaveCount(0);
  expect(await (await request.get(url)).text()).not.toMatch(/opened/i);

  // Owen likes one home, passes on the other, and says something. Opening it
  // didn't hold back the email about the first of those.
  const heron = homeIn(owen, "88 Heron Bluff Rd");
  await heartOf(heron).click();
  await expect(heartOf(heron)).toHaveAttribute("aria-pressed", "true");
  const more = await openMore(owen, homeIn(owen, "719 Saltmarsh Ln"));
  await more.getByRole("button", { name: "Not for me" }).click();
  await expect(more.getByRole("button", { name: "Not for me" })).toHaveAttribute("aria-pressed", "true");
  await owen.keyboard.press("Escape");
  const chat = await openComments(owen, heron);
  await chat.getByLabel("Add a comment").fill("Love the porch.");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  // The box empties once it's saved (its own text would match before then).
  await expect(chat.getByLabel("Add a comment")).toHaveValue("");
  await expect(chat.getByText("Love the porch.")).toBeVisible();
  await expect.poll(() => emailsTo("olive-opens@example.com").length).toBe(2);
  expect(emailsTo("olive-opens@example.com")[1]).toContain("Owen liked this at 88 Heron Bluff Rd");

  // One load of the dashboard has all of it: what's new first, a verdict on
  // each home, when it was last busy, and a mark that there's something new.
  await agent.goto("/dashboard");
  const said = news.getByRole("link", { name: /^Owen commented: “Love the porch\.”/ });
  await expect(said).toBeVisible();
  await expect(news.getByRole("link", { name: /^Owen liked this home/ })).toBeVisible();
  await expect(news.getByRole("link", { name: /^Owen passed on this home/ })).toBeVisible();
  await expect(row.getByRole("listitem").filter({ hasText: "88 Heron Bluff Rd" })).toContainText("1 liked");
  await expect(row.getByRole("listitem").filter({ hasText: "719 Saltmarsh Ln" })).toContainText("1 passed");
  await expect(row).toContainText("1 comment");
  await expect(row).toContainText(/Last activity (just now|\d+m ago)/);
  await expect(row).toHaveAccessibleName(/new since you last looked/);

  // Each item opens the thread it came from, marking for a moment which
  // comment it was, and seeing it there clears the mark.
  const marked = agent.waitForSelector("li[data-target]");
  await Promise.all([actionAnswered(agent), said.click()]);
  await expect(agent).toHaveURL(/\/dashboard\/shares\/[\w-]+#comment-[\w-]+$/);
  await expect(agent.getByText("Love the porch.")).toBeInViewport();
  expect(await (await marked).textContent()).toContain("Love the porch.");
  await expect(agent.getByText(/^Owen opened it (at |yesterday, )\d/)).toBeVisible();
  await agent.goto("/dashboard");
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAccessibleName(/new since you last looked/);

  // Opening it again soon after, or doing more, sends no more email.
  await Promise.all([actionAnswered(owen), owen.reload()]);
  await expect(owen.getByRole("heading", { level: 1 })).toHaveText("Owen, I picked these 2 homes for you");
  await owen.waitForTimeout(1000);
  expect(emailsTo("olive-opens@example.com")).toHaveLength(2);
});
