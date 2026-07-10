import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { supabaseAdmin } from "./supabaseAdmin";
import { runFfmpeg, escapeDrawtext, toFfmpegColor } from "./ffmpeg";
import { downloadAudioObject, downloadVisualObject, renderPathForProject, uploadRenderBuffer } from "./storageAdmin";

const SUBTITLE_FONT_PATH = process.env.SUBTITLE_FONT_PATH || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const OUTPUT_FPS = 30;

interface SegmentResult {
  path: string;
  duration: number;
}

async function updateJob(jobId: string, updates: Record<string, unknown>) {
  await supabaseAdmin.from("render_jobs").update(updates).eq("id", jobId);
}

/** Downloads a storage-backed or externally-hosted visual asset to a local temp file. */
async function materializeVisualFile(asset: any, tempDir: string, index: number): Promise<string> {
  const ext = asset.source_type === "uploaded_video" ? "mp4" : "jpg";
  const localPath = path.join(tempDir, `visual${index}.${ext}`);

  if (asset.storage_path) {
    const buf = await downloadVisualObject(asset.storage_path);
    await fs.writeFile(localPath, buf);
  } else if (asset.public_url) {
    const response = await fetch(asset.public_url);
    if (!response.ok) throw new Error(`Failed to fetch visual from ${asset.public_url} (${response.status})`);
    const buf = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(localPath, buf);
  } else {
    throw new Error("Visual asset has neither storage_path nor public_url.");
  }
  return localPath;
}

function buildSubtitleDrawtext(text: string | undefined, settings: { style: string; position: string; font_size: number } | null): string | null {
  if (!text || !text.trim()) return null;

  const fontSize = settings?.font_size ?? 42;
  const escaped = escapeDrawtext(text);

  let y = `h-text_h-100`; // bottom (default)
  if (settings?.position === "top") y = "100";
  else if (settings?.position === "center") y = "(h-text_h)/2";

  let boxColor = "black@0.5";
  let fontColor = "white";
  let extra = "";
  if (settings?.style === "yellow_highlight") {
    boxColor = "0xFFD400@0.85";
    fontColor = "black";
  } else if (settings?.style === "white_shadow") {
    fontColor = "white";
    extra = ":shadowcolor=black@0.85:shadowx=2:shadowy=2";
  } else if (settings?.style === "clean") {
    boxColor = "black@0.0"; // no box, just shadowless white text
  }

  return `drawtext=fontfile=${SUBTITLE_FONT_PATH}:text='${escaped}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=${boxColor}:boxborderw=14${extra}`;
}

async function renderSceneSegment(params: {
  scene: any;
  visualAsset: any | null;
  audioAsset: any | null;
  subtitleText: string | undefined;
  subtitleSettings: { style: string; position: string; font_size: number } | null;
  tempDir: string;
  index: number;
}): Promise<SegmentResult> {
  const { scene, visualAsset, audioAsset, subtitleText, subtitleSettings, tempDir, index } = params;
  const duration = Math.max(0.5, Number(scene.duration_seconds) || 3);
  const segPath = path.join(tempDir, `seg${index}.mp4`);

  const visualArgs: string[] = [];
  const filters: string[] = [];

  if (visualAsset?.source_type === "solid") {
    const color = toFfmpegColor(visualAsset.color_value);
    visualArgs.push("-f", "lavfi", "-i", `color=c=${color}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${duration}:r=${OUTPUT_FPS}`);
  } else if (visualAsset?.source_type === "gradient") {
    const c0 = toFfmpegColor(visualAsset.gradient_from, "0x4f46e5");
    const c1 = toFfmpegColor(visualAsset.gradient_to, "0x7c3aed");
    visualArgs.push(
      "-f",
      "lavfi",
      "-i",
      `gradients=s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${duration}:r=${OUTPUT_FPS}:c0=${c0}:c1=${c1}`
    );
  } else if (visualAsset && (visualAsset.storage_path || visualAsset.public_url) && visualAsset.source_type !== "placeholder") {
    const localPath = await materializeVisualFile(visualAsset, tempDir, index);
    if (visualAsset.source_type === "uploaded_video") {
      visualArgs.push("-stream_loop", "-1", "-i", localPath);
    } else {
      visualArgs.push("-loop", "1", "-i", localPath);
    }
    filters.push(`scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase`, `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`, "setsar=1");
  } else {
    // No visual assigned yet — mid-gray placeholder rather than failing the render.
    visualArgs.push("-f", "lavfi", "-i", `color=c=0x333333:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${duration}:r=${OUTPUT_FPS}`);
  }

  const audioArgs: string[] = [];
  if (audioAsset?.storage_path) {
    const localAudioPath = path.join(tempDir, `aud${index}.mp3`);
    const buf = await downloadAudioObject(audioAsset.storage_path);
    await fs.writeFile(localAudioPath, buf);
    audioArgs.push("-i", localAudioPath);
  } else {
    audioArgs.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");
  }

  const drawtext = buildSubtitleDrawtext(subtitleText, subtitleSettings);
  if (drawtext) filters.push(drawtext);

  const args = [
    ...visualArgs,
    ...audioArgs,
    ...(filters.length ? ["-vf", filters.join(",")] : []),
    "-r",
    String(OUTPUT_FPS),
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-t",
    String(duration),
    "-shortest",
    segPath,
  ];

  await runFfmpeg(args, tempDir);
  return { path: segPath, duration };
}

/**
 * Chains scene segments together with a crossfade at each boundary. A
 * scene's `transition_type` is treated as the transition used entering that
 * scene from the previous one. "fade" / "slide" / "zoom" all render as a
 * genuine crossfade in V1 (slide/zoom don't yet get their own motion —
 * documented simplification); "cut" / "none" use a very short crossfade
 * (0.15s) rather than a literal zero-duration cut, which is both visually
 * indistinguishable from a hard cut and simpler to chain reliably.
 */
async function concatenateSegments(segments: SegmentResult[], transitionsIn: string[], tempDir: string, outputPath: string): Promise<void> {
  if (segments.length === 1) {
    await runFfmpeg([
      "-i",
      segments[0].path,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(OUTPUT_FPS),
      "-s",
      `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    return;
  }

  const inputArgs: string[] = [];
  segments.forEach((s) => inputArgs.push("-i", s.path));

  const filterParts: string[] = [];
  let cumulative = segments[0].duration;
  let prevV = "[0:v]";
  let prevA = "[0:a]";

  for (let i = 1; i < segments.length; i++) {
    const transitionType = transitionsIn[i] || "cut";
    const xfadeDur = transitionType === "fade" || transitionType === "slide" || transitionType === "zoom" ? 0.5 : 0.15;
    const offset = Math.max(0, cumulative - xfadeDur);
    const outV = `v${i}`;
    const outA = `a${i}`;
    filterParts.push(`${prevV}[${i}:v]xfade=transition=fade:duration=${xfadeDur.toFixed(2)}:offset=${offset.toFixed(2)}[${outV}]`);
    filterParts.push(`${prevA}[${i}:a]acrossfade=d=${xfadeDur.toFixed(2)}[${outA}]`);
    prevV = `[${outV}]`;
    prevA = `[${outA}]`;
    cumulative = cumulative + segments[i].duration - xfadeDur;
  }

  const args = [
    ...inputArgs,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    prevV,
    "-map",
    prevA,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(OUTPUT_FPS),
    "-s",
    `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];

  await runFfmpeg(args, tempDir);
}

export async function renderProject(jobId: string, projectId: string, userId: string): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `smarttech-render-${jobId}-`));

  try {
    await updateJob(jobId, { status: "rendering", progress: 5, started_at: new Date().toISOString(), error_message: null });

    const [{ data: project }, { data: scenes }, { data: visuals }, { data: audios }, { data: subtitleAsset }] = await Promise.all([
      supabaseAdmin.from("projects").select("*").eq("id", projectId).single(),
      supabaseAdmin.from("scenes").select("*").eq("project_id", projectId).order("scene_number"),
      supabaseAdmin.from("visual_assets").select("*").eq("project_id", projectId),
      supabaseAdmin.from("audio_assets").select("*").eq("project_id", projectId),
      supabaseAdmin.from("subtitle_assets").select("*").eq("project_id", projectId).is("scene_id", null).maybeSingle(),
    ]);

    if (!project) throw new Error("Project not found.");
    if (!scenes || scenes.length === 0) throw new Error("This project has no scenes to render.");

    const subtitleSettings = subtitleAsset
      ? { style: subtitleAsset.style, position: subtitleAsset.position, font_size: subtitleAsset.font_size }
      : null;

    const segments: SegmentResult[] = [];
    const transitionsIn: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const visualAsset = (visuals ?? []).find((v: any) => v.scene_id === scene.id) ?? null;
      const audioAsset = (audios ?? []).find((a: any) => a.scene_id === scene.id && a.status === "ready") ?? null;
      const subtitleEntry = subtitleAsset?.timing_json?.find((t: any) => t.scene_id === scene.id);
      const subtitleText = subtitleEntry?.text ?? scene.subtitle_text ?? undefined;

      const segment = await renderSceneSegment({
        scene,
        visualAsset,
        audioAsset,
        subtitleText,
        subtitleSettings,
        tempDir,
        index: i,
      });
      segments.push(segment);
      transitionsIn.push(scene.transition_type || "cut");

      const progress = 10 + Math.round(((i + 1) / scenes.length) * 60); // 10% -> 70%
      await updateJob(jobId, { progress });
    }

    await updateJob(jobId, { progress: 75 });

    const outputPath = path.join(tempDir, "final.mp4");
    await concatenateSegments(segments, transitionsIn, tempDir, outputPath);

    await updateJob(jobId, { progress: 90 });

    const outputBuffer = await fs.readFile(outputPath);
    const storagePath = renderPathForProject(userId, projectId, jobId);
    await uploadRenderBuffer(storagePath, outputBuffer);

    const { data: exportedVideo, error: exportError } = await supabaseAdmin
      .from("exported_videos")
      .insert({
        project_id: projectId,
        render_job_id: jobId,
        storage_path: storagePath,
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fps: OUTPUT_FPS,
        format: "mp4",
        caption_youtube: project.generated_captions?.youtube ?? null,
        caption_tiktok: project.generated_captions?.tiktok ?? null,
        caption_facebook: project.generated_captions?.facebook ?? null,
        caption_instagram: project.generated_captions?.instagram ?? null,
        hashtags: project.generated_hashtags ?? null,
      })
      .select()
      .single();

    if (exportError) throw new Error(`Render succeeded but failed to save export record: ${exportError.message}`);

    await supabaseAdmin.from("projects").update({ status: "rendered" }).eq("id", projectId);
    await updateJob(jobId, { status: "completed", progress: 100, completed_at: new Date().toISOString() });

    void exportedVideo; // exported_videos row is read back via the exports list endpoint
  } catch (err: any) {
    console.error(`[renderProject] job ${jobId} failed:`, err);
    await updateJob(jobId, {
      status: "failed",
      error_message: (err?.message ?? "Unknown render error").slice(0, 2000),
      completed_at: new Date().toISOString(),
    });
    throw err;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
