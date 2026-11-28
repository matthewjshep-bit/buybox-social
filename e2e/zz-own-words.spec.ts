// (Named to run last, after zz-compose: a post leaves its words on its homes'
// conversations, and earlier specs count those homes' comments exactly.)
// Your own words, anywhere you said them, are yours to change or take back:
// "…" beside them, Edit (in place, marked "Edited" for everyone) and Delete
// (asked once more; the replies under a comment stay, under "Comment
// deleted", until the last of them goes). A comment on a
// home's page, one on an agent's link (and its public copy), a post (and its
// words on its homes), a message. Never anyone else's.
import { expect, test } from "@playwright/test";
import { commentIn, createShare, heartOf, homeIn, openComments, pickHome, signInAgent, signUpBuyer, toFirstHome } from "./helpers";

const ALDER = "16420 NE Alder Crest Way";
const ALDER_PAGE = "/homes/SAMPLE-1011";
const SALTMARSH = "719 Saltmarsh Ln";
const SALTMARSH_PAGE = "/homes/SAMPLE-1008";
const CORBEL = "812 N Corbel St";
const CORBEL_PAGE = "/homes/SAMPLE-1003";

test("a comment on a home's page: Edit changes it for everyone, marked Edited; Escape leaves it as it was; Delete leaves its replies under Comment deleted", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const TYPO = "The back yard is hgue, Ola says.";
  const FIXED = "The back yard is huge, Ola says.";
  const ola = await signUpBuyer(browser, `ola.own.${Date.now()}@example.com`, "Ola");
  await ola.setViewportSize({ width: 390, height: 780 });
  await ola.goto(ALDER_PAGE);
  const thread = await openComments(ola, homeIn(ola, ALDER));
  await thread.getByRole("textbox").first().fill(TYPO);
  await thread.getByRole("textbox").first().press("Enter");
  const mine = thread.locator("li[data-comment]").filter({ hasText: TYPO });
  await expect(mine).toBeVisible();

  // Edit, then Escape: the box goes, the words as they were, the comments still open.
  await mine.getByRole("button", { name: "Options for your comment" }).click();
  await ola.getByRole("button", { name: "Edit", exact: true }).click();
  const box = thread.getByRole("textbox", { name: "Edit your comment" });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue(TYPO);
  await box.press("Escape");
  await expect(box).toHaveCount(0);
  await expect(thread).toBeVisible();
  await expect(mine).toContainText(TYPO);
  await expect(mine.getByRole("button", { name: "Options for your comment" })).toBeFocused();

  // Edit, for real: Enter saves it, and it says so.
  await mine.getByRole("button", { name: "Options for your comment" }).click();
  await ola.getByRole("button", { name: "Edit", exact: true }).click();
  await box.fill(FIXED);
  await box.press("Enter");
  const fixed = thread.locator("li[data-comment]").filter({ hasText: FIXED });
  await expect(fixed).toContainText("Edited");
  await expect(thread).not.toContainText(TYPO);

  // Anyone else: the new words, Edited, and no way to change them; they answer it.
  const zed = await signUpBuyer(browser, `zed.own.${Date.now()}@example.com`, "Zed");
  await zed.goto(ALDER_PAGE);
  const theirs = await openComments(zed, homeIn(zed, ALDER));
  const olas = commentIn(theirs, "Ola", FIXED);
  await expect(olas).toContainText("Edited");
  await expect(olas.getByRole("button", { name: /^Options for/ })).toHaveCount(0);
  await olas.getByRole("button", { name: "Reply to Ola" }).click();
  await theirs.getByLabel("Reply to Ola").fill("Room for a garden.");
  await theirs.getByLabel("Reply to Ola").press("Enter");
  await expect(theirs.getByText("Room for a garden.")).toBeVisible();

  // Ola deletes it: asked first (the reply stays), then gone, the reply under "Comment deleted".
  await ola.reload();
  const again = await openComments(ola, homeIn(ola, ALDER));
  const hers = again.locator("li[data-comment]").filter({ hasText: FIXED }).first();
  await hers.getByRole("button", { name: "Options for your comment" }).click();
  await ola.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(ola.getByRole("group", { name: "Delete this comment?" })).toContainText("Its replies stay, under “Comment deleted”.");
  await expect(ola.getByRole("button", { name: "Cancel" })).toBeFocused();
  await ola.getByRole("group", { name: "Delete this comment?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(again.getByText(FIXED)).toHaveCount(0);
  const placeholder = again.locator("li[data-deleted]").filter({ hasText: "Comment deleted" });
  await expect(placeholder).toBeVisible();
  await expect(placeholder.getByRole("button", { name: /^Options for/ })).toHaveCount(0);
  await expect(placeholder.getByRole("button", { name: /^Reply/ })).toHaveCount(0);

  // To everyone: the words gone, the reply still there, under "Comment deleted".
  await zed.reload();
  const later = await openComments(zed, homeIn(zed, ALDER));
  await expect(later).not.toContainText(FIXED);
  const kept = later.locator("li[data-deleted]").filter({ hasText: "Comment deleted" });
  await kept.getByRole("button", { name: "View 1 reply" }).click();
  const reply = kept.locator("li[data-comment]").filter({ hasText: "Room for a garden." });
  await expect(reply).toBeVisible();

  // The reply's author takes theirs back too: nothing's left of the thread.
  await reply.getByRole("button", { name: "Options for your comment" }).click();
  await zed.getByRole("button", { name: "Delete", exact: true }).click();
  await zed.getByRole("group", { name: "Delete this comment?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(later.getByText("Room for a garden.")).toHaveCount(0);
  await expect(async () => {
    await zed.reload();
    const fresh = await openComments(zed, homeIn(zed, ALDER));
    await expect(fresh.getByText("Room for a garden.")).toHaveCount(0);
    await expect(fresh.locator("li[data-deleted]")).toHaveCount(0);
  }).toPass({ timeout: 20_000 });
});

test("a comment on an agent's link: changed, its public copy says the same; deleted, it's gone from both", async ({ browser }) => {
  test.setTimeout(150_000);
  const TYPO = "Kit loves the wraparound porhc.";
  const FIXED = "Kit loves the wraparound porch.";
  const agent = await signInAgent(browser, `own.agent.${Date.now()}@example.com`, "Ona Agent");
  const { url } = await createShare(agent, ["1204 Quillan", "719 Saltmarsh"], ["Kit"]);
  const kit = await signUpBuyer(browser, `kit.own.${Date.now()}@example.com`, "Kit");
  await kit.setViewportSize({ width: 390, height: 780 });
  await kit.goto(url);
  await toFirstHome(kit);
  const second = homeIn(kit, SALTMARSH);
  await second.scrollIntoViewIfNeeded();
  const chat = await openComments(kit, second);
  await expect(chat).toContainText("Public, with your first name.");
  await chat.getByRole("textbox").first().fill(TYPO);
  await chat.getByRole("textbox").first().press("Enter");
  const mine = chat.locator("li[data-comment]").filter({ hasText: TYPO });
  await expect(mine).toBeVisible();
  const anyone = await (await browser.newContext()).newPage();
  await expect(async () => expect(await (await anyone.request.get(SALTMARSH_PAGE)).text()).toContain(TYPO)).toPass({ timeout: 10_000 });

  await mine.getByRole("button", { name: "Options for your comment" }).click();
  await kit.getByRole("button", { name: "Edit", exact: true }).click();
  await chat.getByRole("textbox", { name: "Edit your comment" }).fill(FIXED);
  await chat.getByRole("button", { name: "Save" }).click();
  const fixed = chat.locator("li[data-comment]").filter({ hasText: FIXED });
  await expect(fixed).toContainText("Edited");
  // Still public, and the home's own page says the same.
  await expect(fixed).toContainText("Public");
  await expect(async () => {
    const html = await (await anyone.request.get(SALTMARSH_PAGE)).text();
    expect(html).toContain(FIXED);
    expect(html).not.toContain(TYPO);
  }).toPass({ timeout: 10_000 });

  // The agent, on the link: Kit's words, changed, and nothing of theirs to change.
  await agent.goto(url);
  await toFirstHome(agent).catch(() => {});
  const theirs = await openComments(agent, homeIn(agent, SALTMARSH));
  await expect(theirs.locator("li[data-comment]").filter({ hasText: FIXED })).toContainText("Edited");
  await expect(theirs.locator("li[data-comment]").filter({ hasText: FIXED }).getByRole("button", { name: /^Options for/ })).toHaveCount(0);

  await fixed.getByRole("button", { name: "Options for your comment" }).click();
  await kit.getByRole("button", { name: "Delete", exact: true }).click();
  await kit.getByRole("group", { name: "Delete this comment?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(chat.getByText(FIXED)).toHaveCount(0);
  await expect(async () => expect(await (await anyone.request.get(SALTMARSH_PAGE)).text()).not.toContain(FIXED)).toPass({
    timeout: 10_000,
  });
  await agent.reload();
  await toFirstHome(agent).catch(() => {});
  const after = await openComments(agent, homeIn(agent, SALTMARSH));
  await expect(after.getByText(FIXED)).toHaveCount(0);
});

test("a post: its words changed in place, on its home too; deleted, it's off your page, the feed and the home", async ({ browser }) => {
  test.setTimeout(120_000);
  const TYPO = "Pia asks: who wants to tuor this one?";
  const FIXED = "Pia asks: who wants to tour this one?";
  const pia = await signUpBuyer(browser, `pia.post.${Date.now()}@example.com`, "Pia");
  await pia.goto("/people/me");
  await pia.waitForURL(/\/people\/[\w-]+$/);
  await pia.getByRole("button", { name: /^Share homes/ }).click();
  const form = pia.locator("form[data-compose]");
  await pickHome(pia, CORBEL);
  await form.getByRole("textbox", { name: "Say something" }).fill(TYPO);
  await form.getByRole("button", { name: "Post", exact: true }).click();
  await expect(pia.getByRole("status").filter({ hasText: "Posted" })).toBeVisible();
  const card = pia.locator("main li[data-post]").filter({ hasText: CORBEL }).first();
  await expect(card).toContainText(TYPO);

  // Edit: Enter is a new line in a post; Save saves it.
  await card.getByRole("button", { name: "Options for your post" }).click();
  await pia.getByRole("button", { name: "Edit", exact: true }).click();
  const box = card.getByRole("textbox", { name: "Edit your post" });
  await expect(box).toBeFocused();
  await box.fill(FIXED);
  await box.press("Enter");
  await expect(box).toBeVisible();
  await box.fill(FIXED);
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(box).toHaveCount(0);
  await expect(card).toContainText(FIXED);
  await expect(card.locator("[data-card-line]")).toContainText("Edited");
  await pia.reload();
  await expect(card).toContainText(FIXED);
  await expect(card.locator("[data-card-line]")).toContainText("Edited");
  const anyone = await (await browser.newContext()).newPage();
  await expect(async () => {
    const html = await (await anyone.request.get(CORBEL_PAGE)).text();
    expect(html).toContain(FIXED);
    expect(html).not.toContain(TYPO);
  }).toPass({ timeout: 10_000 });

  // Delete: asked, then gone, from here and from the home.
  await card.getByRole("button", { name: "Options for your post" }).click();
  await pia.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(pia.getByRole("group", { name: "Delete this post?" })).toContainText("each home's comments");
  await pia.getByRole("group", { name: "Delete this post?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(pia.locator("main li[data-post]").filter({ hasText: FIXED })).toHaveCount(0);
  await pia.reload();
  await expect(pia.locator("main")).not.toContainText(FIXED);
  await expect(async () => expect(await (await anyone.request.get(CORBEL_PAGE)).text()).not.toContain(FIXED)).toPass({
    timeout: 10_000,
  });
});

test("a message in Messages: changed in place, marked Edited; deleted, gone for both sides", async ({ browser }) => {
  test.setTimeout(150_000);
  const TYPO = "Mo can show it on Saturdya at ten.";
  const FIXED = "Mo can show it on Saturday at ten.";
  const agent = await signInAgent(browser, `own.msg.${Date.now()}@example.com`, "Mo Messages");
  const { url } = await createShare(agent, ["1204 Quillan"], ["Bo"]);
  // Bo is on the link: signed up, and liked the home.
  const bo = await signUpBuyer(browser, `bo.own.${Date.now()}@example.com`, "Bo");
  await bo.goto(url);
  await toFirstHome(bo);
  await heartOf(homeIn(bo, "1204 Quillan St SE")).click();
  await expect(heartOf(homeIn(bo, "1204 Quillan St SE"))).toHaveAttribute("aria-pressed", "true");

  // (Once his like is saved, the conversation is with his account.)
  const row = agent.getByRole("list", { name: "Conversations" }).getByRole("link", { name: /^Bo\b/ });
  await expect(async () => {
    await agent.goto("/messages");
    await expect(row).toHaveAttribute("href", /acct%3A/, { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await row.click();
  await agent.waitForURL(/\/messages\/acct%3A/);
  const box = agent.getByRole("textbox", { name: "Message", exact: true });
  await box.fill(TYPO);
  await box.press("Enter");
  const messages = agent.getByRole("list", { name: "Messages" });
  const mine = messages.locator("li").filter({ hasText: TYPO }).last();
  await expect(mine).toBeVisible();

  await mine.getByRole("button", { name: "Options for your message" }).click();
  await agent.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = agent.getByRole("textbox", { name: "Edit your message" });
  await expect(edit).toBeFocused();
  await edit.fill(FIXED);
  await edit.press("Enter");
  const fixed = messages.locator("li").filter({ hasText: FIXED }).last();
  await expect(fixed).toContainText("Edited");
  await expect(messages).not.toContainText(TYPO);

  // Bo sees the new words, and nothing of his to change on them.
  await bo.goto("/messages");
  await bo.getByRole("list", { name: "Conversations" }).getByRole("link", { name: /Mo Messages/ }).click();
  const his = bo.getByRole("list", { name: "Messages" }).locator("li").filter({ hasText: FIXED }).last();
  await expect(his).toContainText("Edited");
  await expect(his.getByRole("button", { name: /^Options for/ })).toHaveCount(0);

  await fixed.getByRole("button", { name: "Options for your message" }).click();
  await agent.getByRole("button", { name: "Delete", exact: true }).click();
  await agent.getByRole("group", { name: "Delete this message?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(messages).not.toContainText(FIXED);
  await bo.reload();
  await expect(bo.getByRole("list", { name: "Messages" })).not.toContainText(FIXED);
});
