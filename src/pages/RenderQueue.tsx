import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListVideo, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { renderService, type RenderJobWithProject } from "@/services/renderService";
import { formatRelativeTime } from "@/lib/utils";

export default function RenderQueue() {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<RenderJobWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    renderService
      .listJobs()
      .then(setJobs)
      .catch((e) => showToast(e.message ?? "Failed to load render queue", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout title="Render Queue">
      <p className="text-sm text-gray-500 mb-6">Every render job across all your projects, most recent first.</p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={ListVideo}
          title="No render jobs yet"
          description="Open a project's Render tab and click Render Video to queue your first render."
        />
      ) : (
        <Card>
          <CardBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  {job.status === "completed" && <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />}
                  {job.status === "failed" && <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />}
                  {(job.status === "queued" || job.status === "rendering") && (
                    <RefreshCw className="h-5 w-5 text-amber-500 shrink-0 animate-spin" />
                  )}
                  <div className="min-w-0">
                    <Link to={`/projects/${job.project_id}`} className="text-sm font-medium text-gray-900 dark:text-white hover:underline truncate block">
                      {job.project?.title ?? "Untitled project"}
                    </Link>
                    <p className="text-xs text-gray-400">{formatRelativeTime(job.created_at)}</p>
                    {job.status === "failed" && job.error_message && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-md truncate">{job.error_message}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {(job.status === "queued" || job.status === "rendering") && (
                    <span className="text-xs text-gray-400">{job.progress}%</span>
                  )}
                  <StatusBadge status={job.status} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </DashboardLayout>
  );
}

function StatusBadge({ status }: { status: RenderJobWithProject["status"] }) {
  const map: Record<RenderJobWithProject["status"], string> = {
    queued: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    rendering: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}
