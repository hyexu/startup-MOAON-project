import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "./db/types";
import { links, parents } from "./db/schema";
import { CONFIG } from "./config";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** Issue a parent link. The raw token appears only in the returned URL, after "#". */
export async function createLink(db: Db, parentId: number, origin: string, days: number = CONFIG.linkDays) {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + days * 86400e3);
  const [row] = await db.insert(links).values({ parentId, tokenHash: hash, expiresAt }).returning({ id: links.id });
  return { linkId: row.id, url: `${origin.replace(/\/$/, "")}/r#k=${token}`, expiresAt };
}

export async function resolveToken(db: Db, token: string): Promise<{ linkId: number; parentId: number } | null> {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ linkId: links.id, parentId: links.parentId })
    .from(links)
    .innerJoin(parents, eq(parents.id, links.parentId))
    .where(and(
      eq(links.tokenHash, hashToken(token)),
      isNull(links.revokedAt),
      gt(links.expiresAt, sql`now()`),
      sql`${parents.retainUntil} >= current_date`,
    ));
  if (!row) return null;
  await db.update(links).set({ lastUsedAt: sql`now()` }).where(eq(links.id, row.linkId));
  return row;
}

export async function revokeLink(db: Db, linkId: number): Promise<void> {
  await db.update(links).set({ revokedAt: sql`now()` }).where(eq(links.id, linkId));
}
