import { useEffect, useState } from "react";
import { Captions, Sparkles, Download, FileJson } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { sceneService } from "@/services/sceneService";
import { subtitleService, type SubtitleSettings } from "@/services/subtitleService";
import type { Project, Scene, SubtitleAsset } from "@/types";
import { formatDuration } from "@/lib/utils";

const STYLE_OPTIONS: { value: SubtitleAsset["style"]; label: string }[] = [
  { value: "clean", label: "Clean" },
  { value: "bold", label: "Bold" },
  { value: "yellow_highlight", label: "Yellow highlight" },
  { value: "white_shadow", label: "White with shadow" },
];

export default function SubtitleStudio({ project }: { project: Project; onUpdated: (p: Project) => void }) {
  const { showToast } = useToast();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [subtitleAsset, setSubtitleAsset] = useState<SubtitleAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [style, setStyle] = useState<SubtitleAsset["style"]>("bold");
  const [position, setPosition] = useState<SubtitleAsset["position"]>("bottom");
  const [fontSize, setFontSize] = useState(42);

  const load = async () => {
    setLoading(true);
    try {
      const [sceneRows, existing] = await Promise.all([sceneService.list(project.id), subtitleService.get(project.id)]);
      setScenes(sceneRows);
      if (existing) {
        setSubtitleAsset(existing);
        setStyle(existing.style);
        setPosition(existing.position);
        setFontSize(existing.font_size);
      }
    } catch (e: any) {
      showToast(e.message ?? "Failed to load subtitles", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const handleGenerate = async () => {
    if (scenes.length === 0) {
      showToast("Build scenes first in Scene Builder", "error");
      return;
    }
    setGenerating(true);
    try {
      const settings: SubtitleSettings = { style, position, fontSize };
      const asset = await subtitleService.generate(project.id, scenes, settings);
      setSubtitleAsset(asset);
      showToast("Subtitles generated", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to generate subtitles", "error");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Select label="Style" value={style} onChange={(e) => setStyle(e.target.value as SubtitleAsset["style"])}>
              {STYLE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select label="Position" value={position} onChange={(e) => setPosition(e.target.value as SubtitleAsset["position"])}>
              <option value="top">Top</option>
              <option value="center">Center</option>
              <option value="bottom">Bottom</option>
            </Select>
            <Input label="Font size (px)" type="number" min={16} max={96} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
          </div>
          <div className="flex justify-end gap-2">
            {subtitleAsset && (
              <>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => subtitleService.downloadSrt(subtitleAsset, project.title)}>
                  Download SRT
                </Button>
                <Button variant="secondary" icon={<FileJson className="h-4 w-4" />} onClick={() => subtitleService.downloadJson(subtitleAsset, project.title)}>
                  Download JSON
                </Button>
              </>
            )}
            <Button icon={<Sparkles className="h-4 w-4" />} loading={generating} onClick={handleGenerate}>
              {subtitleAsset ? "Regenerate subtitles" : "Generate subtitles"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {!subtitleAsset ? (
        <EmptyState
          icon={Captions}
          title="No subtitles yet"
          description="Generate subtitles from your scenes — timing is calculated from each scene's duration."
        />
      ) : (
        <Card>
          <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Preview</h3>
            <span className="text-xs text-gray-400">
              {subtitleAsset.timing_json.length} caption{subtitleAsset.timing_json.length !== 1 ? "s" : ""}
            </span>
          </div>
          <CardBody className="space-y-2">
            {subtitleAsset.timing_json.map((entry) => (
              <div key={entry.scene_id} className="flex items-start gap-3 text-sm">
                <span className="shrink-0 font-mono text-xs text-gray-400 pt-0.5 w-28">
                  {formatDuration(entry.start)}–{formatDuration(entry.end)}
                </span>
                <span
                  className={
                    style === "bold"
                      ? "font-bold text-gray-800 dark:text-gray-100"
                      : style === "yellow_highlight"
                      ? "bg-yellow-200 dark:bg-yellow-900/50 px-1 rounded font-semibold text-gray-900 dark:text-yellow-200"
                      : style === "white_shadow"
                      ? "text-gray-800 dark:text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]"
                      : "text-gray-700 dark:text-gray-200"
                  }
                >
                  {entry.text}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
