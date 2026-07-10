import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Copy, Check, FileText, Captions, RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { renderService, type ExportedVideoWithProject } from "@/services/renderService";
import { projectService } from "@/services/projectService";
import { subtitleService } from "@/services/subtitleService";
import { formatRelativeTime } from "@/lib/utils";

export default function ExportCenter() {
  const { showToast } = useToast();
  const [exports, setExports] = useState<ExportedVideoWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    renderService
      .listExports()
      .then(setExports)
      .catch((e) => showToast(e.message ?? "Failed to load exports", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardLayout title="Export Center">
      <p className="text-sm text-gray-500 mb-6">Every rendered video across all your projects, ready to download and publish.</p>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : exports.length === 0 ? (
        <EmptyState
          icon={Download}
          title="Nothing rendered yet"
          description="Once a project finishes rendering (see its Render tab), the final MP4 and captions will show up here."
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {exports.map((exp) => (
            <ExportCard key={exp.id} exportedVideo={exp} />
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-gray-400 max-w-lg mx-auto text-center">
        Disclaimer: you are responsible for ensuring you have the rights to any music, footage, or likeness used in
        exported content, and for complying with each platform's policies before publishing.
      </p>
    </DashboardLayout>
  );
}

function ExportCard({ exportedVideo }: { exportedVideo: ExportedVideoWithProject }) {
  const { showToast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [exportingScript, setExportingScript] = useState(false);
  const [exportingSrt, setExportingSrt] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await renderService.getDownloadUrl(exportedVideo.id, exportedVideo.project_id);
      window.open(url, "_blank");
    } catch (e: any) {
      showToast(e.message ?? "Failed to get download link", "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleRegenerate = async () => {
    setRendering(true);
    try {
      await renderService.start(exportedVideo.project_id);
      showToast("New render started — check the project's Render tab for progress", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to start render", "error");
    } finally {
      setRendering(false);
    }
  };

  const handleExportScript = async () => {
    setExportingScript(true);
    try {
      const project = await projectService.get(exportedVideo.project_id);
      if (!project?.final_script) {
        showToast("This project has no final script yet", "error");
        return;
      }
      downloadText(project.final_script, `${project.title || "script"}.txt`, "text/plain");
    } catch (e: any) {
      showToast(e.message ?? "Failed to export script", "error");
    } finally {
      setExportingScript(false);
    }
  };

  const handleExportSrt = async () => {
    setExportingSrt(true);
    try {
      const asset = await subtitleService.get(exportedVideo.project_id);
      if (!asset?.srt_text) {
        showToast("This project has no subtitles generated yet", "error");
        return;
      }
      subtitleService.downloadSrt(asset, exportedVideo.project?.title || "subtitles");
    } catch (e: any) {
      showToast(e.message ?? "Failed to export subtitles", "error");
    } finally {
      setExportingSrt(false);
    }
  };

  const captionRows = [
    { key: "youtube", label: "YouTube", value: exportedVideo.caption_youtube },
    { key: "tiktok", label: "TikTok", value: exportedVideo.caption_tiktok },
    { key: "facebook", label: "Facebook", value: exportedVideo.caption_facebook },
    { key: "instagram", label: "Instagram", value: exportedVideo.caption_instagram },
  ].filter((r) => r.value);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <Link to={`/projects/${exportedVideo.project_id}`} className="text-sm font-semibold text-gray-900 dark:text-white hover:underline truncate">
            {exportedVideo.project?.title ?? "Untitled project"}
          </Link>
          <span className="text-xs text-gray-400 shrink-0">{formatRelativeTime(exportedVideo.created_at)}</span>
        </div>

        <p className="text-xs text-gray-400">
          {exportedVideo.width}×{exportedVideo.height} · {exportedVideo.fps}fps · {exportedVideo.format.toUpperCase()}
        </p>

        {captionRows.length > 0 && (
          <div className="space-y-1.5">
            {captionRows.map((r) => (
              <div key={r.key} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-1.5">
                <span className="text-xs text-gray-600 dark:text-gray-300 truncate pr-2">
                  <span className="font-medium">{r.label}:</span> {r.value}
                </span>
                <button onClick={() => copy(r.key, r.value ?? "")} className="text-primary-600 shrink-0">
                  {copiedKey === r.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {exportedVideo.hashtags && exportedVideo.hashtags.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {exportedVideo.hashtags.slice(0, 6).map((h) => (
                <span key={h} className="rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 text-xs">
                  {h}
                </span>
              ))}
            </div>
            <button onClick={() => copy("hashtags", exportedVideo.hashtags!.join(" "))} className="text-primary-600 shrink-0 ml-2">
              {copiedKey === "hashtags" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button icon={<Download className="h-4 w-4" />} loading={downloading} onClick={handleDownload}>
            Download MP4
          </Button>
          <Button variant="secondary" icon={<FileText className="h-4 w-4" />} loading={exportingScript} onClick={handleExportScript}>
            Script
          </Button>
          <Button variant="secondary" icon={<Captions className="h-4 w-4" />} loading={exportingSrt} onClick={handleExportSrt}>
            SRT
          </Button>
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={rendering} onClick={handleRegenerate}>
            Regenerate
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
