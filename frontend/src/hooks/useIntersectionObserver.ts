import { useEffect, useRef, useState } from "react";

/**
 * Hook que usa Intersection Observer para detectar cuando un elemento entra en el viewport.
 * Útil para lazy loading de componentes pesados como carruseles.
 */
export function useIntersectionObserver(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        // Una vez visible, desuscribirse para no seguir observando
        if (ref.current) {
          observer.unobserve(ref.current);
        }
      }
    }, {
      threshold: 0.01, // Activar cuando al menos el 1% sea visible
      ...options,
    });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [options]);

  return { ref, isVisible };
}
