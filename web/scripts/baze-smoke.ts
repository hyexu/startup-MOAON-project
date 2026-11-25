/* One live check of the BAZE gateway. Run: BAZE_API_KEYS=<key or proxy-injected> npx tsx scripts/baze-smoke.ts */
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { createBaze } from "../lib/baze/client";
import { KeyPool } from "../lib/baze/keys";
import { pcmToMp3, toSttFormat } from "../lib/audio";
import { memoryJsonSchema, blankMemory } from "../lib/memory";
import { buildRecorderRequest, RECORDER_SYSTEM } from "../lib/prompts/recorder";

async function main() {
  const baze = createBaze({ pool: KeyPool.fromEnv() });
  console.log("balances", await baze.balances());

  const q = await baze.message({
    model: "claude-sonnet-5-5", system: "인터뷰어로서 공감 1문장 + 질문 1개만.", maxTokens: 300, effort: "low",
    messages: [{ role: "user", content: "어릴 적 살던 집 마당에 감나무가 있었어요." }],
  });
  console.log("question:", q.text, q.usage);

  const rec = buildRecorderRequest({ state: blankMemory("어머님"), turns: [{ question: "어릴 적 집은요?", answer: "마당에 감나무가 있었어요. 가을이면 감을 땄지.", command: null }] });
  try {
    const r = await baze.message({ model: "claude-haiku-5-5", system: RECORDER_SYSTEM, messages: rec.messages, maxTokens: 4000, effort: "low", jsonSchema: memoryJsonSchema, kind: "recorder" });
    console.log("recorder json ok:", !!r.json, r.json ? JSON.stringify(r.json).slice(0, 200) : r.text.slice(0, 200), r.usage);
  } catch (e) {
    console.log("recorder structured output failed:", (e as Error).message);
  }

  const tts = await baze.speak("안녕하세요. 어릴 적 살던 집 이야기를 들려주세요.");
  const mp3 = await pcmToMp3(tts.pcm);
  console.log("tts pcm bytes", tts.pcm.length, "mp3 bytes", mp3.length, tts.usage);

  const webm = execFileSync(ffmpegPath as unknown as string, ["-loglevel", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-c:a", "libopus", "-f", "webm", "pipe:1"], { input: tts.pcm });
  const stt = await toSttFormat(webm, "audio/webm;codecs=opus");
  const t = await baze.transcribe(stt.buf, stt.filename, stt.mime);
  console.log("stt:", t.text, t.usage);
  console.log("balances", await baze.balances());
}
main().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
