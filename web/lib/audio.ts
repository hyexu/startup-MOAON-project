import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const FFMPEG = (ffmpegStatic as unknown as string) || "ffmpeg";

function run(args: string[]): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, ["-hide_banner", "-nostdin", ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(`ffmpeg failed: ${String(stderr).slice(-300)}`));
      else resolve({ stderr: String(stderr) });
    });
  });
}

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "moaon-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

const PASS: Record<string, string> = {
  "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav",
};

export function extFor(mime: string): string {
  const base = mime.split(";")[0].trim();
  if (base === "audio/webm") return "webm";
  return PASS[base] ?? "bin";
}

/** BAZE STT refuses webm (no duration). Rewrap webm/opus as ogg/opus without re-encoding; pass the rest through. */
export async function toSttFormat(buf: Buffer, mime: string): Promise<{ buf: Buffer; filename: string; mime: string }> {
  const base = mime.split(";")[0].trim();
  if (base !== "audio/webm") return { buf, filename: `answer.${extFor(mime)}`, mime: base };
  return withTemp(async (dir) => {
    const inp = path.join(dir, "in.webm"), out = path.join(dir, "out.ogg");
    await writeFile(inp, buf);
    await run(["-loglevel", "error", "-i", inp, "-vn", "-c:a", "copy", "-f", "ogg", out]);
    return { buf: await readFile(out), filename: "answer.ogg", mime: "audio/ogg" };
  });
}

/** Gemini TTS returns raw 24kHz mono s16le PCM. */
export async function pcmToMp3(pcm: Buffer): Promise<Buffer> {
  return withTemp(async (dir) => {
    const inp = path.join(dir, "in.pcm"), out = path.join(dir, "out.mp3");
    await writeFile(inp, pcm);
    await run(["-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", inp, "-b:a", "48k", "-f", "mp3", out]);
    return readFile(out);
  });
}

/** Decode fully and read the last timestamp (MediaRecorder files often have no duration header). */
export async function audioSeconds(buf: Buffer, mime: string): Promise<number> {
  return withTemp(async (dir) => {
    const inp = path.join(dir, `in.${extFor(mime)}`);
    await writeFile(inp, buf);
    const { stderr } = await run(["-i", inp, "-f", "null", "-"]);
    const times = [...stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
    const t = times.at(-1);
    return t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : 0;
  });
}
