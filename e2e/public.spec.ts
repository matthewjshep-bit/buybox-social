import { expect, test } from "@playwright/test";
import { createShare, heartOf, homeIn, joinAs, openComments, openMore, signInAgent } from "./helpers";

const SECRET = "We could go 50k over asking.";
const SHARED = "That fenced yard is perfect for our dog.";
const BRACKENFIELD = "2205 Brackenfield Ct NW";

test("public pages show activity, never private words, and private threads share only what buyers allow", async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  // A private client thread: a private comment, a like with a photo like, and
  // a comment the client chooses to share anonymously.
  const agent = await signInAgent(browser, "pat@example.com", "Pat Agent");
  const { url } = await createShare(agent, ["2205 Brackenfield"]);
  const client = await (await browser.newContext()).newPage();
  await client.goto(url);
  const clientHome = homeIn(client, BRACKENFIELD);
  let chat = await openComments(client, clientHome);
  await chat.getByLabel("Add a comment").fill(SECRET);
  await chat.getByRole("button", { name: "Post comment" }).click();
  await joinAs(client, "Riley");
  await expect(chat.getByText(SECRET)).toBeVisible();
  // Sharing publicly is only offered once you like the home.
  await expect(chat.getByLabel(/share this anonymously/)).toHaveCount(0);
  await client.keyboard.press("Escape");

  await heartOf(clientHome).click();
  await expect(heartOf(clientHome)).toHaveAttribute("aria-pressed", "true");
  await clientHome.getByRole("button", { name: /^Like the brick front/ }).click();
  await expect(clientHome.getByRole("button", { name: /^Like the brick front/ })).toHaveAttribute("aria-pressed", "true");
  chat = await openComments(client, clientHome);
  await chat.getByLabel(/share this anonymously/).check();
  await chat.getByLabel("Add a comment").fill(SHARED);
  await chat.getByRole("button", { name: "Post comment" }).click();
  await expect(chat.getByText("Shared anonymously on the public page")).toBeVisible();
  await client.keyboard.press("Escape");

  // A second person on the link passes on the yard. That stays private.
  const quinn = await (await browser.newContext()).newPage();
  await quinn.goto(url);
  const quinnMore = await openMore(quinn, homeIn(quinn, BRACKENFIELD));
  await quinnMore.getByRole("button", { name: "Not for me" }).click();
  await joinAs(quinn, "Quinn");
  const quinnWhy = quinnMore.getByRole("group", { name: "What made you pass?" });
  await quinnWhy.getByRole("button", { name: "Yard" }).click();
  await expect(quinnWhy.getByRole("button", { name: "Yard" })).toHaveAttribute("aria-pressed", "true");

  // The home's public page shows the activity without the words.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/homes/SAMPLE-1006");
  const post = homeIn(page, BRACKENFIELD);
  await expect(post).toContainText("A buyer commented privately");
  await expect(post).toContainText("Listed by Priya Natarajan");
  await expect(post).toContainText(/Traditional brick-front home/);
  await expect(post.getByRole("button", { name: `Like ${BRACKENFIELD}, 1 like` })).toBeVisible();
  let sheet = await openComments(page, post);
  await expect(sheet.getByText("People like")).toBeVisible();
  await expect(sheet.getByText("Exterior 1")).toBeVisible();
  await expect(sheet.getByText("People pass on")).toHaveCount(0);
  const activity = sheet.getByLabel("Activity");
  await expect(activity).toContainText("sent to 1 buyer by agents");
  await expect(activity).toContainText("2 comments in private chats");
  await expect(activity).not.toContainText("pass");
  const thread = sheet.getByRole("list", { name: "Comments and likes" });
  await expect(thread).toContainText("A buyer liked the brick front");
  await expect(thread).toContainText(SHARED);
  await expect(thread).toContainText("Shared from a private chat");
  await expect(page.getByText(SECRET)).toHaveCount(0);
  await expect(page.getByText(/Riley|Quinn/)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Any visitor can react and comment in public.
  await heartOf(post).click();
  await joinAs(page, "Morgan");
  await expect(heartOf(post)).toHaveAttribute("aria-pressed", "true");
  await post.getByRole("button", { name: "Next photo" }).click();
  await post.getByRole("button", { name: /^Like the natural light/ }).click();
  await expect(post.getByRole("button", { name: /^Like the natural light/ })).toHaveAttribute("aria-pressed", "true");
  sheet = await openComments(page, post);
  await expect(sheet.getByLabel(/share this anonymously/)).toHaveCount(0);
  await sheet.getByLabel("Add a comment").fill("Love the quiet cul-de-sac.");
  await sheet.getByRole("button", { name: "Post", exact: true }).click();
  await expect(thread).toContainText("Morgan Love the quiet cul-de-sac.");
  await expect(thread).toContainText("You liked the natural light");
  await expect(sheet.getByText("Natural light 1")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(post.getByRole("button", { name: `Like ${BRACKENFIELD}, 2 likes` })).toBeVisible();

  // Other visitors see it, by name.
  const other = await (await browser.newContext()).newPage();
  await other.goto("/homes/SAMPLE-1006");
  const otherPost = homeIn(other, BRACKENFIELD);
  let otherSheet = await openComments(other, otherPost);
  await expect(otherSheet.getByText("Love the quiet cul-de-sac.")).toBeVisible();
  await expect(otherSheet.getByText("Morgan liked the natural light")).toBeVisible();
  await expect(otherSheet.getByText(SHARED)).toBeVisible();
  await other.keyboard.press("Escape");

  // Passes made in public do show, with their specifics.
  const otherMore = await openMore(other, otherPost);
  await otherMore.getByRole("button", { name: "Not for me" }).click();
  await joinAs(other, "Drew");
  await otherMore.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }).click();
  await expect(
    otherMore.getByRole("group", { name: "What made you pass?" }).getByRole("button", { name: "Price" }),
  ).toHaveAttribute("aria-pressed", "true");
  await other.reload();
  otherSheet = await openComments(other, otherPost);
  await expect(otherSheet.getByText("People pass on")).toBeVisible();
  await expect(otherSheet.getByText("Price 1")).toBeVisible();
  await expect(otherSheet.getByText("You passed, didn't like the price")).toBeVisible();

  // Private words and names are not in the public HTML at all.
  for (const path of ["/", "/homes/SAMPLE-1006"]) {
    const html = await (await other.request.get(path)).text();
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("Riley");
    expect(html).not.toContain("Quinn");
  }

  // The client can take a shared comment back.
  chat = await openComments(client, clientHome);
  await chat.getByRole("button", { name: "Make private" }).click();
  await expect(chat.getByText("Shared anonymously on the public page")).toHaveCount(0);
  await other.reload();
  otherSheet = await openComments(other, otherPost);
  await expect(otherSheet.getByText("Love the quiet cul-de-sac.")).toBeVisible();
  await expect(other.getByText(SHARED)).toHaveCount(0);

  // Public comments don't leak into the private thread.
  await client.reload();
  await expect(client.getByText("Love the quiet cul-de-sac.")).toHaveCount(0);
  await expect(client.getByText("Morgan")).toHaveCount(0);

  expect((await other.request.get("/homes/NOT-A-LISTING")).status()).toBe(404);
  expect(pageErrors).toEqual([]);
});
