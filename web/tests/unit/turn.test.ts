import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { aiUsage, parents, questionSeeds, sessions, turns } from "@/lib/db/schema";
import { copyDefaultSeeds, DEFAULT_SEEDS } from "@/lib/seeds";
import { BazeError } from "@/lib/baze/client";
import { memoryStorage } from "@/lib/storage";
import { setSetting } from "@/lib/ai-mode";
import { completeTurn, CONTINUE_PREFIX, EMPTY_ANSWER_PREFIX, NotFound, startSession, type TurnDeps } from "@/lib/turn";
import type { UsageRow } from "@/lib/usage";

const usage = (kind: UsageRow["kind"]): UsageRow => ({
  kind, model: "m", keyName: "key1", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, audioSec: 1, costUsd: 0.001, credits: 1,
});

type FakeOpts = { transcript?: string; question?: string; fail?: "no_credit"; remaining?: number };
function fakeBaze(o: FakeOpts = {}) {
  const calls = { message: 0, transcribe: 0, speak: 0, balances: 0 };
  const fail = () => { throw new BazeError("no_credit", 402, "no credit"); };
  return {
    calls,
    baze: {
      async message() { calls.message++; if (o.fail) fail(); return { text: o.question ?? "감나무 아래서 주로 뭘 하셨어요?", usage: usage("interviewer"), stopReason: "end_turn" }; },
      async transcribe() { calls.transcribe++; if (o.fail) fail(); return { text: o.transcript ?? "감나무가 있었어요", usage: usage("stt") }; },
      async speak() { calls.speak++; if (o.fail) fail(); return { pcm: Buffer.alloc(4800), usage: usage("tts") }; },
      async balances() { calls.balances++; return [{ name: "key1", remaining: o.remaining ?? 5000 }]; },
    },
  };
}

async function setup(o: FakeOpts = {}) {
  const db = await makeTestDb();
  const [p] = await db.insert(parents).values({ honorific: "어머님", retainUntil: "2099-01-01" }).returning();
  await copyDefaultSeeds(db, p.id);
  const storage = memoryStorage();
  const fb = fakeBaze(o);
  const deps: TurnDeps = { db, baze: fb.baze as unknown as TurnDeps["baze"], storage, convert: async (buf, mime) => ({ buf, filename: "answer.ogg", mime }), seconds: async () => 2 };
  return { db, p, storage, deps, calls: fb.calls };
}

async function answer(s: Awaited<ReturnType<typeof setup>>, turnId: number, command: string | null = null) {
  const path = `a/${s.p.id}/${turnId}.webm`;
  await s.storage.put(path, Buffer.from("audio"), "audio/webm");
  return completeTurn(s.deps, { parentId: s.p.id, turnId, audioPath: command ? null : path, mime: command ? null : "audio/webm", command });
}

describe("completeTurn", () => {
  it("transcribes, asks the interviewer, speaks, and logs usage", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    const next = await answer(s, first.turn.turnId);
    expect(next.question).toBe("감나무 아래서 주로 뭘 하셨어요?");
    expect(next.source).toBe("ai");
    expect(next.audioUrl).not.toBeNull();
    const [done] = await s.db.select().from(turns).where(eq(turns.id, first.turn.turnId));
    expect(done.transcript).toBe("감나무가 있었어요");
    expect(done.stt).toBe("done");
    expect(done.completedAt).not.toBeNull();
    const kinds = (await s.db.select().from(aiUsage)).map((u) => u.kind).sort();
    expect(kinds).toEqual(["interviewer", "interviewer", "stt", "tts", "tts"]);
  });

  it("handles a duplicate completion once (double tap or retry)", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    const path = `a/${s.p.id}/${first.turn.turnId}.webm`;
    await s.storage.put(path, Buffer.from("audio"), "audio/webm");
    const args = { parentId: s.p.id, turnId: first.turn.turnId, audioPath: path, mime: "audio/webm", command: null };
    const [a, b] = await Promise.all([completeTurn(s.deps, args), completeTurn(s.deps, args)]);
    expect(a.turnId).toBe(b.turnId);
    expect(s.calls.transcribe).toBe(1);
    expect(await s.db.select().from(turns)).toHaveLength(2);
    const again = await completeTurn(s.deps, args);
    expect(again.turnId).toBe(a.turnId);
  });

  it("keeps the recording and falls back to a seed when credits run out mid-session", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    s.deps.baze = fakeBaze({ fail: "no_credit" }).baze as unknown as TurnDeps["baze"];
    const next = await answer(s, first.turn.turnId);
    const [done] = await s.db.select().from(turns).where(eq(turns.id, first.turn.turnId));
    expect(done.answerAudioPath).toBe(`a/${s.p.id}/${first.turn.turnId}.webm`);
    expect(done.stt).toBe("deferred");
    expect(next.source).toBe("seed");
    expect(next.question).toBe(DEFAULT_SEEDS[0].text);
    const [seed] = await s.db.select().from(questionSeeds).where(eq(questionSeeds.text, DEFAULT_SEEDS[0].text));
    expect(seed.usedAt).not.toBeNull();
  });

  it("uses no AI at all when paused by the operator", async () => {
    const s = await setup();
    await setSetting(s.db, "ai_paused_manual", true);
    const first = await startSession(s.deps, s.p.id);
    const next = await answer(s, first.turn.turnId);
    expect(s.calls.message + s.calls.transcribe + s.calls.speak).toBe(0);
    expect(first.turn.source).toBe("seed");
    expect(next.source).toBe("seed");
    expect(next.question).toBe(DEFAULT_SEEDS[1].text);
  });

  it("pauses AI when the remaining credits drop below the threshold", async () => {
    const s = await setup({ remaining: 100 });
    const first = await startSession(s.deps, s.p.id);
    expect(first.turn.source).toBe("seed");
    expect(s.calls.message).toBe(0);
  });

  it("asks again when the recording had no words", async () => {
    const s = await setup({ transcript: "   " });
    const first = await startSession(s.deps, s.p.id);
    const next = await answer(s, first.turn.turnId);
    expect(next.source).toBe("system");
    expect(next.question.startsWith(EMPTY_ANSWER_PREFIX)).toBe(true);
    expect(next.question).toContain(first.turn.question);
    const [done] = await s.db.select().from(turns).where(eq(turns.id, first.turn.turnId));
    expect(done.stt).toBe("empty");
  });

  it("refuses a turn that belongs to another parent", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    await expect(completeTurn(s.deps, { parentId: s.p.id + 99, turnId: first.turn.turnId, audioPath: null, mime: null, command: "넘어갈게요" }))
      .rejects.toBeInstanceOf(NotFound);
  });

  it("stops calling the interviewer after the daily cap", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    const now = new Date();
    await s.db.insert(turns).values(Array.from({ length: 80 }, (_, i) => ({
      sessionId: first.sessionId, parentId: s.p.id, seq: 1000 + i, question: "q", questionSource: "seed", completedAt: now,
    })));
    const before = s.calls.message;
    const next = await answer(s, first.turn.turnId);
    expect(s.calls.message).toBe(before);
    expect(next.source).toBe("seed");
  });

  it("falls back to a seed when the interviewer returns nothing (refusal)", async () => {
    const s = await setup({ question: "" });
    const first = await startSession(s.deps, s.p.id);
    expect(first.turn.source).toBe("seed");
  });

  it("ends the day with a closing message and no further question", async () => {
    const s = await setup({ question: "오늘 감나무 이야기 고맙습니다. 다음엔 학교 이야기 들려주세요." });
    const first = await startSession(s.deps, s.p.id);
    const end = await answer(s, first.turn.turnId, "오늘은 여기까지");
    expect(end.done).toBe(true);
    const [sess] = await s.db.select().from(sessions).where(eq(sessions.id, first.sessionId));
    expect(sess.endedAt).not.toBeNull();
    expect(sess.summary).toContain("감나무");
  });
});

describe("startSession", () => {
  it("resumes the pending question of an open session", async () => {
    const s = await setup();
    const a = await startSession(s.deps, s.p.id);
    const b = await startSession(s.deps, s.p.id);
    expect(b.sessionId).toBe(a.sessionId);
    expect(b.turn.turnId).toBe(a.turn.turnId);
  });
});

describe("review fixes: turn pipeline", () => {
  it("returns the same next question to a duplicate request even when the interviewer is slow", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    const slow = s.deps.baze.message;
    s.deps.baze = { ...s.deps.baze, message: async (a: never) => { await new Promise((r) => setTimeout(r, 400)); return slow(a); } } as never;
    s.deps.sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50)));
    const args = { parentId: s.p.id, turnId: first.turn.turnId, audioPath: null, mime: null, command: "넘어갈게요" };
    const [a, b] = await Promise.all([completeTurn(s.deps, args), completeTurn(s.deps, args)]);
    expect(a.turnId).toBe(b.turnId);
    expect(await s.db.select().from(turns)).toHaveLength(2);
  });

  it("keeps going when the recording cannot be converted", async () => {
    const s = await setup();
    s.deps.convert = async () => { throw new Error("ffmpeg failed"); };
    const first = await startSession(s.deps, s.p.id);
    const next = await answer(s, first.turn.turnId);
    expect(next.question).toBeTruthy();
    const [done] = await s.db.select().from(turns).where(eq(turns.id, first.turn.turnId));
    expect(done.stt).toBe("failed");
    expect(done.answerAudioPath).not.toBeNull();
  });

  it("asks the same question again after an interrupted answer", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    const path = `a/${s.p.id}/${first.turn.turnId}.webm`;
    await s.storage.put(path, Buffer.from("audio"), "audio/webm");
    const next = await completeTurn(s.deps, { parentId: s.p.id, turnId: first.turn.turnId, audioPath: path, mime: "audio/webm", command: null, partial: true });
    expect(next.source).toBe("system");
    expect(next.question.startsWith(CONTINUE_PREFIX)).toBe(true);
    expect(next.question).toContain(first.turn.question);
    const [done] = await s.db.select().from(turns).where(eq(turns.id, first.turn.turnId));
    expect(done.transcript).toBe("감나무가 있었어요");
  });
});

describe("empty recordings", () => {
  it("treats a 0-byte recording as no answer and asks again, without calling STT", async () => {
    const s = await setup();
    const first = await startSession(s.deps, s.p.id);
    const path = `a/${s.p.id}/${first.turn.turnId}.m4a`;
    await s.storage.put(path, Buffer.alloc(0), "audio/mp4");
    const before = s.calls.transcribe;
    const next = await completeTurn(s.deps, { parentId: s.p.id, turnId: first.turn.turnId, audioPath: path, mime: "audio/mp4", command: null });
    expect(s.calls.transcribe).toBe(before);
    expect(next.question.startsWith(EMPTY_ANSWER_PREFIX)).toBe(true);
    const [done] = await s.db.select().from(turns).where(eq(turns.id, first.turn.turnId));
    expect(done.stt).toBe("empty");
  });
});
