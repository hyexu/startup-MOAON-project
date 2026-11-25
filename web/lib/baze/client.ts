import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "../config";
import { tokenCost, type UsageKind, type UsageRow } from "../usage";
import { KeyPool, type NamedKey } from "./keys";

export type BazeErrorCode = "no_credit" | "rate_limited" | "bad_request" | "server" | "no_keys";

export class BazeError extends Error {
  constructor(public code: BazeErrorCode, public status: number, message: string) {
    super(message);
    this.name = "BazeError";
  }
}

function codeFor(status: number): BazeErrorCode {
  if (status === 402) return "no_credit";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "bad_request";
  return "server";
}

type AnthropicLike = { messages: { create: (body: any) => Promise<any> } };

export type MessageArgs = {
  model: string;
  system: string | Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
  maxTokens: number;
  effort: "low" | "medium" | "high";
  jsonSchema?: object;
  kind?: UsageKind;
};

export type BazeDeps = {
  pool: KeyPool;
  fetch?: typeof fetch;
  anthropicFactory?: (key: string) => AnthropicLike;
  sleep?: (ms: number) => Promise<void>;
};

export type Baze = ReturnType<typeof createBaze>;

export function createBaze(deps: BazeDeps) {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const anthropicFor =
    deps.anthropicFactory ??
    ((key: string) => new Anthropic({ baseURL: CONFIG.bazeClaudeBase, authToken: key, maxRetries: 1, timeout: 90_000 }));

  /** Run with the current key; on 402 mark it exhausted and try the next one. Never leaks key values. */
  async function withKey<T>(run: (k: NamedKey) => Promise<T>): Promise<T> {
    for (;;) {
      const k = deps.pool.current();
      if (!k) throw new BazeError("no_credit", 402, "모든 BAZE 키의 크레딧이 부족합니다.");
      try {
        return await run(k);
      } catch (e) {
        const status = e instanceof BazeError ? e.status : Number((e as { status?: number })?.status) || 0;
        if (status === 402) {
          deps.pool.markExhausted(k.name);
          continue;
        }
        if (e instanceof BazeError) throw e;
        throw new BazeError(codeFor(status || 500), status || 500, `BAZE 요청 실패 (${k.name}, ${status || "network"})`);
      }
    }
  }

  async function http(k: NamedKey, path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${k.key}`);
    const res = await f(`${CONFIG.bazeBase}${path}`, { ...init, headers });
    if (!res.ok) throw new BazeError(codeFor(res.status), res.status, `BAZE ${path} 실패 (${k.name}, ${res.status})`);
    return res;
  }

  return {
    async message(a: MessageArgs): Promise<{ text: string; json?: unknown; usage: UsageRow; stopReason: string }> {
      return withKey(async (k) => {
        const output_config: Record<string, unknown> = { effort: a.effort };
        if (a.jsonSchema) output_config.format = { type: "json_schema", schema: a.jsonSchema };
        const res = await anthropicFor(k.key).messages.create({
          model: a.model, max_tokens: a.maxTokens, system: a.system, messages: a.messages, output_config,
        });
        const stopReason: string = res.stop_reason ?? "";
        const text = stopReason === "refusal" ? "" :
          (res.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("").trim();
        const u = res.usage ?? {};
        const input = u.input_tokens ?? 0, output = u.output_tokens ?? 0, cacheRead = u.cache_read_input_tokens ?? 0;
        const usage: UsageRow = {
          kind: a.kind ?? "interviewer", model: a.model, keyName: k.name,
          inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, audioSec: 0,
          costUsd: tokenCost(a.model, input, output, cacheRead), credits: null,
        };
        let json: unknown;
        if (a.jsonSchema && text) {
          try { json = JSON.parse(text); } catch { json = undefined; }
        }
        return { text, json, usage, stopReason };
      });
    },

    async transcribe(file: Buffer, filename: string, mime: string): Promise<{ text: string; usage: UsageRow }> {
      return withKey(async (k) => {
        const form = new FormData();
        form.append("file", new Blob([new Uint8Array(file)], { type: mime }), filename);
        form.append("model", CONFIG.stt.model);
        form.append("language_hints", "ko");
        form.append("enable_speaker_diarization", "false");
        const start = await (await http(k, "/audio/transcriptions/", { method: "POST", body: form })).json();
        const op = encodeURIComponent(start.operation_id);
        const deadline = Date.now() + 120_000;
        for (;;) {
          const r = await (await http(k, `/audio/transcriptions/${op}/`)).json();
          if (r.status === "completed") {
            return {
              text: String(r.text ?? "").trim(),
              usage: {
                kind: "stt", model: CONFIG.stt.model, keyName: k.name, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
                audioSec: Number(start.duration_seconds ?? r.duration_seconds ?? 0), costUsd: 0,
                credits: start.credits_charged != null ? Number(start.credits_charged) : null,
              },
            };
          }
          if (r.status === "failed") throw new BazeError("server", 502, "음성을 글로 옮기지 못했습니다.");
          if (Date.now() > deadline) throw new BazeError("server", 504, "음성 변환이 너무 오래 걸립니다.");
          await sleep(1500);
        }
      });
    },

    async speak(text: string): Promise<{ pcm: Buffer; usage: UsageRow }> {
      return withKey(async (k) => {
        const res = await http(k, "/audio/speech/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: CONFIG.tts.model, input: text, voice: CONFIG.tts.voice, instructions: CONFIG.tts.instructions }),
        });
        const pcm = Buffer.from(await res.arrayBuffer());
        let credits: number | null = null;
        try { credits = Number(JSON.parse(res.headers.get("x-billing") ?? "null")?.deducted_credit ?? NaN); } catch { /* none */ }
        return {
          pcm,
          usage: {
            kind: "tts", model: CONFIG.tts.model, keyName: k.name,
            inputTokens: Number(res.headers.get("x-input-tokens") ?? 0), outputTokens: Number(res.headers.get("x-output-tokens") ?? 0),
            cacheReadTokens: 0, audioSec: pcm.length / 48000, costUsd: 0, credits: Number.isFinite(credits) ? credits : null,
          },
        };
      });
    },

    async balances(): Promise<{ name: string; remaining: number }[]> {
      const out: { name: string; remaining: number }[] = [];
      for (const k of deps.pool.all()) {
        try {
          const r = await (await http(k, "/credits/")).json();
          out.push({ name: k.name, remaining: Number(r?.total?.remaining ?? 0) });
        } catch {
          out.push({ name: k.name, remaining: 0 });
        }
      }
      return out;
    },
  };
}
