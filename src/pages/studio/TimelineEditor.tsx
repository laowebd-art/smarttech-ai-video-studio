import { useEffect, useState } from "react";
import { GripVertical, Play, Mic, Image as ImageIcon } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { sceneService } from "@/services/sceneService";
import { visualService } from "@/services/visualService";
import { audioService } from "@/services/audioService";
import { subtitleService } from "@/services/subtitleService";
import type { AudioAsset, Project, Scene, SubtitleAsset, VisualAsset } from "@/types";
import VideoPreview from "./VideoPreview";

export default function TimelineEditor({ project }: { project: Project; onUpdated: (p: Project) => void }) {
  const { showToast } = useToast();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [visualAssets, setVisualAssets] = useState<VisualAsset[]>([]);
  const [audioAssets, setAudioAssets] = useState<AudioAsset[]>([]);
  const [subtitleAsset, setSubtitleAsset] = useState<SubtitleAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sceneRows, visualRows, audioRows, subtitleRow] = await Promise.all([
        sceneService.list(project.id),
        visualService.list(project.id),
        audioService.list(project.id),
        subtitleService.get(project.id),
      ]);
      setScenes(sceneRows);
      setVisualAssets(visualRows);
      setAudioAssets(audioRows);
      setSubtitleAsset(subtitleRow);
    } catch (e: any) {
      showToast(e.message ?? "Failed to load timeline", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...scenes];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setScenes(next);
    setDragIndex(null);
    try {
      await sceneService.reorder(next);
      load();
    } catch (e: any) {
      showToast(e.message ?? "Failed to save new order", "error");
    }
  };

  const handleFieldChange = (sceneId: string, updates: Partial<Scene>) => {
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...updates } : s)));
  };

  const handleFieldSave = async (scene: Scene) => {
    try {
      await sceneService.update(scene.id, {
        duration_seconds: scene.duration_seconds,
        transition_type: scene.transition_type,
        background_music_mood: scene.background_music_mood,
      });
    } catch (e: any) {
      showToast(e.message ?? "Failed to save scene", "error");
    }
  };

  const ordered = scenes.slice().sort((a, b) => a.scene_number - b.scene_number);
  const totalDuration = ordered.reduce((sum, s) => sum + Number(s.duration_seconds || 0), 0);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <EmptyState
        icon={Play}
        title="Nothing to lay out yet"
        description="Build scenes in Scene Builder first — they'll appear here as a reorderable timeline."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {ordered.length} scenes · {totalDuration.toFixed(1)}s total
          {project.duration_target ? ` (target ${project.duration_target}s)` : ""}
        </p>
        <Button icon={<Play className="h-4 w-4" />} onClick={() => setPreviewOpen(true)}>
          Preview
        </Button>
      </div>

      <div className="space-y-2">
        {ordered.map((scene, i) => {
          const visual = visualAssets.find((v) => v.scene_id === scene.id);
          const audio = audioAssets.find((a) => a.scene_id === scene.id);
          return (
            <div
              key={scene.id}
              draggable
              onDragStart={() => handleDragStart(i)}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(i)}
              className="cursor-grab active:cursor-grabbing"
            >
              <Card>
                <CardBody className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 sm:contents">
                    <GripVertical className="h-5 w-5 text-gray-300 shrink-0" />
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold">
                      {scene.scene_number}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{scene.voiceover_text || "—"}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className={`flex items-center gap-1 ${visual ? "text-green-600 dark:text-green-400" : ""}`}>
                          <ImageIcon className="h-3.5 w-3.5" /> {visual ? "visual set" : "no visual"}
                        </span>
                        <span className={`flex items-center gap-1 ${audio?.status === "ready" ? "text-green-600 dark:text-green-400" : ""}`}>
                          <Mic className="h-3.5 w-3.5" /> {audio?.status === "ready" ? "audio ready" : "no audio"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:contents">
                    <div className="sm:w-20 shrink-0">
                      <Input
                        type="number"
                        min={1}
                        value={scene.duration_seconds}
                        onChange={(e) => handleFieldChange(scene.id, { duration_seconds: Number(e.target.value) })}
                        onBlur={() => handleFieldSave(ordered.find((s) => s.id === scene.id)!)}
                      />
                    </div>

                    <div className="sm:w-32 shrink-0">
                      <Select
                        value={scene.transition_type}
                        onChange={(e) => {
                          const updated = { ...scene, transition_type: e.target.value as Scene["transition_type"] };
                          handleFieldChange(scene.id, { transition_type: updated.transition_type });
                          handleFieldSave(updated);
                        }}
                      >
                        <option value="fade">Fade</option>
                        <option value="cut">Cut</option>
                        <option value="slide">Slide</option>
                        <option value="zoom">Zoom</option>
                        <option value="none">None</option>
                      </Select>
                    </div>

                    <div className="sm:w-32 shrink-0">
                      <Input
                        value={scene.background_music_mood}
                        onChange={(e) => handleFieldChange(scene.id, { background_music_mood: e.target.value })}
                        onBlur={() => handleFieldSave(ordered.find((s) => s.id === scene.id)!)}
                        placeholder="music mood"
                      />
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">Drag the grip handle to reorder scenes. Duration, transition, and music mood save automatically on blur.</p>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="9:16 Preview">
        <VideoPreview
          scenes={scenes}
          visualAssets={visualAssets}
          audioAssets={audioAssets}
          subtitleAsset={subtitleAsset}
          projectId={project.id}
        />
      </Modal>
    </div>
  );
}
