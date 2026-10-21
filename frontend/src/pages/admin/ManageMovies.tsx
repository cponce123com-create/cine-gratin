import AdminLayout from "@/components/admin/AdminLayout";
import MediaManager from "@/components/admin/MediaManager";
import { adminListMovies, bulkDeleteMovies, saveMovie } from "@/lib/api";

export default function ManageMovies() {
  return (
    <AdminLayout>
      <MediaManager
        title="Gestionar películas"
        singular="película"
        plural="películas"
        mediaType="movie"
        detailPath="/pelicula"
        listFn={adminListMovies}
        bulkDeleteFn={bulkDeleteMovies}
        saveFn={saveMovie}
      />
    </AdminLayout>
  );
}
