import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { templateService } from "@/services/templateService";
import { projectService } from "@/services/projectService";
import type { Template } from "@/types";

export default function Templates() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    templateService
      .list()
      .then(setTemplates)
      .catch((e) => showToast(e.message ?? "Failed to load templates. Have you run the seed SQL?", "error"))
      .finally(() => setLoading(false));
  }, []);

  const useTemplate = async (t: Template) => {
    if (!user) return;
    try {
      const project = await projectService.create({
        user_id: user.id,
        title: t.name,
        tone: t.default_tone,
        duration_target: t.default_duration,
        template_id: t.id,
      });
      navigate(`/projects/${project.id}`);
    } catch (e: any) {
      showToast(e.message ?? "Failed to create project from template", "error");
    }
  };

  return (
    <DashboardLayout title="Templates">
      <p className="text-sm text-gray-500 mb-6">
        Start from a reusable structure — tone, subtitle style, scene roles, and music mood are pre-filled.
      </p>
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title="No templates found"
          description="Run supabase/seed/templates.sql against your Supabase project to load the 8 default templates."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => useTemplate(t)}>
              <CardBody>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{t.name}</h3>
                  {t.is_system && <Badge className="bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">system</Badge>}
                </div>
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{t.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{t.default_tone}</Badge>
                  <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{t.default_duration}s</Badge>
                  <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{t.default_subtitle_style.replace("_", " ")}</Badge>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
