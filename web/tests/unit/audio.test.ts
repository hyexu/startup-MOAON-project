import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { audioSeconds, pcmToMp3, toSttFormat } from "@/lib/audio";

function sineWebm(): Buffer {
  return execFileSync(ffmpegPath as unknown as string, [
    "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-c:a", "libopus", "-f", "webm", "pipe:1",
  ]);
}

describe("audio", () => {
  it("rewraps webm/opus as ogg for speech-to-text", async () => {
    const out = await toSttFormat(sineWebm(), "audio/webm;codecs=opus");
    expect(out.mime).toBe("audio/ogg");
    expect(out.filename).toBe("answer.ogg");
    expect(out.buf.subarray(0, 4).toString()).toBe("OggS");
    expect(await audioSeconds(out.buf, out.mime)).toBeGreaterThan(0.8);
    expect(await audioSeconds(out.buf, out.mime)).toBeLessThan(1.2);
  });

  it("passes accepted formats through unchanged", async () => {
    const buf = Buffer.from("fake-m4a");
    const out = await toSttFormat(buf, "audio/mp4");
    expect(out.buf).toBe(buf);
    expect(out.filename).toBe("answer.m4a");
  });

  it("encodes 24kHz PCM to mp3", async () => {
    const mp3 = await pcmToMp3(Buffer.alloc(48000));
    const id3 = mp3.subarray(0, 3).toString() === "ID3";
    const sync = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
    expect(id3 || sync).toBe(true);
  });
});
