import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Unique id of the title, used by aria-labelledby. */
  titleId: string;
  children: ReactNode;
  className?: string;
  /** Hide the default close button (the content provides its own). */
  hideCloseButton?: boolean;
  closeLabel?: string;
}

/**
 * Accessible modal dialog.
 *
 * - `role="dialog"` and `aria-modal` with the title associated.
 * - The focus moves into the dialog and is trapped inside it.
 * - Escape and the backdrop close it.
 * - The scroll of the page is locked while it is open and the focus returns
 *   to the element that opened it.
 */
export default function Modal({
  open,
  onClose,
  title,
  titleId,
  children,
  className = "max-w-4xl",
  hideCloseButton = false,
  closeLabel = "Cerrar",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusables?.[0] ?? dialogRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full ${className} bg-brand-card border border-brand-border rounded-2xl shadow-2xl`}
      >
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute -top-2 right-2 z-10 rounded-full bg-brand-card border border-brand-border p-1.5 text-gray-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-red"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
