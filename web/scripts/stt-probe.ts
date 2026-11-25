/* Probe BAZE STT with a recorded file as the app would send it. Usage: npx tsx scripts/stt-probe.ts <file> <mime> */
import { readFileSync } from "node:fs";
import { createBaze } from "../lib/baze/client";
import { KeyPool } from "../lib/baze/keys";
import { toSttFormat } from "../lib/audio";

(async () => {
  const [file, mime] = process.argv.slice(2);
  const conv = await toSttFormat(readFileSync(file), mime);
  console.log("sending as", conv.filename, conv.mime, conv.buf.length, "bytes");
  try {
    const r = await createBaze({ pool: KeyPool.fromEnv() }).transcribe(conv.buf, conv.filename, conv.mime);
    console.log("OK:", JSON.stringify(r.text), r.usage.audioSec);
  } catch (e) {
    console.log("FAILED:", (e as Error).message);
  }
})();
