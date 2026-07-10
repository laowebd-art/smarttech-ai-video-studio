import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle, FolderKanban, Copy, Trash2, MoreVertical } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { projectService } from "@/services/projectService";
import type { Project } from "@/types";
import { formatRelativeTime, statusBadgeColor } from "@/lib/utils";

export default function ProjectsList() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    setLoading(true);
    projectService
      .list(user.id)
      .then(setProjects)
      .finally(() => setLoading(false));
  };

  useEffect(load, [user]);

  const handleDuplicate = async (p: Project) => {
    setOpenMenuId(null);
    try {
      await projectService.duplicate(p);
      showToast("Project duplicated", "success");
      load();
    } catch (e: any) {
      showToast(e.message ?? "Failed to duplicate project", "error");
    }
  };

  const handleDelete = async (p: Project) => {
    setOpenMenuId(null);
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try {
      await projectService.remove(p.id);
      showToast("Project deleted", "success");
      load();
    } catch (e: any) {
      showToast(e.message ?? "Failed to delete project", "error");
    }
  };

  return (
    <DashboardLayout title="Projects">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        <Link to="/projects/new">
          <Button icon={<PlusCircle className="h-4 w-4" />}>Create New Video</Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create your first AI-generated short video to get started."
          action={
            <Link to="/projects/new">
              <Button icon={<PlusCircle className="h-4 w-4" />}>Create New Video</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="relative overflow-visible">
              <div className="aspect-[9/16] max-h-32 rounded-t-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center relative">
                <span className="text-white/80 text-xs font-medium">{p.aspect_ratio}</span>
                <button
                  onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                  className="absolute top-2 right-2 rounded-full bg-black/30 p-1.5 text-white hover:bg-black/50"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {openMenuId === p.id && (
                  <div className="absolute top-10 right-2 w-40 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg py-1 z-10 text-left">
                    <button
                      onClick={() => handleDuplicate(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicate
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                )}
              </div>
              <Link to={`/projects/${p.id}`} className="block p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate pr-2">{p.title}</h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={statusBadgeColor(p.status)}>{p.status.replace("_", " ")}</Badge>
                  <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {p.video_format}
                  </Badge>
                  <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {p.duration_target}s
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-gray-400">Updated {formatRelativeTime(p.updated_at)}</p>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
