import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
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

// ─── Routes ───────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        {/* Standalone routes (no layout) */}
        <Route
          path="/player/movie/:imdbId"
          element={
            <Suspense fallback={<PageFallback />}>
              <MoviePlayer />
            </Suspense>
          }
        />
        <Route
          path="/player/series/:imdbId"
          element={
            <Suspense fallback={<PageFallback />}>
              <SeriesPlayer />
            </Suspense>
          }
        />
        <Route
          path="/player"
          element={
            <Suspense fallback={<PageFallback />}>
              <Player />
            </Suspense>
          }
        />
        <Route
          path="/admin/login"
          element={
            <Suspense fallback={<PageFallback />}>
              <AdminLogin />
            </Suspense>
          }
        />

        {/* Protected admin routes */}
        <Route path="/admin" element={<AdminPage><AdminDashboard /></AdminPage>} />
        <Route path="/admin/import" element={<AdminPage><AdminImport /></AdminPage>} />
        <Route path="/admin/movies" element={<AdminPage><ManageMovies /></AdminPage>} />
        <Route path="/admin/series" element={<AdminPage><ManageSeries /></AdminPage>} />
        <Route path="/admin/tmdb" element={<AdminPage><TmdbScraper /></AdminPage>} />
        <Route path="/admin/vidsrc-scanner" element={<AdminPage><VidsrcScanner /></AdminPage>} />
        <Route path="/admin/sport-channels" element={<AdminPage><SportChannels /></AdminPage>} />
        <Route path="/admin/event-channels" element={<AdminPage><EventChannels /></AdminPage>} />

        {/* Public routes with Navbar/Footer */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/peliculas" element={<Movies />} />
          <Route path="/series" element={<SeriesList />} />
          <Route path="/deportes" element={<Sports />} />
          <Route path="/eventos" element={<Events />} />
          <Route path="/tv-en-vivo" element={<TvLive />} />
          <Route path="/pelicula/:id" element={<MovieDetail />} />
          <Route path="/serie/:id" element={<SeriesDetail />} />
          <Route path="/search/:query" element={<Search />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
