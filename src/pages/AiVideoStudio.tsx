import { useEffect, useRef, useState } from "react";
import { Film, Sparkles, Upload, X, RefreshCw, Download, XCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { TextArea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { videoGenService } from "@/services/videoGenService";
import { providerService, type ProviderStatus } from "@/services/providerService";
import type { AiGenerationJob, VideoGenMode } from "@/types";
import { formatRelativeTime } from "@/lib/utils";

const POLL_MS = 4000;

export default function AiVideoStudio() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<VideoGenMode>("text_to_video");
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<AiGenerationJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    videoGenService
      .listJobs()
      .then(setJobs)
      .catch((e) => showToast(e.message ?? "Failed to load jobs", "error"))
      .finally(() => setLoadingJobs(false));
  };

  useEffect(() => {
    load();
    providerService
      .listStatus()
      .then((all) => setProviders(all.filter((p) => p.capabilities.includes("video_generation"))))
      .catch(() => setProviders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll any active jobs.
  useEffect(() => {
    const active = jobs.filter((j) => j.status === "queued" || j.status === "processing");
    if (active.length === 0) return;
    const interval = setInterval(async () => {
      for (const job of active) {
        try {
          const fresh = await videoGenService.getJob(job.id);
          setJobs((prev) => prev.map((j) => (j.id === fresh.id ? fresh : j)));
        } catch {
          /* transient poll failure — try again next tick */
        }
      }
    }, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.map((j) => `${j.id}:${j.status}`).join(",")]);

  const configuredCount = providers.filter((p) => p.configured).length;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      showToast("Describe the video you want first", "error");
      return;
    }
    if (mode === "image_to_video" && !imageFile) {
      showToast("Upload a source image for image-to-video", "error");
      return;
    }
    if (configuredCount === 0) {
      showToast("No video generation provider is configured on the server yet — see Settings.", "error");
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      if (mode === "image_to_video" && imageFile) {
        imageUrl = await videoGenService.uploadSourceImage(imageFile);
      }
      const job = await videoGenService.generate({
        mode,
        prompt,
        imageUrl,
        durationSeconds: duration,
        aspectRatio,
      });
      setJobs((prev) => [job, ...prev]);
      showToast("Generation started", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to start generation", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="AI Video Studio">
      <div className="space-y-6">
        {providers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-400">Providers:</span>
            {providers.map((p) => (
              <Badge
                key={p.id}
                className={
                  p.configured
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                }
              >
                {p.providerName}
                {!p.configured && " (not configured)"}
              </Badge>
            ))}
          </div>
        )}

        <Card>
          <CardBody className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setMode("text_to_video")}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "text_to_video"
                    ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-500"
                }`}
              >
                Text to video
              </button>
              <button
                onClick={() => setMode("image_to_video")}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  mode === "image_to_video"
                    ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-500"
                }`}
              >
                Image to video
              </button>
            </div>

            <TextArea
              label="Prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A drone shot flying over a misty mountain range at sunrise…"
            />

            {mode === "image_to_video" && (
              <div>
                <label className="label-text">Source image</label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                {imagePreviewUrl ? (
                  <div className="relative inline-block">
                    <img src={imagePreviewUrl} alt="Source" className="h-32 w-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                    <button
                      onClick={() => {
                        setImageFile(null);
                        setImagePreviewUrl(null);
                      }}
                      className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white p-1"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()}>
                    Upload image
                  </Button>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <Select label="Duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
              </Select>
              <Select label="Aspect ratio" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
                <option value="9:16">9:16 (vertical)</option>
                <option value="16:9">16:9 (horizontal)</option>
              </Select>
            </div>

            <div className="flex justify-end">
              <Button icon={<Sparkles className="h-4 w-4" />} loading={submitting} onClick={handleSubmit}>
                Generate video
              </Button>
            </div>
          </CardBody>
        </Card>

        {loadingJobs ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState icon={Film} title="No generations yet" description="Describe a video above and click Generate to get started." />
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} onChange={(updated) => setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function JobCard({ job, onChange }: { job: AiGenerationJob; onChange: (job: AiGenerationJob) => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleRetry = async () => {
    setBusy(true);
    try {
      const updated = await videoGenService.retry(job.id);
      onChange(updated);
      showToast("Retrying generation", "success");
    } catch (e: any) {
      showToast(e.message ?? "Retry failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      const updated = await videoGenService.cancel(job.id);
      onChange(updated);
      showToast("Job cancelled", "info");
    } catch (e: any) {
      showToast(e.message ?? "Cancel failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    setBusy(true);
    try {
      const url = await videoGenService.getDownloadUrl(job.id);
      window.open(url, "_blank");
    } catch (e: any) {
      showToast(e.message ?? "Failed to get download link", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{job.input?.prompt}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
              <span>{job.mode === "text_to_video" ? "Text to video" : "Image to video"}</span>
              {job.provider_name && <span>· via {job.provider_name}</span>}
              <span>· {formatRelativeTime(job.created_at)}</span>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>

        {(job.status === "queued" || job.status === "processing") && (
          <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div className="h-full bg-primary-600 transition-[width] duration-500" style={{ width: `${job.progress || 5}%` }} />
          </div>
        )}

        {job.status === "failed" && job.error_message && (
          <p className="flex items-start gap-1.5 text-xs text-red-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {job.error_message}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {job.status === "completed" && (
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={busy} onClick={handleDownload}>
              Download
            </Button>
          )}
          {(job.status === "failed" || job.status === "cancelled") && job.retry_count < job.max_retries && (
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={handleRetry}>
              Retry ({job.retry_count}/{job.max_retries})
            </Button>
          )}
          {(job.status === "queued" || job.status === "processing") && (
            <Button variant="secondary" icon={<XCircle className="h-4 w-4" />} loading={busy} onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function StatusBadge({ status }: { status: AiGenerationJob["status"] }) {
  const map: Record<AiGenerationJob["status"], string> = {
    queued: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };
  const icon =
    status === "completed" ? (
      <CheckCircle2 className="h-3 w-3" />
    ) : status === "failed" ? (
      <AlertCircle className="h-3 w-3" />
    ) : (status === "queued" || status === "processing") ? (
      <RefreshCw className="h-3 w-3 animate-spin" />
    ) : null;
  return (
    <Badge className={`${map[status]} flex items-center gap-1 shrink-0`}>
      {icon} {status}
    </Badge>
  );
}
