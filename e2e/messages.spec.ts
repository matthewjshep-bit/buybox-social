// Messages: every home someone sent or was sent, as conversations, one per
// person (a link to several people is one of its own). In a thread each send
// is a message: the homes, each with what's happened to it under it; a word
// about nothing in particular is a bubble of its own. The sender sees opens
// and passes; whoever was sent the homes sees their own take and the
// sender's words, never other people's passes. Opening a conversation is
// having seen it, on either side.
import { expect, test } from "@playwright/test";
import { createShare, expectPassed, heartOf, homeIn, joinAs, namelessLink, openComments, pass, signInAgent, signUpBuyer, threadComment } from "./helpers";

const QUILLAN = "1204 Quillan St SE";
const SALTMARSH = "719 Saltmarsh Ln";
const CORBEL = "812 N Corbel St";

test("an agent's Messages: one thread per person and one per group link, the homes as cards with what happened to them; the same for whoever was sent them", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const agent = await signInAgent(browser, "lena-messages@example.com", "Lena Messages");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Jo"]);
  await createShare(agent, ["812 N Corbel"], ["Ravi", "Mia"]);

  // Jo signs up on her link, likes one home, passes on the other, and says something.
  const jo = await (await browser.newContext()).newPage();
  await jo.addInitScript(() => localStorage.setItem("buybox:nudges", JSON.stringify({ photos: true, next: true })));
  await jo.goto(url);
  const quillan = homeIn(jo, QUILLAN);
  await heartOf(quillan).click();
  await joinAs(jo, "Jo", "jo.messages@example.com");
  await expect(heartOf(quillan)).toHaveAttribute("aria-pressed", "true");
  const chat = await openComments(jo, quillan);
  await chat.getByLabel("Add a comment").fill("Is the basement finished?");
  await chat.getByRole("button", { name: "Post", exact: true }).click();
  await expect(chat).toContainText("Is the basement finished?");
  await jo.keyboard.press("Escape");
  await pass(jo, homeIn(jo, SALTMARSH));
  await expectPassed(jo, homeIn(jo, SALTMARSH));
  // Signed in on her link, Contact has a way into that conversation (Lena shows no phone or email).
  await jo.getByRole("banner").getByRole("button", { name: "Contact" }).click();
  const contact = jo.getByRole("dialog", { name: "Contact Lena Messages" });
  await expect(contact.getByRole("link", { name: "Message Lena" })).toHaveAttribute("href", /^\/messages\/acct%3A/);
  await jo.keyboard.press("Escape");
  await expect(contact).toBeHidden();

  // The bar: Messages for everyone, with how many conversations have something new.
  await agent.setViewportSize({ width: 390, height: 844 });
  await agent.goto("/");
  const bar = agent.getByRole("banner");
  await expect(bar.getByRole("link", { name: /^Messages, \d+ new$/ })).toHaveAttribute("href", "/messages");
  await bar.getByRole("link", { name: /^Messages/ }).click();
  await agent.waitForURL(/\/messages$/);

  // The list: Jo (waiting for an answer, something new), and the link for
  // Ravi & Mia as one conversation; the way to send homes.
  const list = agent.getByRole("list", { name: "Conversations" });
  const joRow = list.getByRole("link", { name: /^Jo\b/ });
  await expect(joRow).toContainText("Is the basement finished?");
  await expect(joRow).toContainText("Waiting");
  await expect(joRow).toContainText("New");
  const group = list.getByRole("link", { name: /^Ravi & Mia/ });
  await expect(group).toContainText("Not opened yet");
  await expect(agent.getByRole("link", { name: "Send homes" })).toHaveAttribute("href", "/send?aud=someone");
  // On a phone the list is the page; nothing of a conversation beside it
  // (not even the newest, which a wide screen opens by itself).
  await expect(agent.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  await expect(agent.getByRole("region", { name: "Conversation", exact: true })).toBeHidden();
  await expect(agent.getByRole("heading", { level: 1, name: "Jo" })).toBeHidden();

  // Jo's thread: the send as a message, each home a card with what happened;
  // what she said about a home is a message of its own under the cards,
  // quoting the home, with her name (not inside the card).
  await joRow.click();
  await agent.waitForURL(/\/messages\/acct%3A/);
  await expect(agent.getByRole("heading", { level: 1, name: "Jo" })).toBeVisible();
  await expect(agent.getByRole("link", { name: "Back to messages" })).toHaveAttribute("href", "/messages");
  const sends = agent.getByRole("list", { name: "Messages" });
  await expect(sends).toContainText("You sent 2 homes");
  const quillanKey = (await quillan.getAttribute("data-home"))!;
  const first = sends.locator(`[id="home-${quillanKey}"]`);
  await expect(first).toContainText(QUILLAN);
  await expect(first).toContainText("Opened");
  await expect(first).toContainText("Jo liked it");
  await expect(first).not.toContainText(/comment/i);
  await expect(first).not.toContainText("Is the basement finished?");
  const asked = threadComment(agent, QUILLAN, "Is the basement finished?");
  await expect(asked).toContainText("Jo");
  await expect(asked.getByRole("link", { name: new RegExp(`About ${QUILLAN}`) })).toHaveAttribute("href", `#home-${quillanKey}`);
  const second = sends.locator("li").filter({ hasText: SALTMARSH }).first();
  await expect(second).toContainText("Jo passed");
  // The card opens the home: the agent's pop-out over the page.
  await expect(first.getByRole("link", { name: new RegExp(QUILLAN) })).toHaveAttribute("href", /^\/reel\?from=share%3A/);
  // Sending more homes adds to her link.
  await expect(agent.getByRole("link", { name: "Send homes" })).toHaveAttribute("href", /^\/send\?to=acct%3A/);

  // Reply under the home: the box answers in that home's thread; what's
  // said lands as the agent's own message quoting the home (no name on
  // their own, as on a phone), and on Jo's link.
  const reply = first.getByRole("button", { name: `Reply about ${QUILLAN}` });
  expect((await reply.boundingBox())!.height, "Reply on a home's card is a tap target").toBeGreaterThanOrEqual(44);
  await reply.click();
  const replyBox = agent.getByRole("textbox", { name: `Reply about ${QUILLAN}` });
  await expect(replyBox).toBeFocused();
  await replyBox.fill("Yes, it was finished in 2019.");
  await replyBox.press("Enter");
  const answer = threadComment(agent, QUILLAN, "Yes, it was finished in 2019.");
  await expect(answer).toBeVisible();
  await expect(answer).not.toContainText("Jo");
  await expect(first).not.toContainText("Yes, it was finished in 2019.");
  // Then a word to the conversation itself.
  const box = agent.getByRole("textbox", { name: "Message", exact: true });
  await box.fill("More coming Friday!");
  await box.press("Enter");
  await expect(sends).toContainText("More coming Friday!");
  await expect(box).toHaveValue("");
  // Opened and answered, it's no longer new.
  await agent.goto("/messages");
  await expect(list.getByRole("link", { name: /^Jo\b/ })).not.toContainText("New");
  await expect(list.getByRole("link", { name: /^Jo\b/ })).not.toContainText("Waiting");

  // Wide: both at once, the list down the left and the conversation beside
  // it. Nothing picked, Messages opens on the newest conversation (Jo's,
  // just written to) by itself, at its own address still, that row shown
  // but not marked as the page.
  await agent.setViewportSize({ width: 1280, height: 900 });
  await agent.goto("/messages");
  const pane = agent.getByRole("region", { name: "Conversation", exact: true });
  await expect(pane.getByRole("heading", { level: 2, name: "Jo" })).toBeVisible();
  await expect(pane.getByRole("list", { name: "Messages" })).toContainText("More coming Friday!");
  expect(new URL(agent.url()).pathname).toBe("/messages");
  await expect(list.getByRole("link", { name: /^Jo\b/ })).not.toHaveAttribute("aria-current", "page");
  await expect(agent.getByText("Pick a conversation.")).toHaveCount(0);
  await list.getByRole("link", { name: /^Ravi & Mia/ }).click();
  await agent.waitForURL(/\/messages\/link%3A/);
  await expect(agent.getByRole("heading", { level: 1, name: "Ravi & Mia" })).toBeVisible();
  await expect(list.getByRole("link", { name: /^Ravi & Mia/ })).toHaveAttribute("aria-current", "page");
  await expect(agent.getByRole("link", { name: "Back to messages" })).toBeHidden();
  await expect(agent.getByRole("list", { name: "Messages" })).toContainText(CORBEL);
  await expect(agent.getByRole("list", { name: "Messages" })).toContainText("Not opened yet");

  // Jo's Messages: the homes Lena sent her, as from her agent, new until she
  // looks; her own take, never how long she looked or that she passed, in
  // words she'd see on the link; Lena's answer under the home and her word
  // to the conversation; and Jo's own word back.
  await jo.setViewportSize({ width: 390, height: 844 });
  await jo.goto("/");
  await expect(jo.getByRole("banner").getByRole("link", { name: /^Messages, \d+ new$/ })).toBeVisible();
  await jo.goto("/messages");
  const hers = jo.getByRole("list", { name: "Conversations" }).getByRole("link", { name: /Lena Messages/ });
  await expect(hers).toContainText("Agent");
  await expect(hers).toContainText("New");
  await expect(hers).toContainText("More coming Friday!");
  await hers.click();
  await jo.waitForURL(/\/messages\/acct%3A/);
  const theirs = jo.getByRole("list", { name: "Messages" });
  await expect(theirs).toContainText("Lena Messages sent 2 homes");
  await expect(theirs).toContainText("You liked it");
  await expect(theirs).toContainText("You passed");
  await expect(theirs).not.toContainText(/Opened|Not opened|\d+ (sec|min)/);
  // Lena's answer: her message quoting the home, under her name; Jo's own
  // question the same, with no name on it.
  const lenasAnswer = threadComment(jo, QUILLAN, "Yes, it was finished in 2019.");
  await expect(lenasAnswer).toContainText("Lena Messages");
  await expect(lenasAnswer.getByRole("link", { name: new RegExp(`About ${QUILLAN}`) })).toHaveAttribute("href", `#home-${quillanKey}`);
  await expect(threadComment(jo, QUILLAN, "Is the basement finished?")).not.toContainText("Lena");
  await expect(theirs.locator(`[id="home-${quillanKey}"]`)).not.toContainText(/finished|comment/);
  await expect(theirs).toContainText("More coming Friday!");
  // (The card opens the home on her own link; the quotes above her words only point at the card.)
  await expect(theirs.locator(`[id="home-${quillanKey}"]`).getByRole("link", { name: new RegExp(QUILLAN) })).toHaveAttribute("href", /^\/s\/[\w-]+\?home=/);
  await expect(jo.getByRole("link", { name: "Send homes" })).toHaveAttribute("href", /^\/send\?to=acct%3A/);
  const joBox = jo.getByRole("textbox", { name: "Message", exact: true });
  await joBox.fill("Thanks Lena!");
  await joBox.press("Enter");
  await expect(theirs).toContainText("Thanks Lena!");
  await jo.goto("/messages");
  await expect(jo.getByRole("list", { name: "Conversations" }).getByRole("link", { name: /Lena Messages/ })).not.toContainText("New");
  await expect(jo.getByRole("banner").getByRole("link", { name: "Messages", exact: true })).toBeVisible();

  // Her word reaches Lena: something new in the bar and in the bell; on
  // Messages (wide), her conversation is the newest and opens by itself,
  // her word in it, and so it's been seen: no longer new.
  await agent.goto("/activity");
  await expect(agent.getByRole("main")).toContainText("Jo sent you a message");
  await expect(agent.getByRole("banner").getByRole("link", { name: /^Messages, \d+ new$/ })).toBeVisible();
  await agent.goto("/messages");
  await expect(pane.getByRole("heading", { level: 2, name: "Jo" })).toBeVisible();
  await expect(pane.getByRole("list", { name: "Messages" })).toContainText("Thanks Lena!");
  await expect(list.getByRole("link", { name: /^Jo\b/ })).toContainText("Thanks Lena!");
  await expect(list.getByRole("link", { name: /^Jo\b/ })).not.toContainText("New");
  await expect(agent.getByRole("banner").getByRole("link", { name: "Messages", exact: true })).toBeVisible();

  // A link sent to nobody yet, unopened, can go from its details page; the
  // conversations come back without it. (Jo's, opened, offers no such thing.)
  await agent.goto("/messages");
  await list.getByRole("link", { name: /^Jo\b/ }).click();
  await agent.waitForURL(/\/messages\/acct%3A/);
  await agent.getByRole("link", { name: "Link details" }).click();
  await agent.waitForURL(/\/dashboard\/shares\//);
  await agent.goto(`${agent.url().split("?")[0]}?tab=people`);
  await expect(agent.getByRole("button", { name: /^Delete\b/ })).toHaveCount(0);
  await namelessLink(agent, "SAMPLE-1013");
  await agent.goto("/messages");
  const nameless = list.getByRole("link", { name: /^Link for 5902 Lakeview/ });
  await expect(nameless).toContainText("Not opened yet");
  await nameless.click();
  await agent.waitForURL(/\/messages\/link%3A/);
  await agent.getByRole("link", { name: "Link details" }).click();
  await agent.waitForURL(/\/dashboard\/shares\//);
  await agent.goto(`${agent.url().split("?")[0]}?tab=people`);
  await agent.getByRole("button", { name: /^Delete\b/ }).click();
  await agent.getByRole("group", { name: /^Delete the link for/ }).getByRole("button", { name: "Yes, delete" }).click();
  await agent.waitForURL(/\/messages$/);
  await expect(list.getByRole("link", { name: /^Link for 5902 Lakeview/ })).toHaveCount(0);

  // Someone with nothing sent or received: what this is for, said once (wide:
  // where a conversation would be; the list's own copy is a phone's).
  const ned = await signUpBuyer(browser, "ned.messages@example.com", "Ned Messages");
  await ned.setViewportSize({ width: 1280, height: 900 });
  await ned.goto("/messages");
  await expect(ned.getByText("No messages yet").filter({ visible: true })).toHaveCount(1);
  await expect(ned.getByRole("region", { name: "Conversation", exact: true })).toContainText("Homes you send, and homes sent to you, show up here.");
  await expect(ned.getByRole("link", { name: "Send homes" }).first()).toHaveAttribute("href", "/send?aud=someone");
});
