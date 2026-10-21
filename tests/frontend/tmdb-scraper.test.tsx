// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { discoverFn, genresFn, catalogIdsFn, createJobFn, importAllFn, getJobFn } = vi.hoisted(() => ({
  discoverFn: vi.fn(),
  genresFn: vi.fn(),
  catalogIdsFn: vi.fn(),
  createJobFn: vi.fn(),
  importAllFn: vi.fn(),
  getJobFn: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getTmdbGenres: (...args: unknown[]) => genresFn(...args),
  tmdbDiscover: (...args: unknown[]) => discoverFn(...args),
  createImportJob: (...args: unknown[]) => createJobFn(...args),
  getImportJob: (...args: unknown[]) => getJobFn(...args),
  listImportJobs: vi.fn().mockResolvedValue({ jobs: [] }),
  getTmdbCatalogIds: (...args: unknown[]) => catalogIdsFn(...args),
  importAllTmdbDiscover: (...args: unknown[]) => importAllFn(...args),
  adminListMovies: vi.fn(),
  adminListSeries: vi.fn(),
  bulkDeleteMovies: vi.fn(),
  bulkDeleteSeries: vi.fn(),
  previewCleanupImportedCatalog: vi.fn(),
  cleanupImportedCatalog: vi.fn(),
}));

import TmdbScraper from "@/pages/admin/TmdbScraper";
import type { TmdbDiscoverItem } from "@/lib/api";

/**
 * Explorador de TMDB: la importación es la tarea mas pesada del panel, asi
 * que la paginacion tiene que estar disponible sin bajar hasta el final de la
 * lista y la seleccion debe sobrevivir al cambio de bloque.
 */
function makeItem(index: number): TmdbDiscoverItem {
  return {
    tmdb_id: index,
    title: `Película ${index}`,
    year: "2020",
    rating: 7.5,
    vote_count: 100,
    poster_url: "",
    overview: "",
  };
}

function renderScraper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <TmdbScraper />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function search(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Buscar en TMDB/ }));
  await waitFor(() => expect(screen.getByRole("navigation", { name: "Paginación" })).toBeInTheDocument());
}

describe("Explorador TMDB", () => {
  beforeEach(() => {
    discoverFn.mockReset();
    genresFn.mockReset();
    catalogIdsFn.mockReset();
    createJobFn.mockReset();
    importAllFn.mockReset();
    getJobFn.mockReset();
    genresFn.mockResolvedValue([]);
    catalogIdsFn.mockResolvedValue([]);
    createJobFn.mockResolvedValue({
      job: { id: "job-1", status: "queued", total: 2, processed: 0, imported: 0 },
      invalid: [],
    });
    getJobFn.mockResolvedValue({
      job: { id: "job-1", status: "completed", total: 2, processed: 2, imported: 1 },
    });
    discoverFn.mockImplementation((params: { page: number }) =>
      Promise.resolve({
        ok: true,
        results: [makeItem(params.page * 100 + 1), makeItem(params.page * 100 + 2)],
        total_results: 400,
        total_pages: 4,
        page: params.page,
        count: 500,
      }),
    );
  });

  it("muestra la paginacion antes de la lista de resultados", async () => {
    const user = userEvent.setup();
    renderScraper();
    await search(user);

    const pagination = screen.getByRole("navigation", { name: "Paginación" });
    const firstResult = screen.getByRole("button", { name: /Película 101/ });

    // La paginacion esta antes de la rejilla: no hay que bajar al final.
    expect(pagination.compareDocumentPosition(firstResult) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("conserva la seleccion al cambiar de bloque", async () => {
    const user = userEvent.setup();
    renderScraper();
    await search(user);

    await user.click(screen.getByRole("button", { name: /Película 101/ }));
    expect(screen.getByRole("button", { name: /Importar 1 seleccionado/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Página siguiente" }));

    await waitFor(() => expect(discoverFn).toHaveBeenCalledTimes(2));
    // La seleccion del bloque anterior sigue activa: se puede marcar en varias
    // paginas e importar de una sola vez.
    expect(screen.getByRole("button", { name: /Importar 1 seleccionado/ })).toBeInTheDocument();
  });

  it("descarta la seleccion al cambiar los filtros", async () => {
    const user = userEvent.setup();
    renderScraper();
    await search(user);

    await user.click(screen.getByRole("button", { name: /Película 101/ }));
    expect(screen.getByRole("button", { name: /Importar 1 seleccionado/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Buscar en TMDB/ }));

    await waitFor(() => expect(discoverFn).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /Importar 1 seleccionado/ })).toBeNull();
  });

  it("permite elegir cuantos titulos se muestran por bloque", async () => {
    const user = userEvent.setup();
    renderScraper();
    await search(user);

    expect(discoverFn).toHaveBeenCalledWith(expect.objectContaining({ count: 500, min_votes: 1000 }));

    await user.selectOptions(screen.getByLabelText("Por bloque"), "1000");

    await waitFor(() =>
      expect(discoverFn).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1000 })),
    );
  });

  it("selecciona y quita solo los titulos del bloque visible", async () => {
    const user = userEvent.setup();
    renderScraper();
    await search(user);

    await user.click(screen.getByRole("button", { name: "Seleccionar este bloque" }));
    expect(screen.getByRole("button", { name: /Importar 2 seleccionados/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar este bloque" }));
    expect(screen.queryByRole("button", { name: /Importar 2 seleccionados/ })).toBeNull();
  });

  it("oculta el contenido ya existente y permite iniciar la importación completa", async () => {
    const user = userEvent.setup();
    catalogIdsFn.mockResolvedValue([101]);
    importAllFn.mockResolvedValue({
      ok: true,
      total_found: 400,
      skipped_existing: 120,
      queued: 280,
      job: { id: "job-all", status: "completed", total: 280, processed: 280, imported: 280 },
    });
    renderScraper();
    await search(user);
    await waitFor(() => expect(screen.getByRole("button", { name: /Película 101/ })).toBeInTheDocument());
    await user.click(screen.getByLabelText(/Ocultar títulos que ya están/));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Película 101/ })).toBeNull());

    await user.click(screen.getByRole("button", { name: "Importar todo el listado" }));
    await user.click(await screen.findByRole("button", { name: "Iniciar importación completa" }));

    await waitFor(() =>
      expect(importAllFn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "movie",
          min_votes: 1000,
          exclude_existing: true,
        }),
      ),
    );
    expect(await screen.findByText(/280 \/ 280 · 280 nuevos/)).toBeInTheDocument();
  });
});
