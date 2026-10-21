/**
 * Static file serving with pre-compressed variants.
 *
 * The build generates a `.br` and a `.gz` copy of every asset, but the
 * dynamic compression middleware does not use them: the server would compress
 * the same file on every request. This middleware serves the pre-compressed
 * variant when the client accepts it, which saves CPU and bandwidth.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";

const COMPRESSIBLE = new Set([
  ".js",
  ".mjs",
  ".css",
  ".html",
  ".json",
  ".svg",
  ".xml",
  ".txt",
  ".webmanifest",
  ".map",
]);

/** Parses the `Accept-Encoding` header. */
function acceptedEncodings(header: string | undefined): Set<string> {
  const accepted = new Set<string>();
  if (!header) return accepted;

  for (const part of header.split(",")) {
    const [encoding, ...params] = part.trim().split(";");
    const name = encoding.trim().toLowerCase();
    if (!name) continue;
    // A quality of 0 means the encoding is not acceptable.
    const q = params
      .map((param) => param.trim())
      .find((param) => param.startsWith("q="))
      ?.slice(2);
    if (q !== undefined && Number(q) === 0) continue;
    accepted.add(name);
  }

  return accepted;
}

/**
 * Returns the middleware that serves the pre-compressed variants of the
 * static files, or null when there is nothing to serve.
 */
export function precompressedStatic(root: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }

    const urlPath = req.path.split("?")[0];
    if (urlPath.includes("..") || urlPath.endsWith("/")) {
      next();
      return;
    }

    const extension = path.extname(urlPath).toLowerCase();
    if (!COMPRESSIBLE.has(extension)) {
      next();
      return;
    }

    const accepted = acceptedEncodings(req.headers["accept-encoding"]);
    const candidates: Array<{ file: string; encoding: string }> = [];

    if (accepted.has("br")) candidates.push({ file: `${urlPath}.br`, encoding: "br" });
    if (accepted.has("gzip")) candidates.push({ file: `${urlPath}.gz`, encoding: "gzip" });

    for (const candidate of candidates) {
      const absolute = path.join(root, candidate.file);
      if (!absolute.startsWith(root)) continue;
      if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;

      // The same policy as the static middleware: the shell is revalidated on
      // every request and the hashed assets are immutable.
      const policy = cachePolicyFor(urlPath);

      // `sendFile` sets its own Cache-Control, so the headers are passed
      // through its options.
      res.sendFile(
        absolute,
        {
          headers: {
            "Content-Encoding": candidate.encoding,
            "Cache-Control": policy,
            Vary: "Accept-Encoding",
          },
        },
        (err) => {
          if (err && !res.headersSent) {
            res.status(404).json({ error: "No encontrado" });
          }
        },
      );
      return;
    }

    next();
  };
}

/**
 * Cache policy of the static files: the shell is revalidated on every request
 * and the hashed assets are immutable.
 */
export function cachePolicyFor(urlPath: string): string {
  if (urlPath.endsWith(".html") || urlPath === "/" || urlPath === "") {
    return "no-cache";
  }
  if (urlPath.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
}
