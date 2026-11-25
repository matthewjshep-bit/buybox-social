// (Named to run last: its likes and follows change homes' like counts that
// earlier specs assert exactly.)
import { expect, test, type Page } from "@playwright/test";
import { heartOf, homeIn, missedTaps, signUpBuyer } from "./helpers";

// A fresh feed each visit (lib/feed-rank.ts, lib/home-feed.ts, components/home/seen.tsx):
// what the people you follow did since you last looked leads, unseen first; what
// you've already had on screen falls back (not gone); never two cards in a row
// from one person; a slot at the fifth card for a home you've never seen from
// beyond the people you follow; and the shuffle holds within a session.
//
// The two tests share one buyer (Una) and what she has seen, so they run in order.
test.describe.configure({ mode: "serial" });

const saved = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "POST" && Boolean(res.request().headers()["next-action"]));

// Someone's own page, from wherever they are.
async function pageOf(page: Page) {
  await page.goto("/people/me");
  await page.waitForURL(/\/people\/[\w-]+$/);
  return new URL(page.url()).pathname;
}

// Follows someone from their page: a Follow button a fingertip can't miss.
async function follow(page: Page, personPage: string, first: string) {
  await page.goto(personPage);
  const button = page.getByRole("button", { name: `Follow ${first}` });
  await expect(button).toBeVisible();
  expect(await missedTaps(button)).toEqual([]);
  await Promise.all([saved(page), button.click()]);
  await expect(page.getByRole("button", { name: `Following ${first}` })).toHaveAttribute("aria-pressed", "true");
}

// Likes a home in public, on its own full-screen page.
async function like(page: Page, key: string, address: string) {
  await page.goto(`/homes/${key}`);
  const heart = heartOf(homeIn(page, address));
  await expect(heart).toBeVisible();
  expect(await missedTaps(heart)).toEqual([]);
  await Promise.all([saved(page), heart.click()]);
  await expect(heart).toHaveAttribute("aria-pressed", "true");
}

const feed = (page: Page) => page.getByRole("region", { name: "Your feed" });
// The feed's cards: each carries what it is in data-item (home:<key> or post:<id>).
const cards = (page: Page) => feed(page).locator("li[data-item]");
// Every card in the feed's lists (not a row of the people-to-follow card, nor a
// thumbnail inside a card): what must all carry data-item.
const allCards = (page: Page) =>
  feed(page).locator("xpath=.//li[not(ancestor::li)][not(ancestor::section[not(@aria-labelledby='stream-title')])]");
const order = (page: Page) => cards(page).evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.item ?? ""));
// Where someone's cards are (0-based), by the link to their page in the card's line.
const indicesOf = (page: Page, personPage: string) =>
  cards(page).evaluateAll((els, href) => els.flatMap((el, i) => (el.querySelector(`a[href="${href}"]`) ? [i] : [])), personPage);

async function openFeed(page: Page) {
  await page.goto("/");
  await expect(cards(page).first()).toBeVisible();
}

// A page of Una's that never tells the server what was on screen: for
// reading the feed without changing it.
async function quietPage(of: Page) {
  const page = await of.context().newPage();
  await page.route("**/*", (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) return route.abort();
    return route.continue();
  });
  return page;
}

const VIC = { first: "Vic", homes: [["SAMPLE-1007", "3518 Wexford Ave N"], ["SAMPLE-1010", "88 Heron Bluff Rd"]] as const };
// Wes likes one of these later: whichever Una has never had on her screen.
const WES = {
  first: "Wes",
  homes: [["SAMPLE-1004", "96 Fernhollow Ln"], ["SAMPLE-1003", "812 N Corbel St"], ["SAMPLE-1001", "4127 Larkmoor Ave NE"]] as const,
};
// Pat, whom nobody follows: her likes make five homes popular, so the feed has
// homes from beyond the people Una follows for more than one reason (popular
// and picked), and some of them stay unseen after she scrolls the first six.
const PAT_HOMES = [
  ["SAMPLE-1002", "1880 Tamsen Ridge Pl SE"],
  ["SAMPLE-1008", "719 Saltmarsh Ln"],
  ["SAMPLE-1013", "5902 Lakeview Terrace SE"],
  ["SAMPLE-1009", "1204 Quillan St SE"],
  ["SAMPLE-1005", "10421 Halvard Way NE"],
] as const;

let una: Page;
let peek: Page;
let vicPage = "";
let wesPage = "";
let wesHome = "";
// What Una has had on screen (and the server was told about).
const seenByUna = new Set<string>();

test("what the people you follow did since you last looked leads, and what you've already seen falls back", async ({ browser }) => {
  test.setTimeout(240_000);
  const vic = await signUpBuyer(browser, "vic.fresh@example.com", "Vic Oakhurst");
  vicPage = await pageOf(vic);
  const wes = await signUpBuyer(browser, "wes.fresh@example.com", "Wes Fairleigh");
  wesPage = await pageOf(wes);
  const pat = await signUpBuyer(browser, "pat.fresh@example.com", "Pat Lindqvist");
  for (const [key, address] of PAT_HOMES) await like(pat, key, address);
  await pat.context().close();
  // Vic likes two homes, in public.
  for (const [key, address] of VIC.homes) await like(vic, key, address);
  await vic.context().close();

  // Una follows Vic and Wes, then comes to her home for the first time.
  una = await signUpBuyer(browser, "una.fresh@example.com", "Una Thorncliff");
  await follow(una, vicPage, VIC.first);
  await follow(una, wesPage, WES.first);
  const flushed = saved(una);
  await openFeed(una);

  // Every card says what it is, for next time.
  const items = await order(una);
  expect(items.length).toBeGreaterThan(5);
  expect(await allCards(una).count()).toBe(items.length);
  for (const item of items) expect(item).toMatch(/^(home|post):/);
  const vicKeys = VIC.homes.map(([key]) => `home:${key}`);
  // What Vic did leads: his two cards are at the top, but never side by side
  // (a card from someone else between them), so first and third.
  const vicAt = await indicesOf(una, vicPage);
  expect(vicAt).toEqual([0, 2]);
  expect([items[0], items[2]].sort()).toEqual([...vicKeys].sort());
  expect(await indicesOf(una, wesPage)).toEqual([]);
  // Nobody twice in a row, anywhere in the feed.
  const authors = await cards(una).evaluateAll((els) =>
    els.map((el) => [...el.querySelectorAll<HTMLAnchorElement>('a[href^="/people/"]')].map((a) => a.getAttribute("href"))[0] ?? null),
  );
  for (let i = 1; i < authors.length; i++) {
    if (authors[i]) expect(authors[i], `cards ${i - 1} and ${i} are both from ${authors[i]}`).not.toBe(authors[i - 1]);
  }

  // She scrolls through the first six, a moment on each: they count as seen.
  for (let i = 0; i < 6; i++) {
    await cards(una).nth(i).scrollIntoViewIfNeeded();
    await una.waitForTimeout(1300);
    seenByUna.add(items[i]);
  }
  await flushed;
  await una.waitForTimeout(2500);

  // Back to her home: Vic's cards, seen with nothing new on them since, fall
  // back; still there, but not at the top.
  peek = await quietPage(una);
  await openFeed(peek);
  const again = await order(peek);
  const vicAgain = await indicesOf(peek, vicPage);
  expect(vicAgain, `Vic's cards after being seen: ${JSON.stringify(vicAgain)}; feed ${JSON.stringify(again.slice(0, 6))}`).toHaveLength(2);
  expect(vicAgain.filter((i) => i < 2)).toEqual([]);
  expect(vicKeys).not.toContain(again[0]);
  expect(vicKeys).not.toContain(again[1]);

  // Wes, whom she also follows, likes a home she has never had on her screen:
  // new since she last looked, and unseen, so it leads.
  const [wesKey, wesAddress] = WES.homes.find(([key]) => !seenByUna.has(`home:${key}`))!;
  wesHome = `home:${wesKey}`;
  await like(wes, wesKey, wesAddress);
  await wes.context().close();
  await peek.reload();
  await expect(cards(peek).first()).toBeVisible();
  const fresh = await order(peek);
  expect(fresh[0], `feed after Wes's like: ${JSON.stringify(fresh.slice(0, 6))}`).toBe(wesHome);
  expect(await indicesOf(peek, wesPage)).toEqual([0]);
  await expect(cards(peek).first()).toContainText(WES.first);
});

test("a discovery slot and a stable-within-session shuffle", async ({}) => {
  test.setTimeout(120_000);
  // The same feed twice in one sitting: the same order (the shuffle holds
  // for half an hour; a read that straddles the half hour is read once more).
  await openFeed(peek);
  const reads = [await order(peek)];
  await peek.reload();
  await expect(cards(peek).first()).toBeVisible();
  reads.push(await order(peek));
  if (JSON.stringify(reads[0]) !== JSON.stringify(reads[1])) {
    await peek.reload();
    await expect(cards(peek).first()).toBeVisible();
    reads.push(await order(peek));
  }
  const same = reads.filter((read) => JSON.stringify(read) === JSON.stringify(reads.at(-1))).length;
  expect(same, `feed orders: ${JSON.stringify(reads.map((read) => read.slice(0, 8)))}`).toBeGreaterThanOrEqual(2);
  const items = reads.at(-1)!;
  expect(items.length).toBeGreaterThan(5);
  // (Wes's like, still never on her screen, still leads.)
  expect(items[0]).toBe(wesHome);

  // The fifth card is a home she has never seen, from beyond the people she
  // follows: not Vic's, not Wes's, and nothing she has scrolled past.
  const fifth = cards(peek).nth(4);
  await expect(fifth).toHaveAttribute("data-item", /^home:/);
  expect(seenByUna.has(items[4]), `fifth card ${items[4]} was already seen: ${JSON.stringify([...seenByUna])}`).toBe(false);
  await expect(fifth.locator(`a[href="${vicPage}"]`)).toHaveCount(0);
  await expect(fifth.locator(`a[href="${wesPage}"]`)).toHaveCount(0);
  expect(items[4]).not.toBe(wesHome);
  for (const [key] of VIC.homes) expect(items[4]).not.toBe(`home:${key}`);
  // (Its line says why it's here instead: popular, near, or picked.)
  await expect(fifth.getByRole("link", { name: /^[^:]+: (Popular|Near you|Picked for you|Homes to start with)/ })).toHaveCount(1);
});
