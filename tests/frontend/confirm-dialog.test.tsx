// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <ConfirmDialog
        open={open}
        title="Eliminar título"
        description="Se eliminará de forma permanente."
        confirmLabel="Eliminar"
        onConfirm={() => {
          onConfirm();
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  it("se expone como dialogo modal con titulo y descripcion", () => {
    render(<Harness onConfirm={() => undefined} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Eliminar título");

    // La descripcion se asocia al dialogo mediante aria-describedby.
    expect(dialog.getAttribute("aria-describedby")).toBe("confirm-dialog-description");
    const description = document.getElementById("confirm-dialog-description");
    expect(description?.textContent).toContain("Se eliminará");
  });

  it("mueve el foco dentro del dialogo", () => {
    render(<Harness onConfirm={() => undefined} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("se cierra con Escape sin confirmar", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);

    await user.keyboard("{Escape}");

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirma con el boton principal", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
