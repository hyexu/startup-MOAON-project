import { sql } from "drizzle-orm";
import type { Db } from "./db/types";
import type { Storage } from "./storage";

export type Health = { db: string; tables: string; storage: string; bazeKeys: number };

/** Error code only (e.g. "28P01"); messages can contain user names or hosts. */
function codeOf(e: unknown): string {
  const c = (e as { cause?: { code?: unknown }; code?: unknown }) ?? {};
  const code = c.cause?.code ?? c.code;
  return typeof code === "string" && /^[A-Z0-9_]{2,20}$/i.test(code) ? code : "error";
}

/** Setup check for the operator: is each dependency reachable? Reveals no values. */
export async function checkHealth(deps: { db: () => Promise<Db> | Db; storage: () => Storage; keyCount: number }): Promise<Health> {
  const out: Health = { db: "ok", tables: "ok", storage: "ok", bazeKeys: deps.keyCount };
  try {
    const db = await deps.db();
    try { await db.execute(sql`select 1`); } catch (e) { out.db = codeOf(e); out.tables = "unknown"; }
    if (out.db === "ok") {
      try { await db.execute(sql`select count(*) from turns where claimed_at is null`); } catch (e) { out.tables = codeOf(e); }
    }
  } catch (e) {
    out.db = codeOf(e) === "error" ? "not_configured" : codeOf(e);
    out.tables = "unknown";
  }
  try { deps.storage(); } catch { out.storage = "not_configured"; }
  return out;
}
