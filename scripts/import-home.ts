// Brings in one home by address (or MLS number) and scans its photos, from the
// command line: the same steps the site runs when someone picks a home.
//   pnpm import:home "20473 199th"          find, save, scan
//   pnpm import:home "20473 199th" --fake   the same, with a stand-in scan (no Claude key needed)
import { importMissing, runImports } from "../lib/listings/imports";
import { sql } from "../lib/db";
import { findOnRepliers } from "../lib/listings/repliers";
import type { Scanner } from "../lib/listings/scan";
import type { Listing } from "../lib/listings/types";

// A stand-in scan: the photo's four quarters, to try the queue without a key.
const fake: Scanner = async () => ({
  ok: true,
  width: 1024,
  height: 683,
  model: "fake",
  scan: {
    room: "Room",
    description: "A stand-in scan.",
    elements: [
      { label: "Whole photo", x: 0, y: 0, w: 1, h: 1, notable: false, aspect: null },
      { label: "Top left", x: 0, y: 0, w: 0.5, h: 0.5, notable: true, aspect: "aesthetic" },
      { label: "Bottom right", x: 0.5, y: 0.5, w: 0.5, h: 0.5, notable: true, aspect: null },
    ],
  },
});

async function main() {
  const args = process.argv.slice(2);
  const text = args.find((arg) => !arg.startsWith("--"));
  if (!text) throw new Error('Say which home: pnpm import:home "123 Main St"');
  const [home] = await findOnRepliers(text, 1);
  if (!home) throw new Error(`No home for sale found for "${text}"`);
  console.log(`found ${home.ListingKey}: ${home.UnparsedAddress}, ${home.City} (${home.Media.length} photos)`);

  let at = Date.now();
  await importMissing([home.ListingKey]);
  console.log(`saved its facts in ${Date.now() - at} ms`);

  at = Date.now();
  for (;;) {
    const { scanned, left, more } = await runImports({ budgetMs: 120_000, ...(args.includes("--fake") ? { scan: fake } : {}) });
    console.log(`scanned ${scanned}, ${left} waiting`);
    if (!more) break;
  }
  console.log(`scans took ${Math.round((Date.now() - at) / 1000)} s`);

  const [{ data }] = await sql<{ data: Listing }[]>`select data from listings where listing_key = ${home.ListingKey}`;
  const [status] = await sql`select status from listing_imports where listing_key = ${home.ListingKey}`;
  const counts = await sql`select status, count(*)::int as n from listing_photos where listing_key = ${home.ListingKey} group by status`;
  console.log(`import: ${status?.status}; photos:`, Object.fromEntries(counts.map((c) => [c.status, c.n])));
  for (const photo of data.Media.slice(0, 5)) {
    console.log(`  ${photo.Order}. ${photo.ImageOf ?? "?"} ${photo.ImageWidth ?? "?"}x${photo.ImageHeight ?? "?"}: ${(photo.Regions ?? []).map((r) => r.tag).join(", ") || "(not scanned)"}`);
  }
  await sql.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
