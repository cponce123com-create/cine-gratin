import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Home from "@/pages/Home";
import Movies from "@/pages/Movies";
import SeriesList from "@/pages/SeriesList";
import MovieDetail from "@/pages/MovieDetail";
import SeriesDetail from "@/pages/SeriesDetail";
import Player from "@/pages/Player";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/player" element={<Player />} />
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
