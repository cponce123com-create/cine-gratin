import { lazy, Suspense, type ReactNode } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  ScrollRestoration,
  type RouteObject,
} from "react-router-dom";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ─── Lazy-loaded pages ───────────────────────────────────────────────────────
const Home = lazy(() => import("@/pages/Home"));
const Movies = lazy(() => import("@/pages/Movies"));
const Sports = lazy(() => import("@/pages/Sports"));
const Events = lazy(() => import("@/pages/Events"));
const TvLive = lazy(() => import("@/pages/TvLive"));
const SeriesList = lazy(() => import("@/pages/SeriesList"));
const MovieDetail = lazy(() => import("@/pages/MovieDetail"));
const SeriesDetail = lazy(() => import("@/pages/SeriesDetail"));
const Search = lazy(() => import("@/pages/Search"));
const Player = lazy(() => import("@/pages/Player"));
const MoviePlayer = lazy(() => import("@/pages/player/MoviePlayer"));
const SeriesPlayer = lazy(() => import("@/pages/player/SeriesPlayer"));
const SagaDetail = lazy(() => import("@/pages/SagaDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const AdminLogin = lazy(() => import("@/pages/admin/Login"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminImport = lazy(() => import("@/pages/admin/Import"));
const ManageMovies = lazy(() => import("@/pages/admin/ManageMovies"));
const ManageSeries = lazy(() => import("@/pages/admin/ManageSeries"));
const SportChannels = lazy(() => import("@/pages/admin/SportChannels"));
const EventChannels = lazy(() => import("@/pages/admin/EventChannels"));
const TmdbScraper = lazy(() => import("@/pages/admin/TmdbScraper"));
const VidsrcScanner = lazy(() => import("@/pages/admin/VidsrcScanner"));
const AdminSagas = lazy(() => import("@/pages/admin/AdminSagas"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function PageFallback() {
  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/** Wraps a component in Suspense + ErrorBoundary (no auth). */
function Suspended({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/** Wraps an admin page in ProtectedRoute + ErrorBoundary + Suspense. */
function AdminPage({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <ErrorBoundary>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </ErrorBoundary>
    </ProtectedRoute>
  );
}

function PublicLayout() {
  return (
    <>
      <Navbar />
      <Suspended>
        <Outlet />
      </Suspended>
      <Footer />
    </>
  );
}

/** Root layout — renders ScrollRestoration for all routes. */
function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
  // Standalone routes (no layout)
  {
    path: "/player/movie/:imdbId",
    element: (
      <Suspense fallback={<PageFallback />}>
        <MoviePlayer />
      </Suspense>
    ),
  },
  {
    path: "/player/series/:imdbId",
    element: (
      <Suspense fallback={<PageFallback />}>
        <SeriesPlayer />
      </Suspense>
    ),
  },
  {
    path: "/player",
    element: (
      <Suspense fallback={<PageFallback />}>
        <Player />
      </Suspense>
    ),
  },
  {
    path: "/admin/login",
    element: (
      <Suspense fallback={<PageFallback />}>
        <AdminLogin />
      </Suspense>
    ),
  },

  // Protected admin routes
  {
    path: "/admin",
    element: (
      <AdminPage>
        <AdminDashboard />
      </AdminPage>
    ),
  },
  {
    path: "/admin/import",
    element: (
      <AdminPage>
        <AdminImport />
      </AdminPage>
    ),
  },
  {
    path: "/admin/movies",
    element: (
      <AdminPage>
        <ManageMovies />
      </AdminPage>
    ),
  },
  {
    path: "/admin/series",
    element: (
      <AdminPage>
        <ManageSeries />
      </AdminPage>
    ),
  },
  {
    path: "/admin/tmdb",
    element: (
      <AdminPage>
        <TmdbScraper />
      </AdminPage>
    ),
  },
  {
    path: "/admin/vidsrc-scanner",
    element: (
      <AdminPage>
        <VidsrcScanner />
      </AdminPage>
    ),
  },
  {
    path: "/admin/sport-channels",
    element: (
      <AdminPage>
        <SportChannels />
      </AdminPage>
    ),
  },
  {
    path: "/admin/event-channels",
    element: (
      <AdminPage>
        <EventChannels />
      </AdminPage>
    ),
  },
  {
    path: "/admin/sagas",
    element: (
      <AdminPage>
        <AdminSagas />
      </AdminPage>
    ),
  },

  // Public routes with Navbar/Footer
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/peliculas", element: <Movies /> },
      { path: "/series", element: <SeriesList /> },
      { path: "/deportes", element: <Sports /> },
      { path: "/eventos", element: <Events /> },
      { path: "/tv-en-vivo", element: <TvLive /> },
      { path: "/pelicula/:id", element: <MovieDetail /> },
      { path: "/serie/:id", element: <SeriesDetail /> },
      { path: "/search/:query", element: <Search /> },
      { path: "/saga/:id", element: <SagaDetail /> },
      { path: "*", element: <NotFound /> },
    ],
  },
    ],
  },
];

const router = createBrowserRouter(routes);

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </>
  );
}
