import { useState } from "react";
import { AdminLogin } from "./AdminLogin";
import { AdminLayout, AdminPage } from "./AdminLayout";
import { Dashboard } from "./Dashboard";
import { AddMovie } from "./AddMovie";
import { BulkImport } from "./BulkImport";
import { ManageMovies } from "./ManageMovies";
import { AddSeries } from "./AddSeries";
import { ManageSeries } from "./ManageSeries";
import { VideoServers } from "./VideoServers";
import { AdminSettings } from "./AdminSettings";

export default function AdminApp() {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem("cv_admin_authed") === "1"; } catch { return false; }
  });
  const [page, setPage] = useState<AdminPage>("dashboard");
  const [editMovieId, setEditMovieId] = useState<string | null>(null);
  const [editSeriesId, setEditSeriesId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!authed) {
    return <AdminLogin onLogin={() => {
      localStorage.setItem("cv_admin_authed", "1");
      setAuthed(true);
    }} />;
  }

  const navigate = (p: AdminPage) => {
    setPage(p);
    if (p !== "add-movie") setEditMovieId(null);
    if (p !== "add-series") setEditSeriesId(null);
  };

  const handleEdit = (id: string) => {
    setEditMovieId(id);
    setPage("add-movie");
  };

  const handleEditSeries = (id: string) => {
    setEditSeriesId(id);
    setPage("add-series");
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
      case "bulk-import":
        return <BulkImport />;
      case "add-series":
        return <AddSeries editId={editSeriesId} onSaved={() => navigate("manage-series")} />;
      case "manage-series":
        return <ManageSeries onEdit={handleEditSeries} />;
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
      onLogout={() => { localStorage.removeItem("cv_admin_authed"); setAuthed(false); }}
      editMovieId={editMovieId}
      editSeriesId={editSeriesId}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      {renderPage()}
    </AdminLayout>
  );
}
