import { NextResponse } from "next/server";
import { checkHealth, probeBazeKeys } from "@/lib/health";
import { KeyPool } from "@/lib/baze/keys";
import { CONFIG } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { supabaseStorage } from "@/lib/storage";
import { envList } from "@/lib/config";
import type { Db } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await checkHealth({ db: () => getDb() as unknown as Db, storage: supabaseStorage, keyCount: envList("BAZE_API_KEYS").length,
    bazeProbe: () => probeBazeKeys(KeyPool.fromEnv().all(), CONFIG.bazeBase),
  });
  return NextResponse.json(h, { headers: { "cache-control": "no-store" } });
}
