import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, FileVideo, Clapperboard, Clock, PlusCircle, HardDrive, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { projectService } from "@/services/projectService";
import type { Project } from "@/types";
import { formatRelativeTime, statusBadgeColor } from "@/lib/utils";

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    projectService
      .list(user.id)
      .then(setProjects)
      .finally(() => setLoading(false));
  }, [user]);

  const totalProjects = projects.length;
  const draftVideos = projects.filter((p) => p.status === "draft").length;
  const renderedVideos = projects.filter((p) => p.status === "rendered").length;
  const totalMinutes = projects.reduce((sum, p) => sum + p.duration_target / 60, 0);

  const stats = [
    { label: "Total Projects", value: totalProjects, icon: FolderKanban, color: "text-primary-600 bg-primary-50 dark:bg-primary-900/30" },
    { label: "Draft Videos", value: draftVideos, icon: FileVideo, color: "text-amber-600 bg-amber-50 dark:bg-amber-900/30" },
    { label: "Rendered Videos", value: renderedVideos, icon: Clapperboard, color: "text-green-600 bg-green-50 dark:bg-green-900/30" },
    { label: "Minutes Generated", value: totalMinutes.toFixed(1), icon: Clock, color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30" },
  ];

  return (
    <DashboardLayout title={`Welcome back${profile?.display_name ? ", " + profile.display_name : ""}`}>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">Here's what's happening with your videos.</p>
        <Link to="/projects/new">
          <Button icon={<PlusCircle className="h-4 w-4" />}>Create New Video</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody className="flex items-center gap-4">
              <div className={`rounded-lg p-2.5 ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardBody>
            <div className="flex items-center gap-2 mb-3">
              <HardDrive className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Storage usage</h3>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <div className="h-full w-[8%] rounded-full bg-primary-500" />
            </div>
            <p className="mt-2 text-xs text-gray-400">Connect Supabase Storage to see real usage. (Placeholder)</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">AI usage</h3>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">0</p>
            <p className="text-xs text-gray-400">requests this month (Placeholder — Phase 2)</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Recent projects</h3>
          <Link to="/projects" className="text-sm font-medium text-primary-600 hover:underline">
            View all
          </Link>
        </div>
        <CardBody>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
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
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {projects.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-2 py-3 first:pt-0 last:pb-0 hover:opacity-80"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.title}</p>
                    <p className="text-xs text-gray-400">{formatRelativeTime(p.updated_at)}</p>
                  </div>
                  <Badge className={`${statusBadgeColor(p.status)} shrink-0`}>{p.status.replace("_", " ")}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </DashboardLayout>
  );
}
