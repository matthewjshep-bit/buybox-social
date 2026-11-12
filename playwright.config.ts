import { defineConfig, devices } from "@playwright/test";

// E2E_PORT and E2E_DB_PORT let two copies of the app run their tests at once.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 54330);
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
    // A stuck click fails fast and says which step, instead of eating the test's whole timeout.
    actionTimeout: 10_000,
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
        // Sign-in with the test password, while emails aren't set up (e2e/test-sign-in.spec.ts).
        TEST_SIGN_IN_PASSWORD: "e2e-test-password",
        SUPABASE_URL: "",
        SUPABASE_PUBLISHABLE_KEY: "",
        // Never the model, even with a key in the shell: taste descriptions come from the template.
        ANTHROPIC_API_KEY: "",
        // A home that's sold, beside the sample homes for sale (scripts/db-setup.ts).
        E2E_FIXTURES: "true",
      },
    },
  ],
});
