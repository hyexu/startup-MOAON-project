import { eq } from "drizzle-orm";
import type { Db } from "./db/types";
import { settings } from "./db/schema";
import { CONFIG } from "./config";
import type { Baze } from "./baze/client";

export type CreditSnapshot = { at: string; keys: { name: string; remaining: number }[] };
export type AiMode = { paused: boolean; reason: "manual" | "credits" | null; snapshot: CreditSnapshot | null };

export async function getSetting<T>(db: Db, key: string): Promise<T | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return (row?.value as T) ?? null;
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

/** Refresh the per-key balance snapshot at most every few minutes. */
export async function creditSnapshot(db: Db, baze: Pick<Baze, "balances">, now = new Date(), force = false): Promise<CreditSnapshot> {
  const snap = await getSetting<CreditSnapshot>(db, "credit_snapshot");
  if (!force && snap && now.getTime() - new Date(snap.at).getTime() < CONFIG.creditSnapshotMaxAgeMs) return snap;
  const fresh = { at: now.toISOString(), keys: await baze.balances() };
  await setSetting(db, "credit_snapshot", fresh);
  return fresh;
}

export async function aiMode(db: Db, baze: Pick<Baze, "balances">, now = new Date()): Promise<AiMode> {
  if (await getSetting<boolean>(db, "ai_paused_manual")) return { paused: true, reason: "manual", snapshot: await getSetting(db, "credit_snapshot") };
  const snapshot = await creditSnapshot(db, baze, now);
  const total = snapshot.keys.reduce((s, k) => s + k.remaining, 0);
  if (total < CONFIG.pauseBelowCredits) return { paused: true, reason: "credits", snapshot };
  return { paused: false, reason: null, snapshot };
}

/** After a "no credit" error, force a fresh balance check on the next call. */
export async function invalidateCredits(db: Db): Promise<void> {
  await setSetting(db, "credit_snapshot", { at: new Date(0).toISOString(), keys: [] });
}
