import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { logError } from "./log";
import { z } from "zod";
import { aiUsage, links, memory, parents, questionSeeds, turns } from "./db/schema";
import { envList, CONFIG } from "./config";
import { copyDefaultSeeds, PERIODS } from "./seeds";
import { createLink, revokeLink } from "./tokens";
import { blankMemory, saveMemory, type MemoryState } from "./memory";
import { aiMode, creditSnapshot, setSetting } from "./ai-mode";
import { audioSeconds, toSttFormat } from "./audio";
import { sessions } from "./db/schema";
import { pcmToMp3 } from "./audio";
import { BazeError } from "./baze/client";
import { recordUsage } from "./usage";
import type { TurnDeps } from "./turn";

export type AdminDeps = TurnDeps & { after: (fn: () => Promise<void>) => void };
export type AdminRequest = { method: string; path: string; body: unknown; adminEmail: string | null; origin: string };
type Out = { status: number; json: unknown };
type Handler = (m: string[], body: unknown, d: AdminDeps, req: AdminRequest) => Promise<Out>;

const ok = (json: unknown): Out => ({ status: 200, json });
const bad = (error: string, status = 400): Out => ({ status, json: { error } });

const parentInput = z.object({
  honorific: z.string().trim().min(1).max(40),
  realName: z.string().trim().max(40).optional().nullable(),
  birthYear: z.coerce.number().int().min(1900).max(2030).optional().nullable(),
  hometown: z.string().trim().max(80).optional().nullable(),
  job: z.string().trim().max(80).optional().nullable(),
  familyNote: z.string().trim().max(1000).optional().nullable(),
  guardianContact: z.string().trim().max(80).optional().nullable(),
  retainUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const seedInput = z.array(z.object({
  id: z.number().int().optional(),
  period: z.enum(PERIODS),
  text: z.string().trim().min(1).max(300),
  source: z.enum(["기본", "가족"]),
  position: z.number().int(),
  enabled: z.boolean(),
}).passthrough()).max(200);

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };

export function linkMessage(honorific: string, url: string): string {
  return `${honorific}, 안녕하세요. 모아온입니다.\n살아오신 이야기를 여쭙고 싶어요.\n\n${url}\n\n링크를 누르고 말씀하시듯 답해 주시면 됩니다.`;
}

/** Pre-voice enabled seeds that have no audio yet (used when AI is paused and for faster replies). */
export async function voiceSeeds(d: AdminDeps, parentId: number): Promise<void> {
  if ((await aiMode(d.db, d.baze)).paused) return;
  const seeds = await d.db.select().from(questionSeeds)
    .where(and(eq(questionSeeds.parentId, parentId), eq(questionSeeds.enabled, true), isNull(questionSeeds.audioPath), isNull(questionSeeds.usedAt)));
  for (const s of seeds) {
    try {
      const r = await d.baze.speak(s.text);
      const path = `s/${parentId}/${s.id}.mp3`;
      await d.storage.put(path, await (d.toMp3 ?? pcmToMp3)(r.pcm), "audio/mpeg");
      await d.db.update(questionSeeds).set({ audioPath: path }).where(eq(questionSeeds.id, s.id));
      await recordUsage(d.db, r.usage, { parentId });
    } catch (e) {
      logError("seed voice failed", e);
    }
  }
}

const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/parents$/, async (_m, _b, d) => {
    const ps = await d.db.select().from(parents).orderBy(asc(parents.id));
    const last = await d.db.select({ parentId: turns.parentId, at: sql<string>`max(${turns.completedAt})` }).from(turns)
      .where(isNotNull(turns.answerAudioPath)).groupBy(turns.parentId);
    const credits = await d.db.select({ parentId: aiUsage.parentId, credits: sql<number>`coalesce(sum(${aiUsage.credits}), 0)::float` })
      .from(aiUsage).where(gte(aiUsage.createdAt, monthStart())).groupBy(aiUsage.parentId);
    const mems = await d.db.select({ parentId: memory.parentId, state: memory.state }).from(memory);
    return ok(ps.map((p) => ({
      id: p.id, honorific: p.honorific, status: p.status, retainUntil: p.retainUntil,
      lastAnswerAt: last.find((l) => l.parentId === p.id)?.at ?? null,
      periods: (mems.find((m) => m.parentId === p.id)?.state as MemoryState | undefined)?.periods ?? null,
      monthCredits: credits.find((c) => c.parentId === p.id)?.credits ?? 0,
    })));
  }],
  ["POST", /^\/parents$/, async (_m, body, d) => {
    const v = parentInput.safeParse(body);
    if (!v.success) return bad("invalid");
    const retainUntil = v.data.retainUntil ?? new Date(Date.now() + CONFIG.retentionDays * 86400e3).toISOString().slice(0, 10);
    const [p] = await d.db.insert(parents).values({ ...v.data, retainUntil }).returning();
    await copyDefaultSeeds(d.db, p.id);
    await saveMemory(d.db, p.id, blankMemory(p.honorific));
    d.after(() => voiceSeeds(d, p.id));
    return ok({ id: p.id });
  }],
  ["GET", /^\/parents\/(\d+)$/, async (m, _b, d) => {
    const [p] = await d.db.select().from(parents).where(eq(parents.id, Number(m[1])));
    return p ? ok(p) : bad("not_found", 404);
  }],
  ["PUT", /^\/parents\/(\d+)$/, async (m, body, d) => {
    const v = parentInput.safeParse(body);
    if (!v.success) return bad("invalid");
    const r = await d.db.update(parents).set(v.data).where(eq(parents.id, Number(m[1]))).returning({ id: parents.id });
    return r.length ? ok({ ok: true }) : bad("not_found", 404);
  }],
  ["GET", /^\/parents\/(\d+)\/seeds$/, async (m, _b, d) =>
    ok(await d.db.select().from(questionSeeds).where(eq(questionSeeds.parentId, Number(m[1]))).orderBy(asc(questionSeeds.position)))],
  ["PUT", /^\/parents\/(\d+)\/seeds$/, async (m, body, d) => {
    const parentId = Number(m[1]);
    const v = seedInput.safeParse(body);
    if (!v.success) return bad("invalid");
    const existing = await d.db.select().from(questionSeeds).where(eq(questionSeeds.parentId, parentId));
    const byId = new Map(existing.map((s) => [s.id, s]));
    for (const s of v.data) {
      const prev = s.id ? byId.get(s.id) : undefined;
      if (s.id && !prev) return bad("unknown_seed");
      if (prev?.usedAt && prev.text !== s.text) return bad("used_seed_text");
    }
    const keep = new Set(v.data.filter((s) => s.id).map((s) => s.id!));
    const removable = existing.filter((s) => !keep.has(s.id) && !s.usedAt).map((s) => s.id);
    if (existing.some((s) => !keep.has(s.id) && s.usedAt)) return bad("used_seed_removed");
    if (removable.length) await d.db.delete(questionSeeds).where(inArray(questionSeeds.id, removable));
    for (const s of v.data) {
      const row = { period: s.period, text: s.text, source: s.source, position: s.position, enabled: s.enabled };
      if (s.id) {
        const changed = byId.get(s.id)!.text !== s.text;
        await d.db.update(questionSeeds).set(changed ? { ...row, audioPath: null } : row).where(eq(questionSeeds.id, s.id));
      } else await d.db.insert(questionSeeds).values({ ...row, parentId });
    }
    d.after(() => voiceSeeds(d, parentId));
    return ok({ ok: true });
  }],
  ["GET", /^\/parents\/(\d+)\/links$/, async (m, _b, d) =>
    ok(await d.db.select({ id: links.id, createdAt: links.createdAt, expiresAt: links.expiresAt, revokedAt: links.revokedAt, lastUsedAt: links.lastUsedAt })
      .from(links).where(eq(links.parentId, Number(m[1]))).orderBy(desc(links.id)))],
  ["POST", /^\/parents\/(\d+)\/links$/, async (m, _b, d, req) => {
    const [p] = await d.db.select().from(parents).where(eq(parents.id, Number(m[1])));
    if (!p) return bad("not_found", 404);
    const l = await createLink(d.db, p.id, req.origin);
    return ok({ url: l.url, expiresAt: l.expiresAt, message: linkMessage(p.honorific, l.url) });
  }],
  ["POST", /^\/links\/(\d+)\/revoke$/, async (m, _b, d) => { await revokeLink(d.db, Number(m[1])); return ok({ ok: true }); }],
  ["GET", /^\/parents\/(\d+)\/sessions$/, async (m, _b, d) => {
    const parentId = Number(m[1]);
    const ss = await d.db.select().from(sessions).where(eq(sessions.parentId, parentId)).orderBy(desc(sessions.id));
    const ts = await d.db.select().from(turns).where(eq(turns.parentId, parentId)).orderBy(asc(turns.seq));
    return ok(await Promise.all(ss.map(async (s) => ({
      id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, summary: s.summary,
      turns: await Promise.all(ts.filter((t) => t.sessionId === s.id).map(async (t) => ({
        id: t.id, seq: t.seq, question: t.question, source: t.questionSource, command: t.command, stt: t.stt,
        answerSec: t.answerSec, transcript: t.transcriptEdited ?? t.transcript, completedAt: t.completedAt,
        answerUrl: t.answerAudioPath ? await d.storage.signedReadUrl(t.answerAudioPath, 600) : null,
      }))),
    }))));
  }],
  ["GET", /^\/parents\/(\d+)\/memory$/, async (m, _b, d) => {
    const [row] = await d.db.select().from(memory).where(eq(memory.parentId, Number(m[1])));
    return row ? ok(row.state) : bad("not_found", 404);
  }],
  ["GET", /^\/credits$/, async (_m, _b, d) => {
    const mode = await aiMode(d.db, d.baze);
    const snap = mode.snapshot ?? (await creditSnapshot(d.db, d.baze));
    const [u] = await d.db.select({
      credits: sql<number>`coalesce(sum(${aiUsage.credits}), 0)::float`, costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float`,
    }).from(aiUsage).where(gte(aiUsage.createdAt, monthStart()));
    const [t] = await d.db.select({ n: sql<number>`count(*)::int` }).from(turns)
      .where(and(isNotNull(turns.answerAudioPath), gte(turns.completedAt, monthStart())));
    return ok({
      keys: snap.keys, snapshotAt: snap.at, paused: mode.paused, reason: mode.reason,
      monthUsage: { credits: u.credits, costUsd: u.costUsd, turns: t.n },
      avgCreditsPerTurn: t.n ? Math.round(u.credits / t.n) : 0,
    });
  }],
  ["PUT", /^\/ai-pause$/, async (_m, body, d) => {
    await setSetting(d.db, "ai_paused_manual", (body as { paused?: unknown })?.paused === true);
    if ((body as { paused?: unknown })?.paused !== true) await creditSnapshot(d.db, d.baze, new Date(), true);
    return ok({ ok: true });
  }],
  ["POST", /^\/parents\/(\d+)\/transcribe-deferred$/, async (m, _b, d) => {
    const parentId = Number(m[1]);
    if ((await aiMode(d.db, d.baze)).paused) return bad("ai_paused", 409);
    const waiting = await d.db.select().from(turns)
      .where(and(eq(turns.parentId, parentId), eq(turns.stt, "deferred"), isNotNull(turns.answerAudioPath))).orderBy(asc(turns.id));
    let done = 0, empty = 0;
    const errors: { turnId: number; status: number; detail: string; storedBytes: number | null; sentBytes: number | null; mime: string | null }[] = [];
    for (const t of waiting) {
      let storedBytes: number | null = null, sentBytes: number | null = null;
      try {
        const raw = await d.storage.get(t.answerAudioPath!);
        storedBytes = raw.length;
        if (raw.length === 0) {
          await d.db.update(turns).set({ stt: "empty", transcript: "" }).where(eq(turns.id, t.id));
          done++; empty++;
          continue;
        }
        const conv = await (d.convert ?? toSttFormat)(raw, t.answerMime ?? "audio/webm");
        sentBytes = conv.buf.length;
        const r = await d.baze.transcribe(conv.buf, conv.filename, conv.mime);
        await recordUsage(d.db, r.usage, { parentId, sessionId: t.sessionId });
        const sec = t.answerSec ?? (await (d.seconds ?? audioSeconds)(conv.buf, conv.mime).catch(() => null));
        await d.db.update(turns).set({ transcript: r.text, stt: r.text.trim() ? "done" : "empty", status: "정리 완료", answerSec: sec }).where(eq(turns.id, t.id));
        done++;
      } catch (e) {
        logError("deferred stt failed", e);
        errors.push({
          turnId: t.id, status: e instanceof BazeError ? e.status : 0,
          detail: e instanceof BazeError ? e.detail || e.message : e instanceof Error ? e.message.slice(0, 200) : "error",
          storedBytes, sentBytes, mime: t.answerMime,
        });
        if (e instanceof BazeError && e.code === "no_credit") break;
      }
    }
    return ok({ done, empty, left: waiting.length - done, errors });
  }],
];

export function isAdmin(email: string | null): boolean {
  return !!email && envList("ADMIN_EMAILS").map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

export async function handleAdmin(req: AdminRequest, d: AdminDeps): Promise<Out> {
  if (!isAdmin(req.adminEmail)) return bad("unauthorized", 401);
  for (const [method, re, fn] of routes) {
    const m = req.path.match(re);
    if (m && method === req.method) return fn(m, req.body, d, req);
  }
  return bad("not_found", 404);
}

export { routes as adminRoutes };
