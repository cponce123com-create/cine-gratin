/**
 * Setup for the tests that run in a DOM (frontend).
 *
 * It is loaded for every test file, but the DOM-only parts are only installed
 * when there is a document (the backend tests run in node).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof document !== "undefined") {
  const { cleanup, configure } = await import("@testing-library/react");

  // The CI runners are slower than a local machine: the default timeout of
  // 1 s is too tight for the queries that wait for a re-render.
  configure({ asyncUtilTimeout: 5000 });

  // jsdom does not implement scrollIntoView: the components that scroll to a
  // section need a stub (the real one depends on the browser).
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }

  afterEach(() => {
    cleanup();
  });
}
