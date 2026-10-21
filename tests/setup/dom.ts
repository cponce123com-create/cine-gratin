/**
 * Setup for the tests that run in a DOM (frontend).
 *
 * It is loaded for every test file, but the DOM-only parts are only installed
 * when there is a document (the backend tests run in node).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}
