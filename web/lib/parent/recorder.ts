import { CONFIG } from "../config";
import { clear, saveChunk } from "./backup";

export type Recording = { mime: string; stop(): Promise<Blob>; level(): number; startedAt: number };

const MIMES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
export const pickMime = () => (typeof MediaRecorder === "undefined" ? "" : MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "");

let stream: MediaStream | null = null;

/** Ask for the microphone once and keep the stream for the whole visit. */
export async function ensureMic(): Promise<void> {
  if (stream && stream.getAudioTracks().some((t) => t.readyState === "live")) return;
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
}

let wake: { release(): Promise<void> } | null = null;
async function holdWake() {
  try { wake = await (navigator as unknown as { wakeLock?: { request(t: string): Promise<typeof wake> } }).wakeLock?.request("screen") ?? null; } catch { wake = null; }
}

/** Record one answer; chunks go to IndexedDB every 5 seconds; stops itself at the answer limit. */
export async function startRecording(turnId: number, onLimit: () => void): Promise<Recording> {
  await ensureMic();
  const mime = pickMime();
  const rec = new MediaRecorder(stream!, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
  const actualMime = rec.mimeType || mime || "audio/webm";
  const chunks: Blob[] = [];
  await clear(turnId);
  rec.ondataavailable = (e) => {
    if (e.data.size) { chunks.push(e.data); void saveChunk(turnId, e.data, actualMime); }
  };
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream!).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const limit = setTimeout(onLimit, CONFIG.maxAnswerSec * 1000);
  rec.start(5000);
  void holdWake();
  return {
    mime: actualMime,
    startedAt: Date.now(),
    level() {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      return peak / 128;
    },
    stop() {
      clearTimeout(limit);
      return new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          void ctx.close();
          void wake?.release().catch(() => {});
          resolve(new Blob(chunks, { type: actualMime }));
        };
        if (rec.state !== "inactive") rec.stop(); else rec.onstop?.(new Event("stop"));
      });
    },
  };
}
