import postgres from "postgres";

const globals = globalThis as unknown as { __sql?: postgres.Sql };

// Shared across route bundles, so the whole process uses one connection pool.
// prepare: false is required by Supabase's transaction pooler.
export const sql = (globals.__sql ??= postgres(process.env.DATABASE_URL ?? "", {
  prepare: false,
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  // One query at a time per connection. By default several are sent down a
  // busy connection at once, which Supabase's transaction pooler can stall
  // on, hanging every request after it. Extra queries wait for a free one.
  max_pipeline: 1,
  // A database that's out of reach or saturated fails fast instead of hanging.
  connect_timeout: 10,
  queue_timeout: 20,
  idle_timeout: 20,
  onnotice: () => {},
}));
