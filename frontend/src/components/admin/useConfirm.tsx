import { useCallback, useState, type ReactNode } from "react";
import ConfirmDialog from "./ConfirmDialog";

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Confirmation dialog as an asynchronous primitive.
 *
 * It replaces the native `confirm()`, which cannot be styled, is not
 * accessible and blocks the event loop. The returned element has to be
 * rendered once in the page:
 *
 * ```tsx
 * const { confirm, confirmDialog } = useConfirm();
 * if (!(await confirm({ title: "…", description: "…" }))) return;
 * …
 * {confirmDialog}
 * ```
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const close = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const confirmDialog = pending ? (
    <ConfirmDialog
      open
      title={pending.title}
      description={pending.description}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      tone={pending.tone}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
