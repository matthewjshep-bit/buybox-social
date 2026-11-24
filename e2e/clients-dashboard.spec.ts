// The agent's clients, as Messages shows them: one conversation per person
// (a link to nobody yet is a conversation of its own, named for its home),
// newest first, each a row with their name, one line about where things
// stand, "Waiting" while they're waiting on the agent, and marked new until
// the agent looks. A person's conversation has every home sent them as a card
// with what they did under it, Reply under each home, a box to write in, and
// the way to send them more homes on the link they have. The old Clients
// address leads here.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createShare, homeIn, joinAs, pickHome, signInAgent, threadHome, threadRow, toFirstHome } from "./helpers";

const QUILLAN = "1204 Quillan St SE";

const emailsTo = (address: string) =>
  readFileSync("test-results-server.log", "utf8")
    .split("\n")
    .filter((line) => line.includes(`[email] to=${address} `));

test("whoever wants a showing is waiting on Messages, with Reply under the home, until the agent answers", async ({ browser }) => {
  test.setTimeout(120_000);
  const fern = await signInAgent(browser, "fern.clients@example.com", "Fern Clients");
  const { urls, dashboardUrl } = await createShare(fern, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);
  const sharePath = new URL(dashboardUrl).pathname;
  const shareId = sharePath.split("/").pop()!;
  // Someone else who hasn't opened theirs, and a link with nobody on it yet.
  await createShare(fern, ["10421 Halvard"], ["Max"]);
  await createShare(fern, ["96 Fernhollow"], []);
  const joEmail = `jo.clients.${Date.now()}@example.com`;

  // Jo asks to see the first home, from Contact: signing up as she does.
  const jo = await (await browser.newContext()).newPage();
  await jo.goto(urls.Jo);
  await toFirstHome(jo);
  await expect(homeIn(jo, QUILLAN)).toBeInViewport({ ratio: 0.9 });
  await jo.getByRole("button", { name: "Contact" }).click();
  const contact = jo.getByRole("dialog", { name: /^Contact / });
  await contact.getByRole("button", { name: "Ask to see it" }).click();
  await joinAs(jo, "Jo", joEmail);
  await expect(contact.getByRole("status")).toHaveText(/^Sent\./);

  // Fern's Messages (where Clients used to be): Jo first, what she wants on
  // her line, Waiting, and new since Fern last looked; Max, not opened yet,
  // neither; the link with nobody on it a conversation of its own, named
  // for its home, never "Unnamed client".
  await fern.goto("/dashboard");
  await fern.waitForURL(/\/messages$/);
  await expect(fern).toHaveTitle("Messages · Porchcard");
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Messages");
  await expect(fern.getByRole("link", { name: "Send homes" })).toHaveAttribute("href", "/dashboard/new");
  const rows = fern.getByRole("list", { name: "Conversations" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Jo");
  const row = threadRow(fern, "Jo");
  await expect(row).toContainText(/Wants to see 1204 Quillan St SE\s*·\s*today/);
  await expect(row.getByText("Waiting", { exact: true })).toBeVisible();
  await expect(row.getByText("New", { exact: true })).toBeVisible();
  await expect(threadRow(fern, "Max")).toContainText(/Not opened yet\s*·\s*today/);
  await expect(threadRow(fern, "Max").getByText("Waiting", { exact: true })).toHaveCount(0);
  await expect(threadRow(fern, "Max").getByText("New", { exact: true })).toHaveCount(0);
  await expect(threadRow(fern, "Link for 96 Fernhollow Ln")).toContainText(/Not opened yet\s*·\s*today/);
  await expect(fern.getByText("Unnamed client")).toHaveCount(0);
  // [P] First names only: her email is nowhere on the page.
  expect(await fern.content()).not.toContain(joEmail);
  // Each row is a fingertip tall.
  for (const link of await rows.getByRole("link").all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  // Her conversation: named for her, her name the way to her public page
  // (she's signed up); the send, each home a card, what she asked across the
  // first one's, with her words under it.
  await row.getByRole("link").click();
  await fern.waitForURL(/\/messages\/.+/);
  const joPage = new URL(fern.url()).pathname;
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Jo");
  await expect(fern.getByRole("heading", { level: 1 }).getByRole("link", { name: "Jo" })).toHaveAttribute(
    "href",
    /^\/people\/[\w-]+$/,
  );
  await expect(fern.getByRole("link", { name: "Back to messages" })).toHaveAttribute("href", "/messages");
  const thread = fern.getByRole("list", { name: "Messages" });
  await expect(thread.locator("li[id^='send-']")).toHaveCount(1);
  await expect(thread).toContainText("You sent 2 homes");
  const quillan = threadHome(fern, QUILLAN);
  await expect(quillan).toContainText("Jo asked to see it · today");
  await expect(quillan).toContainText("Can we see it in person?");
  await expect(threadHome(fern, "719 Saltmarsh Ln")).not.toContainText("asked");
  // [P] Her email isn't here either.
  expect(await fern.content()).not.toContain(joEmail);

  // One box to write in, at the foot; Reply under a home points it at that
  // home, and says so, with a way to let go of it.
  const box = fern.getByRole("textbox", { name: "Message" });
  await expect(box).toHaveCount(1);
  await quillan.getByRole("button", { name: `Reply about ${QUILLAN}` }).click();
  await expect(fern.getByRole("textbox", { name: `Reply about ${QUILLAN}` })).toBeFocused();
  await expect(fern.getByText("Replying about 1204 Quillan")).toBeVisible();
  await expect(fern.getByRole("textbox", { name: /^(Message|Reply about)/ })).toHaveCount(1);
  await fern.getByRole("button", { name: "Reply to the conversation instead" }).click();
  await expect(box).toBeVisible();
  // The link's own page is a tap from the top; sending her more goes onto
  // the link she has.
  await expect(fern.getByRole("link", { name: "Link details" })).toHaveAttribute("href", sharePath);
  await expect(fern.getByRole("link", { name: "Send homes" })).toHaveAttribute("href", `/dashboard/new?share=${shareId}`);

  // "Send homes" remembers her: it adds to the link she has, and then it's
  // that link again, ready to copy or send. She's on Porchcard, so she hears
  // about the new home from us too.
  await fern.getByRole("link", { name: "Send homes" }).click();
  await expect(fern.getByRole("heading", { name: "Add homes for Jo" })).toBeVisible();
  await expect(fern).toHaveTitle("Send homes · Porchcard");
  await pickHome(fern, "812 N Corbel");
  await fern.getByRole("button", { name: "Add 1 home to Jo's link" }).click();
  await fern.waitForURL(new RegExp(`^[^?#]*${sharePath}/sent$`));
  await expect(fern.getByRole("heading", { level: 1 })).toHaveText("Your link is ready");
  await expect(fern.getByRole("main")).toContainText("3 homes · for Jo");
  await expect(fern.getByLabel("Jo's link")).toHaveValue(urls.Jo);
  await expect.poll(() => emailsTo(joEmail).length).toBe(1);
  expect(emailsTo(joEmail)[0]).toContain('subject="Fern Clients sent you 1 more home on Porchcard"');
  // No second link was made: she still has the one, now with three homes,
  // one send in her conversation.
  await fern.goto(joPage);
  await expect(thread.locator("li[id^='send-']")).toHaveCount(1);
  await expect(thread).toContainText("You sent 3 homes");
  await expect(thread.locator("li[id^='home-']")).toHaveCount(3);
  await fern.getByRole("link", { name: "Back to messages" }).click();
  await fern.waitForURL(/\/messages$/);

  // Fern answers about that home, in the conversation: it lands under the
  // home as her words, and nobody is waiting any more.
  await fern.goto(joPage);
  await quillan.getByRole("button", { name: `Reply about ${QUILLAN}` }).click();
  await fern.getByRole("textbox", { name: `Reply about ${QUILLAN}` }).fill("Saturday at 10 works.");
  await fern.getByRole("button", { name: "Send", exact: true }).click();
  const said = quillan.getByRole("list", { name: `Comments on ${QUILLAN}` });
  await expect(said).toContainText("Saturday at 10 works.");
  await expect(said.getByText("You", { exact: true })).toBeVisible();
  await expect(box).toHaveValue("");
  await fern.goto("/messages");
  await expect(row.getByText("Waiting", { exact: true })).toHaveCount(0);
  await expect(row).not.toContainText("Wants to see");
  await expect(row.getByText("New", { exact: true })).toHaveCount(0);

  // Her link's page has the answer in that home's thread too.
  await fern.goto(`${sharePath}?tab=homes`);
  await expect(fern.getByRole("region", { name: QUILLAN })).toContainText("Saturday at 10 works.");
});
