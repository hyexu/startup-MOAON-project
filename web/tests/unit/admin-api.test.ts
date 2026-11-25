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
