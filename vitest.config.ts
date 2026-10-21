import { defineConfig } from "vitest/config";

/**
 * Test configuration.
 *
 * The suite runs against an isolated PostgreSQL database. The connection
 * string comes from `TEST_DATABASE_URL`, so the tests can never touch the
 * production database by accident. When it is not defined, the database tests
 * are skipped and only the unit tests run.
 */
const testDatabaseUrl =
  process.env["TEST_DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/cine-gratin-test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      PORT: "3999",
      // A dedicated secret for the tests: it never touches the real one.
      JWT_SECRET: "test-only-secret-value-with-32-chars-minimum",
      CORS_ORIGINS: "http://localhost:5173",
      // Optional: the import tests are skipped when no key is provided.
      TMDB_API_KEY: process.env["TEST_TMDB_API_KEY"] ?? "",
      LOG_LEVEL: "silent",
    },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // A single fork keeps the tests sequential: they share one database.
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
  },
});
