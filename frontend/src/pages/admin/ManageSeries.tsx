import AdminLayout from "@/components/admin/AdminLayout";
import MediaManager from "@/components/admin/MediaManager";
import { adminListSeries, bulkDeleteSeries, saveSeries } from "@/lib/api";

export default function ManageSeries() {
  return (
    <AdminLayout>
      <MediaManager
        title="Gestionar series"
        singular="serie"
        plural="series"
        mediaType="series"
        detailPath="/serie"
        listFn={adminListSeries}
        bulkDeleteFn={bulkDeleteSeries}
        saveFn={saveSeries}
      />
    </AdminLayout>
  );
}
