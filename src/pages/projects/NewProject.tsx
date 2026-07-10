import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, TextArea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { projectService } from "@/services/projectService";
import { templateService } from "@/services/templateService";
import type { Template, VideoFormat } from "@/types";

export default function NewProject() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [description, setDescription] = useState("");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("shorts");
  const [duration, setDuration] = useState(30);
  const [language, setLanguage] = useState("en");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    templateService.list().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const project = await projectService.create({
        user_id: user.id,
        title: title || topic || "Untitled Video",
        description,
        topic,
        video_format: videoFormat,
        duration_target: duration,
        language,
        template_id: templateId || null,
      });
      showToast("Project created", "success");
      navigate(`/projects/${project.id}`);
    } catch (err: any) {
      showToast(err.message ?? "Failed to create project", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout title="Create New Video">
      <div className="max-w-2xl">
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Title"
                placeholder="e.g. 5 Morning Habits That Changed My Life"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <TextArea
                label="Topic"
                required
                rows={2}
                placeholder="What is this video about?"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <TextArea
                label="Description (optional)"
                rows={2}
                placeholder="Internal notes about this project"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />

              <div className="grid sm:grid-cols-2 gap-4">
                <Select
                  label="Video format"
                  value={videoFormat}
                  onChange={(e) => setVideoFormat(e.target.value as VideoFormat)}
                >
                  <option value="shorts">YouTube Shorts</option>
                  <option value="tiktok">TikTok</option>
                  <option value="reels">Facebook / Instagram Reels</option>
                </Select>
                <Select label="Duration target" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </Select>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Select label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="en">English</option>
                  <option value="lo">Lao (ລາວ) — coming soon</option>
                </Select>
                <Select label="Template (optional)" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">No template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="submit" loading={loading}>
                  Create project
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </DashboardLayout>
  );
}
