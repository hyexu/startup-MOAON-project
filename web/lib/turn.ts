import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "./db/types";
import { parents, questionSeeds, sessions, turns } from "./db/schema";
import { CONFIG } from "./config";
import { BazeError, type Baze } from "./baze/client";
import { aiMode, invalidateCredits, type AiMode } from "./ai-mode";
import { audioSeconds, pcmToMp3, toSttFormat } from "./audio";
import type { Storage } from "./storage";
import { recordUsage, type UsageRow } from "./usage";
import { blankMemory, loadMemory, memoryJsonSchema, mergeMemory, saveMemory } from "./memory";
import { buildInterviewerRequest, type PromptTurn } from "./prompts/interviewer";
import { buildRecorderRequest, RECORDER_SYSTEM } from "./prompts/recorder";
import { logError } from "./log";

export const EMPTY_ANSWER_PREFIX = "소리가 잘 안 들렸어요. 한 번만 더 말씀해 주시겠어요?";
export const CONTINUE_PREFIX = "말씀이 중간에 끊겼어요. 이어서 말씀해 주세요.";
export const CLOSING_TEXT = "오늘 들려주신 이야기 정말 고맙습니다. 다음에 또 여쭤볼게요.";
export const END_COMMAND = "오늘은 여기까지";
const CLAIM_STALE_SEC = 110;
const WAIT_MAX_SEC = 100;
const RESUME_HOURS = 24;

export class NotFound extends Error {
  constructor() { super("not found"); this.name = "NotFound"; }
}

export type TurnOut = { turnId: number; seq: number; question: string; audioUrl: string | null; source: "ai" | "seed" | "system"; done: boolean };

export type TurnDeps = {
  db: Db;
  baze: Baze;
  storage: Storage;
  now?: () => Date;
  convert?: typeof toSttFormat;
  seconds?: typeof audioSeconds;
  toMp3?: typeof pcmToMp3;
  sleep?: (ms: number) => Promise<void>;
};

type TurnRow = typeof turns.$inferSelect;
const nowOf = (d: TurnDeps) => (d.now ?? (() => new Date()))();

async function log(d: TurnDeps, u: UsageRow, parentId: number, sessionId?: number) {
  await recordUsage(d.db, u, { parentId, sessionId });
}

function kstDayStart(now: Date): Date {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600e3);
}

/** Answered turns, oldest first. `current` is the turn being completed right now (its completedAt is not set yet). */
async function promptTurns(db: Db, parentId: number, current?: number): Promise<PromptTurn[]> {
  const rows = await db.select().from(turns)
    .where(and(eq(turns.parentId, parentId), current ? or(isNotNull(turns.completedAt), eq(turns.id, current)) : isNotNull(turns.completedAt)))
    .orderBy(desc(turns.id)).limit(CONFIG.recentTurns + 1);
  return rows.reverse().map((t) => ({ question: t.question, answer: t.transcriptEdited ?? t.transcript, command: t.command }));
}

async function unusedSeeds(db: Db, parentId: number) {
  return db.select().from(questionSeeds)
    .where(and(eq(questionSeeds.parentId, parentId), eq(questionSeeds.enabled, true), isNull(questionSeeds.usedAt)))
    .orderBy(asc(questionSeeds.position));
}

type Next = { text: string; source: TurnOut["source"]; audioPath: string | null; done: boolean };

/** The next seed question, or the fixed closing when none are left. */
async function seedNext(d: TurnDeps, parentId: number): Promise<Next> {
  const [seed] = await unusedSeeds(d.db, parentId);
  if (!seed) return { text: CLOSING_TEXT, source: "system", audioPath: null, done: true };
  await d.db.update(questionSeeds).set({ usedAt: nowOf(d) }).where(eq(questionSeeds.id, seed.id));
  return { text: seed.text, source: "seed", audioPath: seed.audioPath, done: false };
}

/** Ask the interviewer. Returns null on any failure so the caller can fall back to a seed. */
async function interviewerNext(d: TurnDeps, parentId: number, sessionId: number, isNewSession: boolean, current?: number): Promise<string | null> {
  const [p] = await d.db.select().from(parents).where(eq(parents.id, parentId));
  const mem = await loadMemory(d.db, parentId);
  const [prev] = await d.db.select({ summary: sessions.summary }).from(sessions)
    .where(and(eq(sessions.parentId, parentId), isNotNull(sessions.endedAt))).orderBy(desc(sessions.id)).limit(1);
  const seeds = (await unusedSeeds(d.db, parentId)).map((s) => ({ period: s.period, text: s.text }));
  const req = buildInterviewerRequest({
    honorific: p.honorific, state: mem.version ? mem.state : blankMemory(p.honorific), seeds,
    lastSessionSummary: prev?.summary ?? null, isNewSession, turns: await promptTurns(d.db, parentId, current),
  });
  try {
    const r = await d.baze.message({
      model: CONFIG.models.interviewer, system: req.system, messages: req.messages, maxTokens: 600, effort: CONFIG.effort.interviewer, kind: "interviewer",
    });
    await log(d, r.usage, parentId, sessionId);
    return r.text.trim() || null;
  } catch (e) {
    if (e instanceof BazeError && e.code === "no_credit") await invalidateCredits(d.db);
    logError("interviewer failed", e);
    return null;
  }
}

async function speakTo(d: TurnDeps, text: string, path: string, parentId: number, sessionId: number): Promise<string | null> {
  try {
    const r = await d.baze.speak(text);
    await d.storage.put(path, await (d.toMp3 ?? pcmToMp3)(r.pcm), "audio/mpeg");
    await log(d, r.usage, parentId, sessionId);
    return path;
  } catch (e) {
    if (e instanceof BazeError && e.code === "no_credit") await invalidateCredits(d.db);
    logError("tts failed", e);
    return null;
  }
}

async function todayCount(d: TurnDeps, parentId: number): Promise<number> {
  const [r] = await d.db.select({ n: sql<number>`count(*)::int` }).from(turns)
    .where(and(eq(turns.parentId, parentId), gte(turns.completedAt, kstDayStart(nowOf(d)))));
  return r.n;
}

/** Insert the next turn (or the closing turn), voice it, and return it. */
async function emit(d: TurnDeps, mode: AiMode, parentId: number, sessionId: number, next: Next, completes?: number): Promise<TurnOut> {
  // The follow-up row and the answered turn's completedAt are written together, so a waiting duplicate request
  // never sees a completed turn without its follow-up.
  const row = await d.db.transaction(async (tx) => {
    const [{ maxSeq }] = await tx.select({ maxSeq: sql<number>`coalesce(max(${turns.seq}), 0)::int` }).from(turns).where(eq(turns.sessionId, sessionId));
    const [r] = await tx.insert(turns).values({
      sessionId, parentId, seq: maxSeq + 1, question: next.text, questionSource: next.source,
      completedAt: next.done ? nowOf(d) : null,
    }).returning();
    if (completes) await tx.update(turns).set({ completedAt: nowOf(d) }).where(eq(turns.id, completes));
    return r;
  });
  let audioPath = next.audioPath;
  if (!audioPath && !mode.paused) audioPath = await speakTo(d, next.text, `q/${parentId}/${row.id}.mp3`, parentId, sessionId);
  if (audioPath) await d.db.update(turns).set({ questionAudioPath: audioPath }).where(eq(turns.id, row.id));
  if (next.done) await d.db.update(sessions).set({ endedAt: nowOf(d), endReason: "done", summary: next.text }).where(eq(sessions.id, sessionId));
  const audioUrl = audioPath ? await d.storage.signedReadUrl(audioPath, 3600).catch(() => null) : null;
  return { turnId: row.id, seq: row.seq, question: next.text, audioUrl, source: next.source, done: next.done };
}

async function toOut(d: TurnDeps, t: TurnRow): Promise<TurnOut> {
  const [s] = await d.db.select().from(sessions).where(eq(sessions.id, t.sessionId));
  const [later] = await d.db.select({ id: turns.id }).from(turns).where(and(eq(turns.sessionId, t.sessionId), gt(turns.id, t.id))).limit(1);
  return {
    turnId: t.id, seq: t.seq, question: t.question,
    audioUrl: t.questionAudioPath ? await d.storage.signedReadUrl(t.questionAudioPath, 3600).catch(() => null) : null,
    source: t.questionSource as TurnOut["source"], done: !!s.endedAt && !later,
  };
}

/** First question of a new session, or the pending question of an open one. */
export async function startSession(d: TurnDeps, parentId: number): Promise<{ sessionId: number; turn: TurnOut }> {
  const since = new Date(nowOf(d).getTime() - RESUME_HOURS * 3600e3);
  const [open] = await d.db.select().from(sessions)
    .where(and(eq(sessions.parentId, parentId), isNull(sessions.endedAt), gte(sessions.startedAt, since)))
    .orderBy(desc(sessions.id)).limit(1);
  if (open) {
    const [pending] = await d.db.select().from(turns)
      .where(and(eq(turns.sessionId, open.id), isNull(turns.completedAt))).orderBy(desc(turns.id)).limit(1);
    if (pending) return { sessionId: open.id, turn: await toOut(d, pending) };
  }
  const [{ n: previous }] = await d.db.select({ n: sql<number>`count(*)::int` }).from(sessions).where(eq(sessions.parentId, parentId));
  const [s] = await d.db.insert(sessions).values({ parentId, startedAt: nowOf(d) }).returning();
  const mode = await aiMode(d.db, d.baze, nowOf(d));
  let next: Next | null = null;
  if (!mode.paused) {
    const text = await interviewerNext(d, parentId, s.id, previous > 0);
    if (text) next = { text, source: "ai", audioPath: null, done: false };
  }
  next ??= await seedNext(d, parentId);
  return { sessionId: s.id, turn: await emit(d, mode, parentId, s.id, next) };
}

async function claim(d: TurnDeps, turnId: number): Promise<boolean> {
  const stale = new Date(nowOf(d).getTime() - CLAIM_STALE_SEC * 1000);
  const r = await d.db.update(turns).set({ claimedAt: nowOf(d) })
    .where(and(eq(turns.id, turnId), isNull(turns.completedAt), or(isNull(turns.claimedAt), lt(turns.claimedAt, stale))))
    .returning({ id: turns.id });
  return r.length === 1;
}

async function followUp(d: TurnDeps, t: TurnRow): Promise<TurnOut | null> {
  const [n] = await d.db.select().from(turns).where(and(eq(turns.sessionId, t.sessionId), gt(turns.id, t.id))).orderBy(asc(turns.id)).limit(1);
  return n ? toOut(d, n) : null;
}

/** A duplicate request waits for the first one's follow-up question instead of failing. */
async function waitForFollowUp(d: TurnDeps, t: TurnRow): Promise<TurnOut> {
  const sleep = d.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 0; i < WAIT_MAX_SEC * 4; i++) {
    const n = await followUp(d, t);
    if (n) return n;
    await sleep(250);
  }
  throw new Error("turn still processing");
}

export type CompleteArgs = { parentId: number; turnId: number; audioPath: string | null; mime: string | null; command: string | null; partial?: boolean };

/** Save the answer, transcribe it, and produce the next question. Safe to call twice for the same turn. */
export async function completeTurn(d: TurnDeps, a: CompleteArgs): Promise<TurnOut> {
  const [t] = await d.db.select().from(turns).where(eq(turns.id, a.turnId));
  if (!t || t.parentId !== a.parentId) throw new NotFound();
  const existing = await followUp(d, t);
  if (existing) return existing;
  if (!(await claim(d, t.id))) return waitForFollowUp(d, t);

  try {
    const mode = await aiMode(d.db, d.baze, nowOf(d));
    let transcript: string | null = null, stt = "none", answerSec: number | null = null;
    if (a.audioPath && a.mime) {
      stt = "deferred";
      try {
        const raw = await d.storage.get(a.audioPath);
        const conv = await (d.convert ?? toSttFormat)(raw, a.mime);
        answerSec = await (d.seconds ?? audioSeconds)(conv.buf, conv.mime).catch(() => null);
        if (!mode.paused) {
          try {
            const r = await d.baze.transcribe(conv.buf, conv.filename, conv.mime);
            await log(d, r.usage, a.parentId, t.sessionId);
            transcript = r.text;
            stt = r.text.trim() ? "done" : "empty";
          } catch (e) {
            if (e instanceof BazeError && e.code === "no_credit") await invalidateCredits(d.db);
            logError("stt failed", e);
          }
        }
      } catch (e) {
        // A recording we cannot read or convert must not trap the parent: keep it for the operator and move on.
        stt = "failed";
        logError("audio read/convert failed", e);
      }
    }
    await d.db.update(turns).set({
      answerAudioPath: a.audioPath, answerMime: a.mime, answerSec, transcript, stt, command: a.command,
      status: stt === "done" ? "정리 완료" : "녹취 도착",
    }).where(eq(turns.id, t.id));

    let next: Next | null = null;
    const ending = a.command === END_COMMAND;
    if (a.partial && !a.command) {
      next = { text: `${CONTINUE_PREFIX} ${t.question}`, source: "system", audioPath: null, done: false };
    } else if (stt === "empty" && !a.command) {
      next = { text: `${EMPTY_ANSWER_PREFIX} ${t.question}`, source: "system", audioPath: null, done: false };
    } else if (!mode.paused && (ending || (await todayCount(d, a.parentId)) + 1 <= CONFIG.dailyTurnCap)) {
      const text = await interviewerNext(d, a.parentId, t.sessionId, false, t.id);
      if (text) next = { text, source: "ai", audioPath: null, done: ending };
    }
    if (!next && ending) next = { text: CLOSING_TEXT, source: "system", audioPath: null, done: true };
    next ??= await seedNext(d, a.parentId);
    return await emit(d, mode, a.parentId, t.sessionId, next, t.id);
  } catch (e) {
    await d.db.update(turns).set({ claimedAt: null }).where(and(eq(turns.id, t.id), isNull(turns.completedAt)));
    throw e;
  }
}

/** Update the episode cards from the latest turns. Never throws. */
export async function runRecorder(d: TurnDeps, parentId: number): Promise<void> {
  try {
    if ((await aiMode(d.db, d.baze, nowOf(d))).paused) return;
    const [p] = await d.db.select().from(parents).where(eq(parents.id, parentId));
    const mem = await loadMemory(d.db, parentId);
    const state = mem.version ? mem.state : blankMemory(p.honorific);
    const req = buildRecorderRequest({ state, turns: await promptTurns(d.db, parentId) });
    const r = await d.baze.message({
      model: CONFIG.models.recorder, system: RECORDER_SYSTEM, messages: req.messages, maxTokens: 8000,
      effort: CONFIG.effort.recorder, jsonSchema: memoryJsonSchema, kind: "recorder",
    });
    await log(d, r.usage, parentId);
    if (r.json) await saveMemory(d.db, parentId, mergeMemory(state, r.json));
  } catch (e) {
    logError("recorder failed", e);
  }
}
