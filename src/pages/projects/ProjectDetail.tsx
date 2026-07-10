import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Clapperboard, Copy, Trash2, Loader2, Hash, Mic, Image as ImageIcon, Captions, Play, Film } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/context/ToastContext";
import { projectService } from "@/services/projectService";
import type { Project } from "@/types";
import { statusBadgeColor } from "@/lib/utils";

// Lazy-loaded so a project's initial load only fetches JS for whichever tab
// is actually open, rather than all eight studio panels up front.
const ScriptStudio = lazy(() => import("@/pages/studio/ScriptStudio"));
const SceneEditor = lazy(() => import("@/pages/studio/SceneEditor"));
const CaptionGenerator = lazy(() => import("@/pages/studio/CaptionGenerator"));
const VoiceoverStudio = lazy(() => import("@/pages/studio/VoiceoverStudio"));
const VisualAssetStudio = lazy(() => import("@/pages/studio/VisualAssetStudio"));
const SubtitleStudio = lazy(() => import("@/pages/studio/SubtitleStudio"));
const TimelineEditor = lazy(() => import("@/pages/studio/TimelineEditor"));
const RenderPanel = lazy(() => import("@/pages/studio/RenderPanel"));

function TabFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
    </div>
  );
}

type Tab = "overview" | "script" | "scenes" | "voiceover" | "visuals" | "subtitles" | "timeline" | "render" | "captions";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const load = () => {
    if (!id) return;
    setLoading(true);
    projectService
      .get(id)
      .then(setProject)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleDuplicate = async () => {
    if (!project) return;
    try {
      const copy = await projectService.duplicate(project);
      showToast("Project duplicated", "success");
      navigate(`/projects/${copy.id}`);
    } catch (e: any) {
      showToast(e.message ?? "Failed to duplicate", "error");
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    try {
      await projectService.remove(project.id);
      showToast("Project deleted", "success");
      navigate("/projects");
    } catch (e: any) {
      showToast(e.message ?? "Failed to delete", "error");
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Loading…">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout title="Project not found">
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate("/projects")}>
          Back to projects
        </Button>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={project.title}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">All projects</span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={handleDuplicate}>
            <span className="hidden sm:inline">Duplicate</span>
          </Button>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={handleDelete}>
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-center gap-3">
          <Badge className={statusBadgeColor(project.status)}>{project.status.replace("_", " ")}</Badge>
          <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{project.video_format}</Badge>
          <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{project.aspect_ratio}</Badge>
          <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{project.duration_target}s target</Badge>
          <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{project.language.toUpperCase()}</Badge>
        </CardBody>
      </Card>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-5 overflow-x-auto no-scrollbar">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")} icon={FileText} label="Overview" />
        <TabButton active={tab === "script"} onClick={() => setTab("script")} icon={FileText} label="Script Studio" />
        <TabButton active={tab === "scenes"} onClick={() => setTab("scenes")} icon={Clapperboard} label="Scene Builder" />
        <TabButton active={tab === "voiceover"} onClick={() => setTab("voiceover")} icon={Mic} label="Voice-over" />
        <TabButton active={tab === "visuals"} onClick={() => setTab("visuals")} icon={ImageIcon} label="Visuals" />
        <TabButton active={tab === "subtitles"} onClick={() => setTab("subtitles")} icon={Captions} label="Subtitles" />
        <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")} icon={Play} label="Timeline & Preview" />
        <TabButton active={tab === "render"} onClick={() => setTab("render")} icon={Film} label="Render" />
        <TabButton active={tab === "captions"} onClick={() => setTab("captions")} icon={Hash} label="Captions & Hashtags" />
      </div>

      {tab === "overview" && (
        <Card>
          <CardBody className="space-y-3 text-sm">
            <Row label="Topic" value={project.topic || "—"} />
            <Row label="Description" value={project.description || "—"} />
            <Row label="Tone" value={project.tone || "—"} />
            <Row label="Final script" value={project.final_script ? `${project.final_script.slice(0, 200)}…` : "Not generated yet — open Script Studio"} />
          </CardBody>
        </Card>
      )}

      <Suspense fallback={<TabFallback />}>
        {tab === "script" && <ScriptStudio project={project} onUpdated={setProject} />}
        {tab === "scenes" && <SceneEditor project={project} onUpdated={setProject} />}
        {tab === "voiceover" && <VoiceoverStudio project={project} onUpdated={setProject} />}
        {tab === "visuals" && <VisualAssetStudio project={project} onUpdated={setProject} />}
        {tab === "subtitles" && <SubtitleStudio project={project} onUpdated={setProject} />}
        {tab === "timeline" && <TimelineEditor project={project} onUpdated={setProject} />}
        {tab === "render" && <RenderPanel project={project} onUpdated={setProject} />}
        {tab === "captions" && <CaptionGenerator project={project} onUpdated={setProject} />}
      </Suspense>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-gray-700 dark:text-gray-200">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary-600 text-primary-700 dark:text-primary-400"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
