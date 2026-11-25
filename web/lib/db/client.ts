import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

let cached: ReturnType<typeof make> | null = null;
function make() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
}

/** Server-only Postgres connection (Supabase transaction pooler). */
export function getDb() {
  cached ??= make();
  return cached;
}
