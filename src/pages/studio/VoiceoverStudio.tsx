import { useEffect, useState } from "react";
import { Mic, Sparkles, RefreshCw, Trash2, AlertCircle, Play, Square } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/context/ToastContext";
import { sceneService } from "@/services/sceneService";
import { projectService } from "@/services/projectService";
import { audioService, type VoiceStyle } from "@/services/audioService";
import type { AudioAsset, Project, Scene } from "@/types";

const VOICE_STYLES: { value: VoiceStyle; label: string }[] = [
  { value: "calm", label: "Calm" },
  { value: "serious", label: "Serious" },
  { value: "emotional", label: "Emotional" },
  { value: "energetic", label: "Energetic" },
  { value: "documentary", label: "Documentary" },
  { value: "friendly", label: "Friendly" },
];

export default function VoiceoverStudio({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated: (p: Project) => void;
}) {
  const { showToast } = useToast();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [assets, setAssets] = useState<AudioAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("calm");
  const [busyAll, setBusyAll] = useState(false);
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [previewProvider, setPreviewProvider] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [sceneRows, assetRows] = await Promise.all([sceneService.list(project.id), audioService.list(project.id)]);
      setScenes(sceneRows);
      setAssets(assetRows);
    } catch (e: any) {
      showToast(e.message ?? "Failed to load voice-over data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const assetForScene = (sceneId: string) => assets.find((a) => a.scene_id === sceneId);

  const handleGenerateAll = async () => {
    if (scenes.length === 0) {
      showToast("Build scenes first in Scene Builder", "error");
      return;
    }
    setBusyAll(true);
    try {
      const { results } = await audioService.generateForProject(project.id, voiceStyle);
      const failed = results.filter((r) => r.status === "failed");
      const skipped = results.filter((r) => r.status === "skipped");
      if (failed.length === 0 && skipped.length === 0) {
        showToast(`Generated voice-over for all ${results.length} scenes`, "success");
      } else {
        showToast(`Generated ${results.length - failed.length - skipped.length}/${results.length} scenes — see details below`, "info");
      }
      await load();
      const freshProject = await projectService.get(project.id);
      if (freshProject) onUpdated(freshProject);
    } catch (e: any) {
      showToast(e.message ?? "Failed to generate voice-overs", "error");
    } finally {
      setBusyAll(false);
    }
  };

  const handleGenerateScene = async (scene: Scene) => {
    if (!scene.voiceover_text?.trim()) {
      showToast("Add voice-over text for this scene first", "error");
      return;
    }
    setBusySceneId(scene.id);
    try {
      const { asset } = await audioService.generateForScene(project.id, scene.id, voiceStyle);
      setAssets((prev) => {
        const others = prev.filter((a) => a.scene_id !== scene.id);
        return [...others, asset];
      });
      showToast(`Scene ${scene.scene_number} voice-over ready`, "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to generate voice-over", "error");
    } finally {
      setBusySceneId(null);
    }
  };

  const handlePreview = async () => {
    if (previewAudio) {
      previewAudio.pause();
      setPreviewAudio(null);
      return;
    }
    setPreviewing(true);
    try {
      const { url, provider } = await audioService.preview(voiceStyle);
      const audio = new Audio(url);
      audio.onended = () => setPreviewAudio(null);
      setPreviewAudio(audio);
      setPreviewProvider(provider);
      await audio.play();
    } catch (e: any) {
      showToast(e.message ?? "Failed to preview voice", "error");
    } finally {
      setPreviewing(false);
    }
  };

  const handleDelete = async (asset: AudioAsset) => {
    try {
      await audioService.remove(asset.id, project.id);
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      showToast("Audio deleted", "success");
    } catch (e: any) {
      showToast(e.message ?? "Failed to delete audio", "error");
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-end gap-2 max-w-md">
            <div className="flex-1">
              <Select label="Voice style" value={voiceStyle} onChange={(e) => setVoiceStyle(e.target.value as VoiceStyle)}>
                {VOICE_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              icon={previewAudio ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              loading={previewing}
              onClick={handlePreview}
            >
              {previewAudio ? "Stop" : "Preview"}
            </Button>
          </div>
          {previewProvider && !previewAudio && (
            <p className="text-xs text-gray-400">Last preview was generated by {previewProvider}.</p>
          )}
          <div className="flex justify-end">
            <Button icon={<Sparkles className="h-4 w-4" />} loading={busyAll} onClick={handleGenerateAll}>
              Generate voice-over for all scenes
            </Button>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : scenes.length === 0 ? (
        <EmptyState
          icon={Mic}
          title="No scenes to voice yet"
          description="Build scenes in Scene Builder first, then come back here to generate voice-over audio."
        />
      ) : (
        <div className="space-y-3">
          {scenes.map((scene) => {
            const asset = assetForScene(scene.id);
            return (
              <Card key={scene.id}>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-bold">
                        {scene.scene_number}
                      </span>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Scene {scene.scene_number}</span>
                      {asset && <StatusBadge status={asset.status} />}
                      {asset?.status === "ready" && asset.provider && (
                        <span className="text-xs text-gray-400">via {asset.provider}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleGenerateScene(scene)}
                        disabled={busySceneId === scene.id}
                        className="btn-ghost p-1.5 disabled:opacity-50"
                        aria-label={asset ? "Regenerate audio" : "Generate audio"}
                      >
                        <RefreshCw className={`h-4 w-4 ${busySceneId === scene.id ? "animate-spin" : ""}`} />
                      </button>
                      {asset && (
                        <button
                          onClick={() => handleDelete(asset)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          aria-label="Delete audio"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-300">{scene.voiceover_text || <span className="italic text-gray-400">No voice-over text</span>}</p>

                  {asset?.status === "ready" && <AudioPreview asset={asset} projectId={project.id} />}
                  {asset?.status === "failed" && (
                    <p className="flex items-center gap-1.5 text-xs text-red-500">
                      <AlertCircle className="h-3.5 w-3.5" /> Generation failed — try again.
                    </p>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Voice style is a creative choice — which AI provider actually generates the audio is decided automatically by
        the AI Router (see Settings → AI Providers) with fallback if the primary provider is unavailable. Each
        scene's card shows which provider ended up serving it once ready.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: AudioAsset["status"] }) {
  const map: Record<AudioAsset["status"], string> = {
    queued: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    generating: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    ready: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}

function AudioPreview({ asset, projectId }: { asset: AudioAsset; projectId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    audioService
      .getSignedUrl(asset.id, projectId)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch((e) => {
        if (!cancelled) showToast(e.message ?? "Failed to load audio preview", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.storage_path]);

  if (loading) return <p className="text-xs text-gray-400">Loading preview…</p>;
  if (!url) return null;

  return (
    <audio controls src={url} className="w-full h-9">
      Your browser does not support the audio element.
    </audio>
  );
}
