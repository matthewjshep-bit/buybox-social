// Applies pending migrations, then syncs listings from the active source.
// Works against any DATABASE_URL: local PGlite or Supabase.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { activeListingSource } from "../lib/listings/source";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, onnotice: () => {} });

async function migrate() {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table schema_migrations enable row level security`;
  const dir = path.join(process.cwd(), "supabase/migrations");
  for (const name of (await readdir(dir)).sort()) {
    const [done] = await sql`select 1 from schema_migrations where name = ${name}`;
    if (done) continue;
    const text = await readFile(path.join(dir, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    console.log(`applied ${name}`);
  }
}

async function syncListings() {
  const source = activeListingSource();
  let count = 0;
  for await (const listing of source.fetchListings()) {
    await sql`
      insert into listings (listing_key, standard_status, data, updated_at)
      values (${listing.ListingKey}, ${listing.StandardStatus}, ${sql.json(listing as never)}, now())
      on conflict (listing_key) do update
        set standard_status = excluded.standard_status, data = excluded.data, updated_at = now()`;
    count++;
  }
  console.log(`synced ${count} listings from ${source.name}`);
}

async function main() {
  await migrate();
  await syncListings();
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
