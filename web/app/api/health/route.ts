import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";
import { getDb } from "@/lib/db/client";
import { supabaseStorage } from "@/lib/storage";
import { envList } from "@/lib/config";
import type { Db } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await checkHealth({ db: () => getDb() as unknown as Db, storage: supabaseStorage, keyCount: envList("BAZE_API_KEYS").length });
  return NextResponse.json(h, { headers: { "cache-control": "no-store" } });
}
