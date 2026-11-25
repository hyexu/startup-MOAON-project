/* Make a speech WAV for fake-microphone tests. Usage: npx tsx scripts/tts-wav.ts <out.wav> <text> */
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { createBaze } from "../lib/baze/client";
import { KeyPool } from "../lib/baze/keys";

(async () => {
  const [out, text] = process.argv.slice(2);
  const { pcm } = await createBaze({ pool: KeyPool.fromEnv() }).speak(text);
  execFileSync(ffmpegPath as unknown as string, ["-y", "-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-ar", "48000", out], { input: pcm });
  console.log("wrote", out);
})();
