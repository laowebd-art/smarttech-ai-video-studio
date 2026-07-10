import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";
import { projectService } from "@/services/projectService";
import { generateCaptionsAndHashtags } from "@/services/aiService";
import type { Project } from "@/types";

export default function CaptionGenerator({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated: (p: Project) => void;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const captions = project.generated_captions;
  const hashtags = project.generated_hashtags ?? [];
  const hooks = project.alternative_hooks ?? [];

  const handleGenerate = async () => {
    if (!project.topic && !project.final_script) {
      showToast("Add a topic or script in Script Studio first", "error");
      return;
    }
    setLoading(true);
    try {
      const result = await generateCaptionsAndHashtags(project.topic ?? "", project.final_script ?? "", project.id);
      const updated = await projectService.update(project.id, {
        generated_captions: {
          youtube: result.youtube,
          tiktok: result.tiktok,
          facebook: result.facebook,
          instagram: result.instagram,
        },
        generated_hashtags: result.hashtags,
        alternative_hooks: result.alternativeHooks,
        short_description: result.shortDescription,
      });
      onUpdated(updated);
      showToast("Captions and hashtags generated", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to generate captions", "error");
    } finally {
      setLoading(false);
    }
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const platformRows: { key: string; label: string; value?: string }[] = [
    { key: "youtube", label: "YouTube Shorts title", value: captions?.youtube },
    { key: "tiktok", label: "TikTok caption", value: captions?.tiktok },
    { key: "facebook", label: "Facebook Reel caption", value: captions?.facebook },
    { key: "instagram", label: "Instagram Reel caption", value: captions?.instagram },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Generate platform-native titles, captions, hashtags, and alternative hooks from your topic and script.
        </p>
        <Button icon={<Sparkles className="h-4 w-4" />} loading={loading} onClick={handleGenerate}>
          {captions ? "Regenerate" : "Generate"}
        </Button>
      </div>

      {!captions ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-gray-400">
            Nothing generated yet — click Generate to create captions and hashtags for this project.
          </CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <CardBody className="space-y-4">
              {platformRows.map((row) => (
                <div key={row.key}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="label-text mb-0">{row.label}</p>
                    <button
                      onClick={() => copy(row.key, row.value ?? "")}
                      className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                    >
                      {copiedKey === row.key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      Copy
                    </button>
                  </div>
                  <p className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200">
                    {row.value}
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-2">
                <p className="label-text mb-0">Hashtags</p>
                <button
                  onClick={() => copy("hashtags", hashtags.join(" "))}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
                >
                  {copiedKey === "hashtags" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copy all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((h) => (
                  <span key={h} className="rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2.5 py-1 text-xs font-medium">
                    {h}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <p className="label-text">Alternative hooks</p>
              <ul className="space-y-2">
                {hooks.map((hook, i) => (
                  <li key={i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200">
                    <span>{hook}</span>
                    <button onClick={() => copy(`hook-${i}`, hook)} className="text-primary-600 hover:text-primary-700 shrink-0 ml-2">
                      {copiedKey === `hook-${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {project.short_description && (
            <Card>
              <CardBody>
                <p className="label-text">Short description</p>
                <p className="text-sm text-gray-700 dark:text-gray-200">{project.short_description}</p>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
