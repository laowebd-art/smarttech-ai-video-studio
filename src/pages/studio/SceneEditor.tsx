import { useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, TextArea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/context/ToastContext";
import { sceneService } from "@/services/sceneService";
import { regenerateScene } from "@/services/aiService";
import type { Project, Scene } from "@/types";

export default function SceneEditor({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated: (p: Project) => void;
}) {
  const { showToast } = useToast();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    sceneService
      .list(project.id)
      .then(setScenes)
      .finally(() => setLoading(false));
  };

  useEffect(load, [project.id]);

  const handleAdd = async () => {
    try {
      const scene = await sceneService.create(project.id, scenes.length + 1, {
        voiceover_text: "New scene voice-over text",
        subtitle_text: "New scene subtitle",
      });
      setScenes((prev) => [...prev, scene]);
    } catch (e: any) {
      showToast(e.message ?? "Failed to add scene", "error");
    }
  };

  const handleUpdate = async (id: string, updates: Partial<Scene>) => {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleBlurSave = async (scene: Scene) => {
    try {
      await sceneService.update(scene.id, {
        voiceover_text: scene.voiceover_text,
        subtitle_text: scene.subtitle_text,
        visual_prompt: scene.visual_prompt,
        broll_keyword: scene.broll_keyword,
        duration_seconds: scene.duration_seconds,
        transition_type: scene.transition_type,
        background_music_mood: scene.background_music_mood,
      });
    } catch (e: any) {
      showToast(e.message ?? "Failed to save scene", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await sceneService.remove(id);
      const remaining = scenes.filter((s) => s.id !== id);
      setScenes(remaining);
      await sceneService.reorder(remaining);
      load();
    } catch (e: any) {
      showToast(e.message ?? "Failed to delete scene", "error");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    [next[index], next[target]] = [next[target], next[index]];
    setScenes(next);
    await sceneService.reorder(next);
    load();
  };

  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const handleRegenerate = async (scene: Scene) => {
    setRegeneratingId(scene.id);
    try {
      const result = await regenerateScene(scene.voiceover_text ?? "", project.id, project.tone ?? undefined, project.language);
      const updated = await sceneService.update(scene.id, result);
      setScenes((prev) => prev.map((s) => (s.id === scene.id ? updated : s)));
      showToast("Scene regenerated", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to regenerate scene", "error");
    } finally {
      setRegeneratingId(null);
    }
  };

  const totalDuration = scenes.reduce((sum, s) => sum + Number(s.duration_seconds), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {scenes.length} scene{scenes.length !== 1 ? "s" : ""} · {totalDuration}s total
          {project.duration_target ? ` (target ${project.duration_target}s)` : ""}
        </p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={handleAdd}>
          Add Scene
        </Button>
      </div>

      {loading ? null : scenes.length === 0 ? (
        <EmptyState
          icon={GripVertical}
          title="No scenes yet"
          description='Use "Split Into Scenes" in Script Studio, or add scenes manually here.'
          action={
            <Button icon={<Plus className="h-4 w-4" />} onClick={handleAdd}>
              Add first scene
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {scenes.map((scene, i) => (
            <Card key={scene.id}>
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold">
                      {scene.scene_number}
                    </span>
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Scene {scene.scene_number}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(i, -1)} className="btn-ghost p-1.5" aria-label="Move up">
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => move(i, 1)} className="btn-ghost p-1.5" aria-label="Move down">
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleRegenerate(scene)}
                      disabled={regeneratingId === scene.id}
                      className="btn-ghost p-1.5 disabled:opacity-50"
                      aria-label="Regenerate scene"
                    >
                      <RefreshCw className={`h-4 w-4 ${regeneratingId === scene.id ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      onClick={() => handleDelete(scene.id)}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      aria-label="Delete scene"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <TextArea
                  label="Voice-over text"
                  rows={2}
                  value={scene.voiceover_text ?? ""}
                  onChange={(e) => handleUpdate(scene.id, { voiceover_text: e.target.value })}
                  onBlur={() => handleBlurSave(scenes.find((s) => s.id === scene.id)!)}
                />
                <TextArea
                  label="Subtitle text"
                  rows={2}
                  value={scene.subtitle_text ?? ""}
                  onChange={(e) => handleUpdate(scene.id, { subtitle_text: e.target.value })}
                  onBlur={() => handleBlurSave(scenes.find((s) => s.id === scene.id)!)}
                />
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input
                    label="Visual prompt"
                    value={scene.visual_prompt ?? ""}
                    onChange={(e) => handleUpdate(scene.id, { visual_prompt: e.target.value })}
                    onBlur={() => handleBlurSave(scenes.find((s) => s.id === scene.id)!)}
                  />
                  <Input
                    label="B-roll keyword"
                    value={scene.broll_keyword ?? ""}
                    onChange={(e) => handleUpdate(scene.id, { broll_keyword: e.target.value })}
                    onBlur={() => handleBlurSave(scenes.find((s) => s.id === scene.id)!)}
                  />
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Input
                    label="Duration (s)"
                    type="number"
                    min={1}
                    value={scene.duration_seconds}
                    onChange={(e) => handleUpdate(scene.id, { duration_seconds: Number(e.target.value) })}
                    onBlur={() => handleBlurSave(scenes.find((s) => s.id === scene.id)!)}
                  />
                  <Select
                    label="Transition"
                    value={scene.transition_type}
                    onChange={(e) => {
                      handleUpdate(scene.id, { transition_type: e.target.value as Scene["transition_type"] });
                      handleBlurSave({ ...scene, transition_type: e.target.value as Scene["transition_type"] });
                    }}
                  >
                    <option value="fade">Fade</option>
                    <option value="cut">Cut</option>
                    <option value="slide">Slide</option>
                    <option value="zoom">Zoom</option>
                    <option value="none">None</option>
                  </Select>
                  <Input
                    label="Music mood"
                    value={scene.background_music_mood}
                    onChange={(e) => handleUpdate(scene.id, { background_music_mood: e.target.value })}
                    onBlur={() => handleBlurSave(scenes.find((s) => s.id === scene.id)!)}
                  />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
