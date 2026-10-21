// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import axe from "axe-core";
import MediaManager from "@/components/admin/MediaManager";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { Movie } from "@/lib/types";

/**
 * Automatic accessibility audit (axe-core) of the administration screens.
 *
 * It complements the manual review: the rules that can be checked in jsdom
 * (names of the controls, roles, contrast-independent issues, labels) are
 * verified automatically.
 */
const listFn = vi.fn();

function makeMovie(index: number): Movie {
  return {
    id: `movie-${index}`,
    imdb_id: `tt000000${index}`,
    title: `Película ${index}`,
    year: 2000 + index,
    rating: 7,
    views: index,
    poster_url: "",
    genres: ["Accion"],
    vidsrc_status: "unknown",
  };
}

function renderManager() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <MediaManager
          title="Gestionar películas"
          singular="película"
          plural="películas"
          mediaType="movie"
          detailPath="/pelicula"
          listFn={listFn as never}
          bulkDeleteFn={vi.fn() as never}
          saveFn={vi.fn() as never}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("accesibilidad del panel", () => {
  it("el gestor de catálogo no tiene violaciones de axe", async () => {
    listFn.mockResolvedValue({
      items: [makeMovie(1), makeMovie(2)],
      total: 42,
      page: 1,
      limit: 25,
      pages: 2,
    });

    const { container } = renderManager();
    await waitFor(() => expect(screen.getByText("Película 1")).toBeInTheDocument());

    const results = await axe.run(container, {
      rules: {
        // The colour rules need a real renderer: jsdom cannot compute them.
        "color-contrast": { enabled: false },
      },
    });

    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  it("el dialogo de confirmación no tiene violaciones de axe", async () => {
    render(
      <ConfirmDialog
        open
        title="Eliminar título"
        description="Se eliminará de forma permanente."
        confirmLabel="Eliminar"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const results = await axe.run(document.body, {
      rules: {
        "color-contrast": { enabled: false },
      },
    });

    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });

  it("el diálogo se puede usar sólo con el teclado", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open
        title="Eliminar título"
        description="Se eliminará de forma permanente."
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});
