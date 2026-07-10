import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, X } from "lucide-react";
import { visualService } from "@/services/visualService";
import { audioService } from "@/services/audioService";
import type { AudioAsset, Scene, SubtitleAsset, VisualAsset } from "@/types";

const TICK_MS = 100;

export default function VideoPreview({
  scenes,
  visualAssets,
  audioAssets,
  subtitleAsset,
  projectId,
  onClose,
}: {
  scenes: Scene[];
  visualAssets: VisualAsset[];
  audioAssets: AudioAsset[];
  subtitleAsset: SubtitleAsset | null;
  projectId: string;
  onClose?: () => void;
}) {
  const ordered = scenes.slice().sort((a, b) => a.scene_number - b.scene_number);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [visualUrls, setVisualUrls] = useState<Record<string, string | null>>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const scene = ordered[index];
  const visualAsset = scene ? visualAssets.find((v) => v.scene_id === scene.id) ?? null : null;
  const audioAsset = scene ? audioAssets.find((a) => a.scene_id === scene.id && a.status === "ready") ?? null : null;
  const subtitleEntry = scene ? subtitleAsset?.timing_json.find((t) => t.scene_id === scene.id) : null;
  const durationMs = (scene ? Number(scene.duration_seconds) : 0) * 1000;

  // Resolve the visual URL for the current scene (cached).
  useEffect(() => {
    if (!visualAsset || visualUrls[visualAsset.id] !== undefined) return;
    let cancelled = false;
    visualService.resolveUrl(visualAsset).then((url) => {
      if (!cancelled) setVisualUrls((prev) => ({ ...prev, [visualAsset.id]: url }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualAsset?.id]);

  // Resolve + (re)play audio whenever the scene changes.
  useEffect(() => {
    setAudioUrl(null);
    if (!audioAsset) return;
    let cancelled = false;
    audioService.getSignedUrl(audioAsset.id, projectId).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioAsset?.id]);

  // Reset elapsed time whenever the scene changes.
  useEffect(() => {
    setElapsedMs(0);
  }, [index]);

  // Playback timer — advances to the next scene once the current one's duration elapses.
  useEffect(() => {
    if (!playing || !scene) return;
    const interval = setInterval(() => {
      setElapsedMs((prev) => {
        const next = prev + TICK_MS;
        if (next >= durationMs) {
          if (index < ordered.length - 1) {
            setIndex((i) => i + 1);
          } else {
            setPlaying(false);
          }
          return 0;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [playing, index, durationMs, scene, ordered.length]);

  // Keep the <audio> element in sync with play/pause and scene changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing && audioUrl) {
      el.currentTime = 0;
      el.play().catch(() => {
        /* autoplay can be blocked until the user interacts — the visual timer still advances */
      });
    } else {
      el.pause();
    }
  }, [playing, audioUrl]);

  if (!scene) {
    return <p className="text-sm text-gray-400 text-center py-12">Add scenes before previewing.</p>;
  }

  const progressPct = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 0;
  const url = visualAsset ? visualUrls[visualAsset.id] : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[280px] aspect-[9/16] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-black shadow-xl">
        {onClose && (
          <button onClick={onClose} className="absolute top-2 right-2 z-20 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70">
            <X className="h-4 w-4" />
          </button>
        )}

        <SceneBackground asset={visualAsset} url={url} />

        {subtitleEntry?.text && (
          <div
            className={`absolute inset-x-0 px-4 flex ${
              subtitleAsset?.position === "top" ? "top-6 items-start" : subtitleAsset?.position === "center" ? "inset-y-0 items-center" : "bottom-6 items-end"
            } justify-center`}
          >
            <p
              className={`text-center leading-snug ${
                subtitleAsset?.style === "bold"
                  ? "font-extrabold text-white"
                  : subtitleAsset?.style === "yellow_highlight"
                  ? "bg-yellow-300 text-black font-bold px-2 py-1 rounded"
                  : subtitleAsset?.style === "white_shadow"
                  ? "text-white font-semibold [text-shadow:0_2px_6px_rgba(0,0,0,0.8)]"
                  : "text-white font-medium"
              }`}
              style={{ fontSize: `${Math.max(14, (subtitleAsset?.font_size ?? 32) * 0.55)}px` }}
            >
              {subtitleEntry.text}
            </p>
          </div>
        )}

        <div className="absolute top-2 left-2 right-10 flex gap-1">
          {ordered.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white transition-[width] duration-100"
                style={{ width: i < index ? "100%" : i === index ? `${progressPct}%` : "0%" }}
              />
            </div>
          ))}
        </div>

        {audioUrl && <audio ref={audioRef} src={audioUrl} />}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setPlaying(false);
            setIndex((i) => Math.max(0, i - 1));
          }}
          className="btn-ghost p-2"
          aria-label="Previous scene"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          onClick={() => setPlaying((p) => !p)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setIndex((i) => Math.min(ordered.length - 1, i + 1));
          }}
          className="btn-ghost p-2"
          aria-label="Next scene"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>
      <p className="text-xs text-gray-400">
        Scene {scene.scene_number} of {ordered.length}
      </p>
    </div>
  );
}

function SceneBackground({ asset, url }: { asset: VisualAsset | null; url: string | null }) {
  if (!asset) {
    return <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 text-xs">No visual</div>;
  }
  if (asset.source_type === "solid" && asset.color_value) {
    return <div className="absolute inset-0" style={{ backgroundColor: asset.color_value }} />;
  }
  if (asset.source_type === "gradient" && asset.gradient_from && asset.gradient_to) {
    return (
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(${asset.gradient_angle ?? 135}deg, ${asset.gradient_from}, ${asset.gradient_to})` }}
      />
    );
  }
  if (!url) {
    return <div className="absolute inset-0 flex items-center justify-center bg-gray-900 text-gray-500 text-xs">Loading…</div>;
  }
  if (asset.source_type === "uploaded_video") {
    return <video className="absolute inset-0 h-full w-full object-cover" src={url} autoPlay muted loop playsInline />;
  }
  return <img className="absolute inset-0 h-full w-full object-cover" src={url} alt="Scene visual" />;
}
