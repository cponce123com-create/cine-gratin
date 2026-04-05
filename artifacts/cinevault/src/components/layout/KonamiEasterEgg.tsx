import { useKonamiCode } from "@/hooks/use-konami-code";
import { useEffect, useState } from "react";
import { Film } from "lucide-react";

export function KonamiEasterEgg() {
  const triggered = useKonamiCode();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!triggered) return;
    setShow(true);
    const timer = setTimeout(() => setShow(false), 5000);
    return () => clearTimeout(timer);
  }, [triggered]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-primary/20 backdrop-blur-sm transition-all duration-500 animate-in fade-in zoom-in">
      <div className="text-center animate-bounce">
        <Film className="w-32 h-32 text-primary mx-auto mb-4 drop-shadow-[0_0_30px_rgba(0,212,255,0.8)]" />
        <h2 className="font-heading text-6xl text-white tracking-widest drop-shadow-[0_0_20px_rgba(0,212,255,0.8)]">
          DIRECTOR'S CUT UNLOCKED
        </h2>
      </div>
    </div>
  );
}
