import { useEffect, useRef, useState } from "react";
import { Film, Play, Download, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { renderService } from "@/services/renderService";
import { projectService } from "@/services/projectService";
import type { Project, RenderJob } from "@/types";
import { formatRelativeTime } from "@/lib/utils";
import type { ExportedVideoWithProject } from "@/services/renderService";

const POLL_MS = 2500;

export default function RenderPanel({ project, onUpdated }: { project: Project; onUpdated: (p: Project) => void }) {
  const { showToast } = useToast();
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [exports, setExports] = useState<ExportedVideoWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const [jobRows, exportRows] = await Promise.all([renderService.listJobs(project.id), renderService.listExports(project.id)]);
      setJobs(jobRows);
      setExports(exportRows);
    } catch (e: any) {
      showToast(e.message ?? "Failed to load render status", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const activeJob = jobs.find((j) => j.status === "queued" || j.status === "rendering");

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeJob) return;

    pollRef.current = setInterval(async () => {
      try {
        const fresh = await renderService.getJob(activeJob.id, project.id);
        setJobs((prev) => prev.map((j) => (j.id === fresh.id ? fresh : j)));
        if (fresh.status === "completed" || fresh.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          load();
          if (fresh.status === "completed") {
            showToast("Render complete! See Export Center to download.", "success");
            const refreshed = await projectService.get(project.id);
            if (refreshed) onUpdated(refreshed);
          } else {
            showToast(fresh.error_message ?? "Render failed", "error");
          }
        }
      } catch {
        /* transient poll failure — try again next tick */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id]);

  const handleStart = async () => {
    setStarting(true);
    try {
      const job = await renderService.start(project.id);
      setJobs((prev) => [job, ...prev]);
      showToast("Render started", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to start render", "error");
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Render this project</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Combines every scene's visual, voice-over, and subtitles into a single 1080×1920 MP4.
            </p>
          </div>
          <Button icon={<Film className="h-4 w-4" />} loading={starting || Boolean(activeJob)} onClick={handleStart}>
            {activeJob ? "Rendering…" : "Render Video"}
          </Button>
        </CardBody>
      </Card>

      {activeJob && (
        <Card>
          <CardBody>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {activeJob.status === "queued" ? "Queued…" : "Rendering…"}
              </span>
              <span className="text-xs text-gray-400">{activeJob.progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className="h-full bg-primary-600 transition-[width] duration-500" style={{ width: `${activeJob.progress}%` }} />
            </div>
          </CardBody>
        </Card>
      )}

      {exports.length > 0 && (
        <Card>
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Rendered videos</h3>
          </div>
          <CardBody className="space-y-3">
            {exports.map((exp) => (
              <ExportRow key={exp.id} exportedVideo={exp} projectId={project.id} />
            ))}
          </CardBody>
        </Card>
      )}

      {jobs.length === 0 ? (
        <EmptyState icon={Play} title="No renders yet" description="Click Render Video above once your scenes, voice-over, and visuals are ready." />
      ) : (
        <Card>
          <div className="p-5 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Render history</h3>
          </div>
          <CardBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {jobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-sm">
                <div className="flex items-center gap-2">
                  {job.status === "completed" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {job.status === "failed" && <AlertCircle className="h-4 w-4 text-red-500" />}
                  {(job.status === "queued" || job.status === "rendering") && <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />}
                  <span className="text-gray-600 dark:text-gray-300">{formatRelativeTime(job.created_at)}</span>
                </div>
                <StatusBadge status={job.status} />
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: RenderJob["status"] }) {
  const map: Record<RenderJob["status"], string> = {
    queued: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    rendering: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}

function ExportRow({ exportedVideo, projectId }: { exportedVideo: ExportedVideoWithProject; projectId: string }) {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await renderService.getDownloadUrl(exportedVideo.id, projectId);
      window.open(url, "_blank");
    } catch (e: any) {
      showToast(e.message ?? "Failed to get download link", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex items-center justify-between text-sm">
      <div>
        <p className="text-gray-700 dark:text-gray-200">
          {exportedVideo.width}×{exportedVideo.height} · {exportedVideo.fps}fps · {exportedVideo.format.toUpperCase()}
        </p>
        <p className="text-xs text-gray-400">{formatRelativeTime(exportedVideo.created_at)}</p>
      </div>
      <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={downloading} onClick={handleDownload}>
        Download
      </Button>
    </div>
  );
}
