import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Test configuration.
 *
 * The suite runs against an isolated PostgreSQL database. The connection
 * string comes from `TEST_DATABASE_URL`, so the tests can never touch the
 * production database by accident. When it is not defined, the database tests
 * are skipped and only the unit tests run.
 *
 * The frontend tests use jsdom (declared per file with the
 * `@vitest-environment` docblock).
 */
const testDatabaseUrl =
  process.env["TEST_DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/cine-gratin-test";

export default defineConfig({
  // The component tests use JSX: the automatic runtime is required (the
  // classic one expects a React variable in scope).
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend/src"),
      // A single copy of React for the component tests: the components live in
      // the frontend workspace and the tests in the root one, so both have to
      // resolve to the same instance.
      react: path.resolve(__dirname, "frontend/node_modules/react"),
      "react-dom": path.resolve(__dirname, "frontend/node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "frontend/node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "frontend/node_modules/react/jsx-dev-runtime.js"),
      // The runtime dependencies of the components live in the frontend
      // workspace: they are aliased so the tests resolve the same instances.
      "@tanstack/react-query": path.resolve(__dirname, "frontend/node_modules/@tanstack/react-query"),
      "react-router-dom": path.resolve(__dirname, "frontend/node_modules/react-router-dom"),
      "lucide-react": path.resolve(__dirname, "frontend/node_modules/lucide-react"),
      sonner: path.resolve(__dirname, "frontend/node_modules/sonner"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globalSetup: ["tests/setup/global-setup.ts"],
    setupFiles: ["tests/setup/dom.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      PORT: "3999",
      // A dedicated secret for the tests: it never touches the real one.
      JWT_SECRET: "test-only-secret-value-with-32-chars-minimum",
      CORS_ORIGINS: "http://localhost:5173",
      // The import tests need a TMDB key. It comes from TEST_TMDB_API_KEY (a
      // dedicated secret for the tests): with an empty key those tests are
      // skipped explicitly instead of failing.
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
