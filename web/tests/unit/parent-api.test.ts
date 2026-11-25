import { describe, expect, it } from "vitest";
import { makeTestDb } from "@/lib/db/test-db";
import { parents } from "@/lib/db/schema";
import { copyDefaultSeeds } from "@/lib/seeds";
import { createLink, revokeLink } from "@/lib/tokens";
import { memoryStorage } from "@/lib/storage";
import { setSetting } from "@/lib/ai-mode";
import { handleParent, type ParentDeps } from "@/lib/parent-api";

async function setup() {
  const db = await makeTestDb();
  const mk = async (honorific: string) => {
    const [p] = await db.insert(parents).values({ honorific, retainUntil: "2099-01-01" }).returning();
    await copyDefaultSeeds(db, p.id);
    const { url, linkId } = await createLink(db, p.id, "https://x");
    return { p, token: url.split("#k=")[1], linkId };
  };
  const a = await mk("어머님"), b = await mk("아버님");
  await setSetting(db, "ai_paused_manual", true); // no AI needed for these tests
  const later: (() => Promise<void>)[] = [];
  const deps: ParentDeps = {
    db, storage: memoryStorage(), baze: { balances: async () => [] } as never,
    operatorPhone: "010-0000-0000", after: (fn) => { later.push(fn); },
    convert: async (buf, mime) => ({ buf, filename: "a.ogg", mime }), seconds: async () => 1,
  };
  return { db, a, b, deps, later };
}

describe("handleParent", () => {
  it("rejects a revoked link without revealing anything", async () => {
    const s = await setup();
    await revokeLink(s.db, s.a.linkId);
    const r = await handleParent("info", { token: s.a.token }, s.deps);
    expect(r.status).toBe(401);
    expect(JSON.stringify(r.json)).not.toContain("어머님");
  });

  it("requires both consents before starting", async () => {
    const s = await setup();
    expect((await handleParent("start", { token: s.a.token }, s.deps)).status).toBe(403);
    const info = await handleParent("info", { token: s.a.token }, s.deps);
    expect(info.json).toMatchObject({ honorific: "어머님", operatorPhone: "010-0000-0000", consentsDone: false });
    await handleParent("consent", { token: s.a.token, screen: "record" }, s.deps);
    const c = await handleParent("consent", { token: s.a.token, screen: "ai" }, s.deps);
    expect(c.json).toMatchObject({ ok: true, consentsDone: true });
    const start = await handleParent("start", { token: s.a.token }, s.deps);
    expect(start.status).toBe(200);
    expect(start.json).toHaveProperty("question");
    expect(start.json).toHaveProperty("sessionId");
  });

  it("scopes uploads and completions to the link's own parent", async () => {
    const s = await setup();
    for (const x of [s.a, s.b]) {
      await handleParent("consent", { token: x.token, screen: "record" }, s.deps);
      await handleParent("consent", { token: x.token, screen: "ai" }, s.deps);
    }
    const startA = (await handleParent("start", { token: s.a.token }, s.deps)).json as { turnId: number };
    const up = await handleParent("upload-url", { token: s.a.token, turnId: startA.turnId, mime: "audio/webm;codecs=opus" }, s.deps);
    expect((up.json as { path: string }).path.startsWith(`a/${s.a.p.id}/`)).toBe(true);
    expect((up.json as { path: string }).path.endsWith(".webm")).toBe(true);
    expect((await handleParent("upload-url", { token: s.b.token, turnId: startA.turnId, mime: "audio/webm" }, s.deps)).status).toBe(404);
    expect((await handleParent("complete", { token: s.b.token, turnId: startA.turnId, path: null, mime: null, command: "넘어갈게요" }, s.deps)).status).toBe(404);
    expect((await handleParent("complete", { token: s.a.token, turnId: startA.turnId, path: `a/${s.b.p.id}/1.webm`, mime: "audio/webm", command: null }, s.deps)).status).toBe(400);
  });

  it("schedules the recorder after an answered turn", async () => {
    const s = await setup();
    await handleParent("consent", { token: s.a.token, screen: "record" }, s.deps);
    await handleParent("consent", { token: s.a.token, screen: "ai" }, s.deps);
    const t = (await handleParent("start", { token: s.a.token }, s.deps)).json as { turnId: number };
    const up = (await handleParent("upload-url", { token: s.a.token, turnId: t.turnId, mime: "audio/mp4" }, s.deps)).json as { path: string };
    await s.deps.storage.put(up.path, Buffer.from("x"), "audio/mp4");
    const r = await handleParent("complete", { token: s.a.token, turnId: t.turnId, path: up.path, mime: "audio/mp4", command: null }, s.deps);
    expect(r.status).toBe(200);
    expect(s.later).toHaveLength(1);
  });

  it("rejects unknown actions", async () => {
    const s = await setup();
    expect((await handleParent("drop-tables", { token: s.a.token }, s.deps)).status).toBe(404);
  });
});

describe("review fixes: parent api", () => {
  it("rejects a path that climbs out of the turn's own folder", async () => {
    const s = await setup();
    for (const x of [s.a, s.b]) {
      await handleParent("consent", { token: x.token, screen: "record" }, s.deps);
      await handleParent("consent", { token: x.token, screen: "ai" }, s.deps);
    }
    const t = (await handleParent("start", { token: s.a.token }, s.deps)).json as { turnId: number };
    const sneaky = `a/${s.a.p.id}/${t.turnId}./../../${s.b.p.id}/1.webm`;
    const r = await handleParent("complete", { token: s.a.token, turnId: t.turnId, path: sneaky, mime: "audio/webm", command: null }, s.deps);
    expect(r.status).toBe(400);
  });
});
