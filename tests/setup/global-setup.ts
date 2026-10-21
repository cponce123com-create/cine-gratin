/**
 * Global setup: prepares the isolated test database.
 *
 * The schema is created with the same versioned migrations used in production
 * and the admin user is created with a known password.
 */
const databaseUrl =
  process.env["TEST_DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/cine-gratin-test";

process.env["DATABASE_URL"] = databaseUrl;
process.env["NODE_ENV"] = "test";
process.env["PORT"] = process.env["PORT"] ?? "3999";
process.env["JWT_SECRET"] = "test-only-secret-value-with-32-chars-minimum";

export async function setup(): Promise<void> {
  // The backend modules are used on purpose: they resolve their own
  // dependencies (pg, bcrypt) from the workspace where they are declared.
  const { pool, initDb } = await import("../../backend/src/lib/db");
  const { hashPassword } = await import("../../backend/src/lib/auth-utils");

  try {
    await pool.query("SELECT 1");
  } catch {
    process.env["SKIP_DATABASE_TESTS"] = "true";
    // eslint-disable-next-line no-console
    console.warn("[tests] Base de datos de pruebas no disponible: se ejecutan solo las pruebas unitarias.");
    return;
  }

  process.env["SKIP_DATABASE_TESTS"] = "false";

  await initDb();

  const hash = await hashPassword(process.env["TEST_ADMIN_PASSWORD"] ?? "Test-Admin-2026!");
  await pool.query(
    `INSERT INTO cv_auth (id, username, password) VALUES ('admin', 'admin', $1)
     ON CONFLICT (id) DO UPDATE SET username = 'admin', password = $1`,
    [hash],
  );

  await pool.end();
}

export async function teardown(): Promise<void> {
  // The pool is closed per test file; nothing else to clean up.
}
