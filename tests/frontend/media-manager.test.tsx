// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MediaManager from "@/components/admin/MediaManager";
import type { Movie } from "@/lib/types";

/**
 * Catalogue management screen: the filters, the pagination and the bulk
 * deletion (with its scope confirmation) are the critical behaviours.
 */
const listFn = vi.fn();
const bulkDeleteFn = vi.fn();

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
          bulkDeleteFn={bulkDeleteFn as never}
          saveFn={vi.fn() as never}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

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

describe("MediaManager", () => {
  beforeEach(() => {
    listFn.mockReset();
    bulkDeleteFn.mockReset();
    listFn.mockResolvedValue({
      items: [makeMovie(1), makeMovie(2)],
      total: 42,
      page: 1,
      limit: 25,
      pages: 2,
    });
  });

  it("muestra el total del catálogo y los elementos de la página", async () => {
    renderManager();

    await waitFor(() => {
      expect(
        screen.getByText((_, element) => element?.textContent === "42 películas en el catálogo"),
      ).toBeTruthy();
    });
    expect(await screen.findByText("Película 1")).toBeInTheDocument();
  });

  it("envía los filtros al servidor", async () => {
    const user = userEvent.setup();
    renderManager();

    await waitFor(() => expect(listFn).toHaveBeenCalled(), { timeout: 5000 });

    await user.type(screen.getByLabelText(/Buscar por título o IMDb/i), "matrix");

    await waitFor(
      () => {
        const lastCall = listFn.mock.calls[listFn.mock.calls.length - 1][0] as { q?: string };
        expect(lastCall.q).toBe("matrix");
      },
      { timeout: 5000 },
    );
  });

  it("pide confirmación con el alcance antes de borrar", async () => {
    const user = userEvent.setup();
    renderManager();

    await screen.findByText("Película 1");
    await user.click(screen.getByLabelText("Seleccionar Película 1"));

    await user.click(screen.getByRole("button", { name: /Eliminar seleccionadas/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.textContent).toContain("Película 1");

    bulkDeleteFn.mockResolvedValue({ deleted: 1 });
    await user.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(
      () => {
        expect(bulkDeleteFn).toHaveBeenCalledWith(["movie-1"]);
      },
      { timeout: 5000 },
    );
  });

  it("no borra nada si la confirmacion se cancela", async () => {
    const user = userEvent.setup();
    renderManager();

    await screen.findByText("Película 1");
    await user.click(screen.getByLabelText("Seleccionar Película 1"));
    await user.click(screen.getByRole("button", { name: /Eliminar seleccionadas/i }));

    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(bulkDeleteFn).not.toHaveBeenCalled();
  });
});
