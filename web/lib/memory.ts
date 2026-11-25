import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./db/types";
import { memory } from "./db/schema";
import { PERIODS } from "./seeds";

import { FUNNEL } from "./funnel";
export { FUNNEL };

const episodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  period: z.string(),
  age: z.string(),
  place: z.string(),
  people: z.string(),
  story: z.string(),
  senses: z.string(),
  quotes: z.array(z.string()),
  emotion: z.string(),
  meaning: z.string(),
  uncertain: z.string(),
  visibility: z.enum(["공개", "비공개", "확인 필요"]),
  funnel: z.array(z.string()),
});

export const memorySchema = z.object({
  profile: z.object({
    respondent: z.string(),
    honorific: z.string(),
    birthYear: z.string(),
    birthplace: z.string(),
    purpose: z.string(),
    lifeMap: z.string(),
  }),
  currentPeriod: z.string(),
  currentEpisodeId: z.string(),
  periods: z.object(Object.fromEntries(PERIODS.map((p) => [p, z.number()])) as Record<(typeof PERIODS)[number], z.ZodNumber>),
  episodes: z.array(episodeSchema),
});

export type MemoryState = z.infer<typeof memorySchema>;
export type Episode = MemoryState["episodes"][number];

/** JSON schema handed to the recorder as its structured output format. */
export const memoryJsonSchema = z.toJSONSchema(memorySchema);

export function blankMemory(honorific: string): MemoryState {
  return {
    profile: { respondent: "본인", honorific, birthYear: "", birthplace: "", purpose: "", lifeMap: "" },
    currentPeriod: "시작",
    currentEpisodeId: "",
    periods: Object.fromEntries(PERIODS.map((p) => [p, 0])) as MemoryState["periods"],
    episodes: [],
  };
}

const clamp = (n: number) => Math.max(0, Math.min(3, Math.round(n)));
const funnelOnly = (steps: string[]) => steps.filter((s) => (FUNNEL as readonly string[]).includes(s));

/** Accept the recorder's new state without ever losing or un-hiding what was already recorded. */
export function mergeMemory(prev: MemoryState, next: unknown): MemoryState {
  const parsed = memorySchema.safeParse(next);
  if (!parsed.success) return prev;
  const n = parsed.data;
  const prevById = new Map(prev.episodes.map((e) => [e.id, e]));
  const episodes = n.episodes.map((e) => ({
    ...e,
    funnel: funnelOnly(e.funnel),
    visibility: prevById.get(e.id)?.visibility === "비공개" ? ("비공개" as const) : e.visibility,
  }));
  const seen = new Set(episodes.map((e) => e.id));
  for (const e of prev.episodes) if (!seen.has(e.id)) episodes.push(e);
  return {
    ...n,
    periods: Object.fromEntries(PERIODS.map((p) => [p, clamp(n.periods[p])])) as MemoryState["periods"],
    episodes,
  };
}

export async function loadMemory(db: Db, parentId: number): Promise<{ state: MemoryState; version: number }> {
  const [row] = await db.select().from(memory).where(eq(memory.parentId, parentId));
  if (!row) return { state: blankMemory(""), version: 0 };
  return { state: row.state as MemoryState, version: row.version };
}

export async function saveMemory(db: Db, parentId: number, state: MemoryState): Promise<void> {
  await db
    .insert(memory)
    .values({ parentId, state, version: 1 })
    .onConflictDoUpdate({
      target: memory.parentId,
      set: { state, version: sql`${memory.version} + 1`, updatedAt: sql`now()` },
    });
}
