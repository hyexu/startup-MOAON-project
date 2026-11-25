import { describe, expect, it } from "vitest";
import { blankMemory, loadMemory, mergeMemory, saveMemory, type MemoryState } from "@/lib/memory";
import { makeTestDb } from "@/lib/db/test-db";
import { parents } from "@/lib/db/schema";

const episode = (id: string, extra: Partial<MemoryState["episodes"][number]> = {}) => ({
  id, title: "감나무 집", period: "유년", age: "", place: "", people: "", story: "마당에 감나무가 있었다.",
  senses: "", quotes: [], emotion: "", meaning: "", uncertain: "", visibility: "공개" as const, funnel: ["열기"], ...extra,
});

function withEpisodes(...eps: ReturnType<typeof episode>[]): MemoryState {
  return { ...blankMemory("어머님"), episodes: eps };
}

describe("mergeMemory", () => {
  it("keeps the previous state when the recorder output does not match the schema", () => {
    const prev = withEpisodes(episode("e1"));
    expect(mergeMemory(prev, { nonsense: true })).toEqual(prev);
  });

  it("keeps episodes the recorder left out", () => {
    const prev = withEpisodes(episode("e1"), episode("e2", { title: "등굣길" }));
    const next = withEpisodes(episode("e1", { story: "보강됨" }));
    const merged = mergeMemory(prev, next);
    expect(merged.episodes.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(merged.episodes[0].story).toBe("보강됨");
  });

  it("never turns a private episode back to public", () => {
    const prev = withEpisodes(episode("e1", { visibility: "비공개" }));
    const merged = mergeMemory(prev, withEpisodes(episode("e1", { visibility: "공개" })));
    expect(merged.episodes[0].visibility).toBe("비공개");
  });

  it("clamps period scores to 0..3 and drops unknown funnel steps", () => {
    const next = withEpisodes(episode("e1", { funnel: ["열기", "아무거나"] }));
    next.periods = { ...next.periods, 유년: 7 };
    const merged = mergeMemory(blankMemory("어머님"), next);
    expect(merged.periods["유년"]).toBe(3);
    expect(merged.episodes[0].funnel).toEqual(["열기"]);
  });
});

describe("saveMemory", () => {
  it("increments the version on each save", async () => {
    const db = await makeTestDb();
    const [p] = await db.insert(parents).values({ honorific: "어머님", retainUntil: "2027-11-25" }).returning();
    await saveMemory(db, p.id, blankMemory("어머님"));
    await saveMemory(db, p.id, blankMemory("어머님"));
    await saveMemory(db, p.id, blankMemory("어머님"));
    const loaded = await loadMemory(db, p.id);
    expect(loaded.version).toBe(3);
    expect(loaded.state.profile.honorific).toBe("어머님");
  });
});
