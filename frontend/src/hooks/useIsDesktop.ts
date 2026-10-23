import { useCallback, useSyncExternalStore } from "react";

/**
 * True when the viewport is at least `minWidth` pixels wide.
 *
 * Some screens render a different layout for mobile and desktop. Duplicating
 * the markup of both layouts (hiding one with CSS) mounts **every** component
 * twice — including players, which then open two streams at once — and breaks
 * the accessibility tree (repeated ids, several `<h1>`). Rendering only the
 * layout that matches the current viewport avoids that.
 *
 * `matchMedia` is an external store, so it is read through
 * `useSyncExternalStore`: no state is set inside an effect and there is no
 * tearing between the first paint and the subscription. It defaults to the
 * desktop layout when `matchMedia` is unavailable.
 */
export default function useIsDesktop(minWidth = 768): boolean {
  const query = `(min-width: ${minWidth}px)`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = useCallback(() => true, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
