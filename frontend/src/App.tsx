import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ProtectedRoute from "@/components/ProtectedRoute";
import Home from "@/pages/Home";
import Movies from "@/pages/Movies";
import Sports from "@/pages/Sports";
import Events from "@/pages/Events";
import SeriesList from "@/pages/SeriesList";
import MovieDetail from "@/pages/MovieDetail";
import SeriesDetail from "@/pages/SeriesDetail";
import Search from "@/pages/Search";
import Player from "@/pages/Player";
import MoviePlayer from "@/pages/player/MoviePlayer";
import SeriesPlayer from "@/pages/player/SeriesPlayer";
import NotFound from "@/pages/NotFound";
import AdminLogin from "@/pages/admin/Login";

// Lazy-load heavy admin pages so they don't bloat the initial bundle
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminImport = lazy(() => import("@/pages/admin/Import"));
const ManageMovies = lazy(() => import("@/pages/admin/ManageMovies"));
const ManageSeries = lazy(() => import("@/pages/admin/ManageSeries"));
const SportChannels = lazy(() => import("@/pages/admin/SportChannels"));
const EventChannels = lazy(() => import("@/pages/admin/EventChannels"));
const TmdbScraper = lazy(() => import("@/pages/admin/TmdbScraper"));
const VidsrcScanner = lazy(() => import("@/pages/admin/VidsrcScanner"));
const ManageSagas = lazy(() => import("@/pages/admin/ManageSagas"));

function AdminFallback() {
  return (
    <div className="min-h-screen bg-brand-dark flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      <Routes>
        {/* Standalone routes — no Navbar/Footer */}
        <Route path="/player/movie/:imdbId" element={<MoviePlayer />} />
        <Route path="/player/series/:imdbId" element={<SeriesPlayer />} />
        <Route path="/player" element={<Player />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <AdminDashboard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/import"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <AdminImport />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/movies"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <ManageMovies />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/series"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <ManageSeries />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/tmdb"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <TmdbScraper />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/sagas"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <ManageSagas />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/vidsrc-scanner"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <VidsrcScanner />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/sport-channels"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <SportChannels />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/event-channels"
          element={
            <ProtectedRoute>
              <Suspense fallback={<AdminFallback />}>
                <EventChannels />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Public site — Navbar + Footer layout */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/peliculas" element={<Movies />} />
          <Route path="/series" element={<SeriesList />} />
          <Route path="/deportes" element={<Sports />} />
          <Route path="/eventos" element={<Events />} />
          <Route path="/pelicula/:id" element={<MovieDetail />} />
          <Route path="/serie/:id" element={<SeriesDetail />} />
          <Route path="/search/:query" element={<Search />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
