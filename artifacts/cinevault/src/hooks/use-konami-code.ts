import { useEffect, useState } from "react";

const KONAMI_CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a"
];

export function useKonamiCode() {
  const [triggered, setTriggered] = useState(false);
  const [sequence, setSequence] = useState<string[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      setSequence((prev) => {
        const next = [...prev, key];
        if (next.length > KONAMI_CODE.length) {
          next.shift();
        }
        
        if (next.join(",") === KONAMI_CODE.join(",")) {
          setTriggered((t) => !t);
          return [];
        }
        
        return next;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return triggered;
}
