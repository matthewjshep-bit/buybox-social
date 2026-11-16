// Bringing a home in when someone asks for it by address. Its facts are
// saved at once, so it can be used right away; its photos wait in a queue
// (`listing_photos`) and are scanned in the background, a few at a time.
// Every step can be run again safely: a run that's cut short is picked up by
// the next one.
import { sql } from "../db";
import { fetchFromRepliers, isRepliersKey, repliersEnabled, smallCopy } from "./repliers";
import { photoSize, SCAN_VERSION, scanPhoto, type PhotoScan, type Scanner } from "./scan";
import type { Listing, ListingMedia } from "./types";

// Photos scanned at once.
const AT_ONCE = 4;
// Tries before a photo is left unscanned.
const MOST_TRIES = 4;

type PhotoRow = { media_key: string; width: number | null; height: number | null; scan: PhotoScan | null };

// A photo with what's known about it: its size, and what its scan found.
function withScan(photo: ListingMedia, row: PhotoRow | undefined): ListingMedia {
  if (!row) return photo;
  const sized = row.width && row.height ? { ImageWidth: row.width, ImageHeight: row.height } : {};
  if (!row.scan) return { ...photo, ...sized };
  const notable = row.scan.elements.filter((e) => e.notable);
  return {
    ...photo,
    ...sized,
    ImageOf: row.scan.room || photo.ImageOf,
    ShortDescription: row.scan.description || photo.ShortDescription,
    Features: notable.map((e) => e.label),
    Spots: notable.map((e) => ({ tag: e.label, x: e.x + e.w / 2, y: e.y + e.h / 2 })),
    Regions: row.scan.elements.map((e) => ({
      tag: e.label,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      ...(e.aspect ? { aspect: e.aspect } : {}),
    })),
  };
}

// Writes the home with everything its photos' scans have found so far. With
// `fresh`, the home's facts are replaced by those just fetched.
async function saveWithScans(listingKey: string, fresh?: Listing) {
  await sql.begin(async (tx) => {
    const [current] = await tx<{ data: Listing }[]>`
      select data from listings where listing_key = ${listingKey} for update`;
    const listing = fresh ?? current?.data;
    if (!listing) return;
    const rows = await tx<PhotoRow[]>`
      select media_key, width, height, scan from listing_photos where listing_key = ${listingKey}`;
    const byKey = new Map(rows.map((row) => [row.media_key, row]));
    const data: Listing = {
      ...listing,
      Media: listing.Media.map((photo) => withScan(photo, byKey.get(photo.MediaKey ?? photo.MediaURL))),
    };
    await tx`
      insert into listings (listing_key, standard_status, data, updated_at)
      values (${listingKey}, ${data.StandardStatus}, ${tx.json(data as never)}, now())
      on conflict (listing_key) do update
        set standard_status = excluded.standard_status, data = excluded.data, updated_at = now()`;
  });
}

// Each photo's size, from a small copy: a photo can't be tapped without it.
// Quick, and whatever it misses the scan fills in.
async function sizePhotos(listingKey: string) {
  const rows = await sql<{ media_key: string; source_url: string }[]>`
    select media_key, source_url from listing_photos
    where listing_key = ${listingKey} and width is null order by position`;
  const stop = Date.now() + 8000;
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let row = queue.shift(); row && Date.now() < stop; row = queue.shift()) {
        const size = await photoSize(smallCopy(row.source_url));
        if (size) {
          await sql`
            update listing_photos set width = ${size.width}, height = ${size.height}
            where listing_key = ${listingKey} and media_key = ${row.media_key} and width is null`;
        }
      }
    }),
  );
}

// Saves a home just fetched and queues its photos. Photos already scanned
// keep their scans; new ones join the queue.
export async function saveImport(listing: Listing, source: string) {
  const photos = listing.Media.filter((m) => m.MediaCategory !== "Video");
  await saveWithScans(listing.ListingKey, listing);
  await sql`
    insert into listing_imports (listing_key, source) values (${listing.ListingKey}, ${source})
    on conflict (listing_key) do update set fetched_at = now()`;
  for (const photo of photos) {
    await sql`
      insert into listing_photos (listing_key, media_key, position, source_url)
      values (${listing.ListingKey}, ${photo.MediaKey ?? photo.MediaURL}, ${photo.Order}, ${photo.MediaURL})
      on conflict (listing_key, media_key) do update set position = excluded.position, source_url = excluded.source_url`;
  }
  await sql`
    update listing_imports set status = 'queued', finished_at = null
    where listing_key = ${listing.ListingKey}
      and exists (select from listing_photos p where p.listing_key = ${listing.ListingKey} and p.status = 'queued')`;
  await sizePhotos(listing.ListingKey);
  await saveWithScans(listing.ListingKey);
}

// Makes sure the homes with these keys are here, fetching any that aren't.
// Only keys from a source that's fetched on demand; others are left as they
// are. Returns whether there may be photos to scan.
export async function importMissing(listingKeys: string[]): Promise<boolean> {
  const wanted = [...new Set(listingKeys.filter(isRepliersKey))];
  if (!wanted.length || !repliersEnabled()) return false;
  const have = new Set(
    (await sql<{ listing_key: string }[]>`select listing_key from listings where listing_key in ${sql(wanted)}`).map(
      (row) => row.listing_key,
    ),
  );
  for (const key of wanted) {
    if (have.has(key)) continue;
    try {
      const listing = await fetchFromRepliers(key);
      if (listing) await saveImport(listing, "repliers");
    } catch (error) {
      console.error(`[imports] couldn't fetch ${key}`, error);
    }
  }
  return true;
}

type Claimed = { listing_key: string; media_key: string; source_url: string; attempts: number };

// Takes the next photos to scan, oldest home first, so that two runs at once
// never scan the same one. A photo taken but never finished is free again
// after a few minutes.
async function claim(n: number) {
  await sql`
    update listing_photos set status = 'failed', error = coalesce(error, 'never finished')
    where status = 'queued' and attempts >= ${MOST_TRIES} and (locked_until is null or locked_until < now())`;
  return sql<Claimed[]>`
    update listing_photos p
    set locked_until = now() + interval '4 minutes', attempts = p.attempts + 1
    from (
      select listing_key, media_key from listing_photos
      where status = 'queued' and (locked_until is null or locked_until < now())
      order by created_at, listing_key, position
      limit ${n}
      for update skip locked
    ) next
    where p.listing_key = next.listing_key and p.media_key = next.media_key
    returning p.listing_key, p.media_key, p.source_url, p.attempts`;
}

async function scanOne(photo: Claimed, scan: Scanner) {
  const result = await scan(photo.source_url).catch(
    (error): Awaited<ReturnType<Scanner>> => ({ ok: false, reason: String(error).slice(0, 200), final: false }),
  );
  if (result.ok) {
    await sql`
      update listing_photos
      set status = 'scanned', scan = ${sql.json(result.scan as never)}, width = ${result.width}, height = ${result.height},
          model = ${result.model}, scan_version = ${SCAN_VERSION}, error = null, locked_until = null, scanned_at = now()
      where listing_key = ${photo.listing_key} and media_key = ${photo.media_key}`;
    return true;
  }
  const over = result.final || photo.attempts >= MOST_TRIES;
  // Not at once: whatever was wrong (busy, offline) gets a moment to pass.
  await sql`
    update listing_photos
    set status = ${over ? "failed" : "queued"}, error = ${result.reason}, locked_until = now() + interval '30 seconds'
    where listing_key = ${photo.listing_key} and media_key = ${photo.media_key}`;
  return false;
}

const queued = async () =>
  (await sql<{ n: number }[]>`select count(*)::int as n from listing_photos where status = 'queued'`)[0].n;

// Scans queued photos until none can be taken or the time is up. `left` is
// how many still wait; `more` says the time ran out with photos ready to go.
export async function runImports({
  budgetMs = 45_000,
  scan = scanPhoto,
}: { budgetMs?: number; scan?: Scanner } = {}): Promise<{ scanned: number; left: number; more: boolean }> {
  // Without a key nothing can be scanned: the photos wait, untried.
  if (scan === scanPhoto && !process.env.ANTHROPIC_API_KEY) return { scanned: 0, left: await queued(), more: false };
  const stop = Date.now() + budgetMs;
  let scanned = 0;
  let more = false;
  for (;;) {
    if (Date.now() >= stop) {
      more = true;
      break;
    }
    const batch = await claim(AT_ONCE);
    if (!batch.length) break;
    const done = await Promise.all(batch.map((photo) => scanOne(photo, scan)));
    scanned += done.filter(Boolean).length;
    for (const key of new Set(batch.map((photo) => photo.listing_key))) {
      await saveWithScans(key);
      await sql`
        update listing_imports set status = 'ready', finished_at = now()
        where listing_key = ${key} and status = 'queued'
          and not exists (select from listing_photos p where p.listing_key = ${key} and p.status = 'queued')`;
    }
  }
  const left = await queued();
  return { scanned, left, more: more && left > 0 };
}

// Hands what's left to a fresh run of the worker (app/api/imports/run), which
// has more time than whatever asked for the import.
export async function continueImports() {
  const base = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return;
  try {
    await fetch(new URL("/api/imports/run", base), {
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[imports] couldn't hand on", error);
  }
}

// One run, and a hand-off if photos are still waiting when its time is up.
export async function runImportsAndContinue(budgetMs?: number) {
  try {
    const { more } = await runImports({ budgetMs });
    if (more) await continueImports();
  } catch (error) {
    console.error("[imports] run failed", error);
  }
}
