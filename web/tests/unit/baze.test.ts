import { describe, expect, it } from "vitest";
import { BazeError, createBaze } from "@/lib/baze/client";
import { KeyPool } from "@/lib/baze/keys";

const SECRET = "sk-test-SECRET";
const pool2 = () => new KeyPool([{ name: "key1", key: SECRET }, { name: "key2", key: "sk-test-OTHER" }]);
const noSleep = async () => {};

function fakeAnthropic(behavior: (key: string) => unknown) {
  return (key: string) => ({
    messages: {
      create: async () => {
        const r = behavior(key);
        if (r instanceof Error) throw r;
        return r;
      },
    },
  });
}
const httpError = (status: number) => Object.assign(new Error(`status ${status}`), { status });
const okMessage = (text: string, usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500 }) => ({
  content: [{ type: "text", text }], stop_reason: "end_turn", usage,
});
const msgArgs = { model: "claude-sonnet-5-5", system: "s", messages: [{ role: "user" as const, content: "hi" }], maxTokens: 300, effort: "low" as const };

describe("message", () => {
  it("moves to the next key when the first has no credit", async () => {
    const baze = createBaze({ pool: pool2(), anthropicFactory: fakeAnthropic((k) => (k === SECRET ? httpError(402) : okMessage("다음 질문"))) });
    const r = await baze.message(msgArgs);
    expect(r.text).toBe("다음 질문");
    expect(r.usage.keyName).toBe("key2");
  });

  it("throws no_credit when every key is out of credit", async () => {
    const baze = createBaze({ pool: pool2(), anthropicFactory: fakeAnthropic(() => httpError(402)) });
    await expect(baze.message(msgArgs)).rejects.toMatchObject({ code: "no_credit" });
  });

  it("computes cost from token usage", async () => {
    const baze = createBaze({ pool: pool2(), anthropicFactory: fakeAnthropic(() => okMessage("q")) });
    const r = await baze.message(msgArgs);
    expect(r.usage.costUsd).toBeCloseTo(0.00305, 8);
    expect(r.usage).toMatchObject({ kind: "interviewer", inputTokens: 1000, outputTokens: 100, cacheReadTokens: 500 });
  });

  it("returns empty text on refusal", async () => {
    const baze = createBaze({ pool: pool2(), anthropicFactory: fakeAnthropic(() => ({ ...okMessage("x"), stop_reason: "refusal", content: [] })) });
    expect((await baze.message(msgArgs)).text).toBe("");
  });

  it("never puts a key into an error message", async () => {
    const baze = createBaze({ pool: pool2(), anthropicFactory: fakeAnthropic(() => httpError(500)) });
    const err = await baze.message(msgArgs).catch((e) => e);
    expect(err).toBeInstanceOf(BazeError);
    expect(String(err.message) + JSON.stringify(err)).not.toContain("SECRET");
  });
});

describe("transcribe", () => {
  it("starts a job, polls until completed and reports credits", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    let polls = 0;
    const fetchFake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") return Response.json({ operation_id: "op1", status: "processing", duration_seconds: 3.2, credits_charged: 1.5 });
      polls++;
      return Response.json(polls < 2 ? { status: "processing" } : { status: "completed", text: "감나무가 있었어요" });
    }) as typeof fetch;
    const baze = createBaze({ pool: pool2(), fetch: fetchFake, sleep: noSleep });
    const r = await baze.transcribe(Buffer.from("abc"), "answer.ogg", "audio/ogg");
    expect(r.text).toBe("감나무가 있었어요");
    expect(r.usage).toMatchObject({ kind: "stt", credits: 1.5, audioSec: 3.2, keyName: "key1" });
    const form = calls[0].init!.body as FormData;
    expect(form.get("model")).toBe("stt-async-v5");
    expect(form.getAll("language_hints")).toEqual(["ko"]);
    expect(form.get("enable_speaker_diarization")).toBe("false");
    expect(calls[0].url).toBe("https://api.baze.co/v1/gateway/audio/transcriptions/");
    expect(calls[1].url).toBe("https://api.baze.co/v1/gateway/audio/transcriptions/op1/");
  });

  it("fails with server when the job fails", async () => {
    const fetchFake = (async (_u: string, init?: RequestInit) =>
      init?.method === "POST" ? Response.json({ operation_id: "op1", credits_charged: 1 }) : Response.json({ status: "failed", error: "x" })) as typeof fetch;
    const baze = createBaze({ pool: pool2(), fetch: fetchFake, sleep: noSleep });
    await expect(baze.transcribe(Buffer.from("a"), "a.ogg", "audio/ogg")).rejects.toMatchObject({ code: "server" });
  });
});

describe("balances", () => {
  it("reads total.remaining per key", async () => {
    const fetchFake = (async (_u: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get("authorization");
      return Response.json({ total: { remaining: auth === `Bearer ${SECRET}` ? 4800 : 5000 } });
    }) as typeof fetch;
    const baze = createBaze({ pool: pool2(), fetch: fetchFake });
    expect(await baze.balances()).toEqual([{ name: "key1", remaining: 4800 }, { name: "key2", remaining: 5000 }]);
  });
});
