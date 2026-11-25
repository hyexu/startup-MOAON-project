import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { memory, questionSeeds } from "@/lib/db/schema";
import { memoryStorage } from "@/lib/storage";
import { setSetting } from "@/lib/ai-mode";
import { handleAdmin, voiceSeeds, type AdminDeps } from "@/lib/admin-api";
import type { UsageRow } from "@/lib/usage";

const usage: UsageRow = { kind: "tts", model: "m", keyName: "key1", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, audioSec: 1, costUsd: 0, credits: 1 };

async function setup() {
  const db = await makeTestDb();
  const calls = { speak: 0, transcribe: 0 };
  const deps: AdminDeps = {
    db, storage: memoryStorage(), after: () => {},
    baze: {
      balances: async () => [{ name: "key1", remaining: 5000 }],
      speak: async () => { calls.speak++; return { pcm: Buffer.alloc(4800), usage }; },
      transcribe: async () => { calls.transcribe++; return { text: "녹음 내용", usage: { ...usage, kind: "stt" } }; },
    } as never,
    toMp3: async (b) => b,
  };
  const call = (method: string, path: string, body: unknown = {}, adminEmail: string | null = "op@moaon.test") =>
    handleAdmin({ method, path, body, adminEmail, origin: "https://moaon.test" }, deps);
  return { db, deps, call, calls };
}

beforeEach(() => { process.env.ADMIN_EMAILS = "op@moaon.test"; });

describe("admin access", () => {
  it("rejects requests without a signed-in operator", async () => {
    const s = await setup();
    expect((await s.call("GET", "/parents", {}, null)).status).toBe(401);
    expect((await s.call("GET", "/parents", {}, "stranger@x.test")).status).toBe(401);
  });
});

describe("parents, seeds, links", () => {
  it("creates a parent with 18 seeds and a blank memory", async () => {
    const s = await setup();
    const r = await s.call("POST", "/parents", { honorific: "어머님", realName: "김가명", hometown: "안동" });
    expect(r.status).toBe(200);
    const id = (r.json as { id: number }).id;
    expect(await s.db.select().from(questionSeeds).where(eq(questionSeeds.parentId, id))).toHaveLength(18);
    expect(await s.db.select().from(memory).where(eq(memory.parentId, id))).toHaveLength(1);
    const list = (await s.call("GET", "/parents")).json as { honorific: string }[];
    expect(list.map((p) => p.honorific)).toEqual(["어머님"]);
  });

  it("refuses to change the text of a seed already asked", async () => {
    const s = await setup();
    const id = ((await s.call("POST", "/parents", { honorific: "어머님" })).json as { id: number }).id;
    const seeds = (await s.call("GET", `/parents/${id}/seeds`)).json as { id: number; text: string; usedAt: string | null }[];
    await s.db.update(questionSeeds).set({ usedAt: new Date() }).where(eq(questionSeeds.id, seeds[0].id));
    const edited = seeds.map((x, i) => ({ ...x, text: i === 0 ? "바뀐 질문" : x.text }));
    expect((await s.call("PUT", `/parents/${id}/seeds`, edited)).status).toBe(400);
    const added = [...seeds, { period: "청년", text: "군대 이야기를 들려주세요.", source: "가족", position: 99, enabled: true }];
    expect((await s.call("PUT", `/parents/${id}/seeds`, added)).status).toBe(200);
    expect((await s.call("GET", `/parents/${id}/seeds`)).json).toHaveLength(19);
  });

  it("issues a link with a message and never lists the token", async () => {
    const s = await setup();
    const id = ((await s.call("POST", "/parents", { honorific: "어머님" })).json as { id: number }).id;
    const made = (await s.call("POST", `/parents/${id}/links`)).json as { url: string; message: string };
    expect(made.url.startsWith("https://moaon.test/r#k=")).toBe(true);
    expect(made.message).toContain("어머님, 안녕하세요. 모아온입니다.");
    expect(made.message).toContain(made.url);
    const token = made.url.split("#k=")[1];
    const listed = JSON.stringify((await s.call("GET", `/parents/${id}/links`)).json);
    expect(listed).not.toContain(token);
    expect(listed).not.toContain("tokenHash");
  });
});

describe("voiceSeeds", () => {
  it("voices only enabled seeds without audio, and nothing while paused", async () => {
    const s = await setup();
    const id = ((await s.call("POST", "/parents", { honorific: "어머님" })).json as { id: number }).id;
    const seeds = await s.db.select().from(questionSeeds).where(eq(questionSeeds.parentId, id));
    await s.db.update(questionSeeds).set({ enabled: false }).where(eq(questionSeeds.id, seeds[0].id));
    await s.db.update(questionSeeds).set({ audioPath: "s/x.mp3" }).where(eq(questionSeeds.id, seeds[1].id));
    await voiceSeeds(s.deps, id);
    expect(s.calls.speak).toBe(16);
    const s2 = await setup();
    const id2 = ((await s2.call("POST", "/parents", { honorific: "아버님" })).json as { id: number }).id;
    await setSetting(s2.db, "ai_paused_manual", true);
    await voiceSeeds(s2.deps, id2);
    expect(s2.calls.speak).toBe(0);
  });
});

import { aiUsage, sessions, turns } from "@/lib/db/schema";
import { aiMode } from "@/lib/ai-mode";

async function withTurns() {
  const s = await setup();
  const id = ((await s.call("POST", "/parents", { honorific: "어머님" })).json as { id: number }).id;
  const [sess] = await s.db.insert(sessions).values({ parentId: id }).returning();
  const now = new Date();
  await s.db.insert(turns).values([
    { sessionId: sess.id, parentId: id, seq: 1, question: "q1", questionSource: "ai", answerAudioPath: `a/${id}/1.webm`, answerMime: "audio/webm", stt: "deferred", completedAt: now },
    { sessionId: sess.id, parentId: id, seq: 2, question: "q2", questionSource: "seed", answerAudioPath: `a/${id}/2.webm`, answerMime: "audio/webm", stt: "deferred", completedAt: now },
    { sessionId: sess.id, parentId: id, seq: 3, question: "q3", questionSource: "seed" },
  ]);
  await s.deps.storage.put(`a/${id}/1.webm`, Buffer.from("x"), "audio/webm");
  await s.deps.storage.put(`a/${id}/2.webm`, Buffer.from("y"), "audio/webm");
  s.deps.convert = async (buf, mime) => ({ buf, filename: "a.ogg", mime });
  return { ...s, id, sess };
}

describe("credits and AI pause", () => {
  it("sums this month's credits and the average per answered turn", async () => {
    const s = await withTurns();
    await s.db.insert(aiUsage).values([
      { kind: "stt", model: "m", keyName: "key1", credits: 50, parentId: s.id },
      { kind: "interviewer", model: "m", keyName: "key1", credits: 100, costUsd: 0.02, parentId: s.id },
    ]);
    const c = (await s.call("GET", "/credits")).json as { keys: unknown[]; paused: boolean; monthUsage: { credits: number; turns: number }; avgCreditsPerTurn: number };
    expect(c.keys).toEqual([{ name: "key1", remaining: 5000 }]);
    expect(c.paused).toBe(false);
    expect(c.monthUsage).toMatchObject({ credits: 150, turns: 2 });
    expect(c.avgCreditsPerTurn).toBe(75);
  });

  it("pauses and resumes AI from the operator screen", async () => {
    const s = await withTurns();
    await s.call("PUT", "/ai-pause", { paused: true });
    expect(await aiMode(s.db, s.deps.baze)).toMatchObject({ paused: true, reason: "manual" });
    await s.call("PUT", "/ai-pause", { paused: false });
    expect((await aiMode(s.db, s.deps.baze)).paused).toBe(false);
  });

  it("transcribes deferred recordings only when AI is on", async () => {
    const s = await withTurns();
    await s.call("PUT", "/ai-pause", { paused: true });
    expect((await s.call("POST", `/parents/${s.id}/transcribe-deferred`)).status).toBe(409);
    await s.call("PUT", "/ai-pause", { paused: false });
    const r = (await s.call("POST", `/parents/${s.id}/transcribe-deferred`)).json as { done: number; left: number };
    expect(r).toEqual({ done: 2, left: 0 });
    expect(s.calls.transcribe).toBe(2);
    const rows = await s.db.select().from(turns).where(eq(turns.parentId, s.id));
    expect(rows.filter((t) => t.stt === "done").map((t) => t.transcript)).toEqual(["녹음 내용", "녹음 내용"]);
  });
});

describe("sessions and memory", () => {
  it("lists turns with short-lived signed audio links", async () => {
    const s = await withTurns();
    const list = (await s.call("GET", `/parents/${s.id}/sessions`)).json as { turns: { seq: number; answerUrl: string | null }[] }[];
    expect(list).toHaveLength(1);
    expect(list[0].turns.map((t) => t.seq)).toEqual([1, 2, 3]);
    expect(list[0].turns[0].answerUrl).toMatch(/^memory:\/\/read\/a\/.+\?exp=600$/);
    expect(list[0].turns[2].answerUrl).toBeNull();
  });

  it("returns the memory state", async () => {
    const s = await withTurns();
    const m = (await s.call("GET", `/parents/${s.id}/memory`)).json as { profile: { honorific: string }; episodes: unknown[] };
    expect(m.profile.honorific).toBe("어머님");
    expect(m.episodes).toEqual([]);
  });
});

describe("deferred transcription errors", () => {
  it("reports why each recording failed", async () => {
    const s = await withTurns();
    const { BazeError } = await import("@/lib/baze/client");
    s.deps.baze = { ...s.deps.baze, transcribe: async () => { throw Object.assign(new BazeError("bad_request", 400, "x"), { detail: "Audio duration could not be read" }); } } as never;
    const r = (await s.call("POST", `/parents/${s.id}/transcribe-deferred`)).json as { done: number; left: number; errors: { turnId: number; status: number; detail: string }[] };
    expect(r.done).toBe(0);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatchObject({ status: 400, detail: "Audio duration could not be read" });
  });
});
