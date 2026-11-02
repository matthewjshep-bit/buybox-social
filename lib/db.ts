import postgres from "postgres";

const globals = globalThis as unknown as { __sql?: postgres.Sql };

// Shared across route bundles, so the whole process uses one connection pool.
// prepare: false is required by Supabase's transaction pooler.
export const sql = (globals.__sql ??= postgres(process.env.DATABASE_URL ?? "", {
  prepare: false,
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  idle_timeout: 20,
  onnotice: () => {},
}));
