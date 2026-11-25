/* Create the private "audio" bucket. Run once: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/setup-storage.ts */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const storage = createClient(url, key, { auth: { persistSession: false } }).storage;
  const { data: buckets, error } = await storage.listBuckets();
  if (error) throw error;
  if (buckets.some((b) => b.name === "audio")) { console.log("audio bucket already exists"); return; }
  const r = await storage.createBucket("audio", { public: false, fileSizeLimit: "25MB" });
  if (r.error) throw r.error;
  console.log("created private audio bucket");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
