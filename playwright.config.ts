import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DB_PORT = 54330;
const DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;

// Set PLAYWRIGHT_CHROMIUM to reuse a browser you already have installed.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
  },
  // A throwaway in-memory database, then the production build.
  webServer: [
    {
      command: `pnpm exec pglite-server --port=${DB_PORT}`,
      port: DB_PORT,
      reuseExistingServer: false,
    },
    {
      command: `sleep 2 && pnpm exec tsx scripts/db-setup.ts && pnpm exec next start -p ${PORT} 2>&1 | tee test-results-server.log`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        DATABASE_URL,
        DATABASE_POOL_MAX: "1",
        APP_URL: `http://localhost:${PORT}`,
        ALLOW_DEV_LOGIN: "true",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      },
    },
  ],
});
