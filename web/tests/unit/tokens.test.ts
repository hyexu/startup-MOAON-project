import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "@/lib/db/test-db";
import { links, parents } from "@/lib/db/schema";
import { createLink, hashToken, newToken, resolveToken, revokeLink } from "@/lib/tokens";
import { hasAllConsents, recordConsent } from "@/lib/consent";

async function setup(retainUntil = "2099-01-01") {
  const db = await makeTestDb();
  const [p] = await db.insert(parents).values({ honorific: "어머님", retainUntil }).returning();
  return { db, p };
}
const tokenOf = (url: string) => url.split("#k=")[1];

describe("link tokens", () => {
  it("resolves a fresh token to its parent and stores only the hash", async () => {
    const { db, p } = await setup();
    const { url, linkId } = await createLink(db, p.id, "https://example.test");
    expect(url.startsWith("https://example.test/r#k=")).toBe(true);
    const token = tokenOf(url);
    expect(await resolveToken(db, token)).toEqual({ linkId, parentId: p.id });
    const [row] = await db.select().from(links).where(eq(links.id, linkId));
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("rejects wrong, revoked, expired tokens and parents past retention", async () => {
    const { db, p } = await setup();
    expect(await resolveToken(db, newToken().token)).toBeNull();
    const a = await createLink(db, p.id, "https://x");
    await revokeLink(db, a.linkId);
    expect(await resolveToken(db, tokenOf(a.url))).toBeNull();
    const b = await createLink(db, p.id, "https://x", -1);
    expect(await resolveToken(db, tokenOf(b.url))).toBeNull();
    const old = await setup("2000-01-01");
    const c = await createLink(old.db, old.p.id, "https://x");
    expect(await resolveToken(old.db, tokenOf(c.url))).toBeNull();
  });
});

describe("consents", () => {
  it("needs both screens before everything is consented", async () => {
    const { db, p } = await setup();
    const { linkId } = await createLink(db, p.id, "https://x");
    await recordConsent(db, p.id, linkId, "record");
    expect(await hasAllConsents(db, p.id)).toBe(false);
    await recordConsent(db, p.id, linkId, "ai");
    expect(await hasAllConsents(db, p.id)).toBe(true);
  });
});
