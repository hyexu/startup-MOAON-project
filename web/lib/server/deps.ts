import "server-only";
import { after } from "next/server";
import { getDb } from "../db/client";
import { createBaze } from "../baze/client";
import { KeyPool } from "../baze/keys";
import { supabaseStorage } from "../storage";
import type { Db } from "../db/types";
import type { ParentDeps } from "../parent-api";

/** Production wiring shared by the API routes. */
export function serverDeps(): ParentDeps {
  return {
    db: getDb() as unknown as Db,
    baze: createBaze({ pool: KeyPool.fromEnv() }),
    storage: supabaseStorage(),
    operatorPhone: process.env.OPERATOR_PHONE ?? "",
    after: (fn) => after(fn),
  };
}
