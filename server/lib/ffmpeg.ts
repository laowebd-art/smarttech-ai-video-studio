import { spawn } from "node:child_process";

/** Runs the ffmpeg CLI and rejects with the captured stderr tail on failure. */
export function runFfmpeg(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", ...args], { cwd });
    let stderrTail = "";

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrTail += chunk.toString();
      if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000);
    });

    proc.on("error", (err) => {
      // Most commonly: ffmpeg is not installed / not on PATH.
      reject(new Error(`Failed to start ffmpeg (is it installed and on PATH?): ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail.slice(-1500)}`));
    });
  });
}

export function runFfprobeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (err += c.toString()));
    proc.on("error", (e) => reject(e));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${err.slice(-500)}`));
      const seconds = parseFloat(out.trim());
      if (Number.isNaN(seconds)) return reject(new Error("ffprobe returned an unparseable duration."));
      resolve(seconds);
    });
  });
}

/**
 * Escapes text for safe use inside an ffmpeg drawtext filter argument.
 * drawtext text is embedded inside a colon/comma-delimited filter string, so
 * backslashes, colons, single quotes, and percent signs all need escaping.
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

/** Normalizes a "#rrggbb" or "rrggbb" hex color to ffmpeg's "0xRRGGBB" form. */
export function toFfmpegColor(hex: string | null | undefined, fallback = "0x333333"): string {
  if (!hex) return fallback;
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return `0x${clean}`;
}
