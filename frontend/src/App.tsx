import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
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
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminImport from "@/pages/admin/Import";
import ManageMovies from "@/pages/admin/ManageMovies";
import ManageSeries from "@/pages/admin/ManageSeries";
import SportChannels from "@/pages/admin/SportChannels";
import EventChannels from "@/pages/admin/EventChannels";
import TmdbScraper from "@/pages/admin/TmdbScraper";

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
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/import"
          element={
            <ProtectedRoute>
              <AdminImport />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/movies"
          element={
            <ProtectedRoute>
              <ManageMovies />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/series"
          element={
            <ProtectedRoute>
              <ManageSeries />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/tmdb"
          element={
            <ProtectedRoute>
              <TmdbScraper />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/sport-channels"
          element={
            <ProtectedRoute>
              <SportChannels />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/event-channels"
          element={
            <ProtectedRoute>
              <EventChannels />
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
