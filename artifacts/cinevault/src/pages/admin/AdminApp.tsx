import { useState } from "react";
import { isAuthenticated } from "@/lib/admin-db";
import { AdminLogin } from "./AdminLogin";
import { AdminLayout, AdminPage } from "./AdminLayout";
import { Dashboard } from "./Dashboard";
import { AddMovie } from "./AddMovie";
import { ManageMovies } from "./ManageMovies";
import { VideoServers } from "./VideoServers";
import { AdminSettings } from "./AdminSettings";

export default function AdminApp() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [page, setPage] = useState<AdminPage>("dashboard");
  const [editMovieId, setEditMovieId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  const navigate = (p: AdminPage) => {
    setPage(p);
    if (p !== "add-movie") setEditMovieId(null);
  };

  const handleEdit = (id: string) => {
    setEditMovieId(id);
    setPage("add-movie");
  };

  const renderPage = () => {
    switch (page) {
      case "dashboard":
        return <Dashboard />;
      case "add-movie":
        return (
          <AddMovie
            editId={editMovieId}
            onSaved={() => { navigate("manage-movies"); }}
          />
        );
      case "manage-movies":
        return <ManageMovies onEdit={handleEdit} />;
      case "video-servers":
        return <VideoServers />;
      case "settings":
        return <AdminSettings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AdminLayout
      currentPage={page}
      onNavigate={navigate}
      onLogout={() => setAuthed(false)}
      editMovieId={editMovieId}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      {renderPage()}
    </AdminLayout>
  );
}
