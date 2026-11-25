import { createClient } from "@supabase/supabase-js";

export type Storage = {
  put(path: string, buf: Buffer, mime: string): Promise<void>;
  get(path: string): Promise<Buffer>;
  signedUploadUrl(path: string): Promise<{ url: string; token: string }>;
  signedReadUrl(path: string, sec?: number): Promise<string>;
  remove(paths: string[]): Promise<void>;
};

export const AUDIO_BUCKET = "audio";

/** Private Supabase bucket. Server-only: uses the service role key. */
export function supabaseStorage(): Storage {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
  const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from(AUDIO_BUCKET);
  const check = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error || r.data == null) throw new Error(`storage: ${r.error?.message ?? "no data"}`);
    return r.data;
  };
  return {
    async put(path, buf, mime) { check(await bucket.upload(path, buf, { contentType: mime, upsert: true })); },
    async get(path) { return Buffer.from(await check(await bucket.download(path)).arrayBuffer()); },
    async signedUploadUrl(path) { const d = check(await bucket.createSignedUploadUrl(path, { upsert: true })); return { url: d.signedUrl, token: d.token }; },
    async signedReadUrl(path, sec = 3600) { return check(await bucket.createSignedUrl(path, sec)).signedUrl; },
    async remove(paths) { if (paths.length) check(await bucket.remove(paths)); },
  };
}

/** In-memory storage for tests and demo. */
export function memoryStorage(): Storage & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(path, buf) { files.set(path, buf); },
    async get(path) { const b = files.get(path); if (!b) throw new Error(`storage: missing ${path}`); return b; },
    async signedUploadUrl(path) { return { url: `memory://upload/${path}`, token: "t" }; },
    async signedReadUrl(path, sec = 3600) { return `memory://read/${path}?exp=${sec}`; },
    async remove(paths) { for (const p of paths) files.delete(p); },
  };
}
