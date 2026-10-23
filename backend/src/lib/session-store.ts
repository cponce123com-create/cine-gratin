/**
 * Session revocation.
 *
 * The session token is a stateless JWT, so "logging out" only cleared the
 * cookie: a copy of the token kept working until it expired. This module
 * keeps a small table of revoked session identifiers, which makes the logout
 * effective immediately and across every instance of the service.
 */
import cron from "node-cron";
import { pool } from "./db";
import { logger } from "./logger";
import type { SessionClaims } from "./auth-utils";

/**
 * Marks the session as revoked until its natural expiry.
 * Failures are logged but never break the logout: the cookie is cleared in
 * the client regardless.
 */
export async function revokeSession(claims: SessionClaims | null): Promise<void> {
  if (!claims?.jti) return;

  try {
    await pool.query(
      `INSERT INTO revoked_sessions (jti, expires_at)
       VALUES ($1, to_timestamp($2))
       ON CONFLICT (jti) DO NOTHING`,
      [claims.jti, claims.exp],
    );
  } catch (err) {
    logger.warn({ err }, "Could not revoke the session");
  }
}

/** True when the session identifier has been revoked. */
export async function isSessionRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;

  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM revoked_sessions WHERE jti = $1 AND expires_at > NOW()",
      [jti],
    );
    return rows.length > 0;
  } catch (err) {
    // The revocation list only exists after the migrations run: on the very
    // first boot the session is accepted (the signature and the expiry are
    // still verified). Any other failure is treated as revoked — a fail-closed
    // check, so an unavailable database cannot resurrect a logged-out session.
    if ((err as { code?: string }).code !== "42P01") {
      logger.error({ err }, "Could not check the revocation list: rejecting the session");
      return true;
    }
    logger.warn({ err }, "Revocation list missing, accepting the session");
    return false;
  }
}

/** Removes the expired entries of the revocation list. */
export async function purgeExpiredRevocations(): Promise<number> {
  try {
    const result = await pool.query("DELETE FROM revoked_sessions WHERE expires_at <= NOW()");
    return result.rowCount ?? 0;
  } catch (err) {
    logger.warn({ err }, "Could not purge the revocation list");
    return 0;
  }
}

/**
 * Schedules the daily cleanup of the revocation list.
 *
 * Without it the table only grows, one row per logout, and the check of every
 * authenticated request would get slower over time.
 */
export function startRevocationMaintenance(): void {
  cron.schedule("30 3 * * *", async () => {
    try {
      const purged = await purgeExpiredRevocations();
      if (purged > 0) logger.info({ purged }, "Revocation list purged");
    } catch (err) {
      logger.error({ err }, "Revocation list purge failed");
    }
  });
  logger.info("Session maintenance scheduled (daily at 03:30)");
}
