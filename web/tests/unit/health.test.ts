import { describe, expect, it } from "vitest";
import { checkHealth } from "@/lib/health";
import { makeTestDb } from "@/lib/db/test-db";
import { memoryStorage } from "@/lib/storage";

describe("checkHealth", () => {
  it("reports ok for a working database and storage", async () => {
    const r = await checkHealth({ db: () => makeTestDb(), storage: () => memoryStorage(), keyCount: 2 });
    expect(r).toEqual({ db: "ok", tables: "ok", storage: "ok", bazeKeys: 2 });
  });

  it("reports only the error code, never the message", async () => {
    const dbErr = Object.assign(new Error("password authentication failed for user postgres.secret"), { cause: { code: "28P01" } });
    const r = await checkHealth({ db: async () => { throw dbErr; }, storage: () => { throw new Error("SUPABASE_URL missing"); }, keyCount: 0 });
    expect(r.db).toBe("28P01");
    expect(r.storage).toBe("not_configured");
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});
