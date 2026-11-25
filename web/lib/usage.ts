import type { Db } from "./db/types";
import { aiUsage } from "./db/schema";

export type UsageKind = "interviewer" | "recorder" | "stt" | "tts";

export type UsageRow = {
  kind: UsageKind;
  model: string;
  keyName: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  audioSec: number;
  costUsd: number;
  credits: number | null;
};

/** USD per 1M tokens, from GET /v1/gateway/models/ on 2026-11-25. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2.0, output: 10.0, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-opus-5-5": { input: 4.0, output: 20.0, cacheRead: 0.2 },
};

export function tokenCost(model: string, input: number, output: number, cacheRead: number): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (input * p.input + output * p.output + cacheRead * p.cacheRead) / 1e6;
}

export async function recordUsage(db: Db, row: UsageRow, ctx: { parentId?: number; sessionId?: number } = {}) {
  await db.insert(aiUsage).values({ ...row, parentId: ctx.parentId ?? null, sessionId: ctx.sessionId ?? null });
}
