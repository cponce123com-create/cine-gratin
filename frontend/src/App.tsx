import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import Home from "@/pages/Home";
import Movies from "@/pages/Movies";
import SeriesList from "@/pages/SeriesList";
import MovieDetail from "@/pages/MovieDetail";
import SeriesDetail from "@/pages/SeriesDetail";
import Player from "@/pages/Player";
import MoviePlayer from "@/pages/player/MoviePlayer";
import SeriesPlayer from "@/pages/player/SeriesPlayer";
import NotFound from "@/pages/NotFound";
import AdminLogin from "@/pages/admin/Login";
import AdminDashboard from "@/pages/admin/Dashboard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone routes (no Navbar) */}
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

        {/* Public site (with Navbar) */}
        <Route
          path="/*"
          element={
            <>
              <Navbar />
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/peliculas" element={<Movies />} />
                <Route path="/series" element={<SeriesList />} />
                <Route path="/pelicula/:id" element={<MovieDetail />} />
                <Route path="/serie/:id" element={<SeriesDetail />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
