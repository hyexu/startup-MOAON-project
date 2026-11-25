import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { parents, questionSeeds, sessions, turns } from "@/lib/db/schema";
import { copyDefaultSeeds, DEFAULT_SEEDS } from "@/lib/seeds";

async function newParent(db: Awaited<ReturnType<typeof makeTestDb>>) {
  const [p] = await db.insert(parents).values({ honorific: "어머님", retainUntil: "2027-11-25" }).returning();
  return p;
}

describe("schema", () => {
  it("copies 18 default seeds covering all five periods in order", async () => {
    const db = await makeTestDb();
    const p = await newParent(db);
    await copyDefaultSeeds(db, p.id);
    const rows = await db.select().from(questionSeeds).where(eq(questionSeeds.parentId, p.id)).orderBy(questionSeeds.position);
    expect(DEFAULT_SEEDS).toHaveLength(18);
    expect(rows).toHaveLength(18);
    expect(rows.map((r) => r.position)).toEqual([...Array(18).keys()]);
    expect(new Set(rows.map((r) => r.period))).toEqual(new Set(["유년", "학창", "청년", "가정·중년", "지금"]));
    expect(rows.every((r) => r.source === "기본" && r.enabled)).toBe(true);
  });

  it("rejects two turns with the same session and seq", async () => {
    const db = await makeTestDb();
    const p = await newParent(db);
    const [s] = await db.insert(sessions).values({ parentId: p.id }).returning();
    await db.insert(turns).values({ sessionId: s.id, parentId: p.id, seq: 1, question: "q", questionSource: "seed" });
    await expect(
      db.insert(turns).values({ sessionId: s.id, parentId: p.id, seq: 1, question: "q2", questionSource: "seed" }),
    ).rejects.toThrow();
  });
});
