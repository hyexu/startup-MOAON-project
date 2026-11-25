import { createClient } from "@supabase/supabase-js";
import type { ClientTurn, ParentApi, ParentInfo } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

/** Real API: every call carries the link token from the URL hash. */
export function realApi(token: string): ParentApi {
  const post = async <T>(action: string, body: object = {}): Promise<T> => {
    const r = await fetch(`/api/r/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, j.error ?? "server");
    return j as T;
  };
  const supa = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  return {
    info: () => post<ParentInfo>("info"),
    consent: (screen) => post("consent", { screen }),
    start: () => post<ClientTurn & { sessionId: number }>("start"),
    async upload(turnId, blob, mime) {
      const u = await post<{ path: string; token: string }>("upload-url", { turnId, mime });
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supa().storage.from("audio").uploadToSignedUrl(u.path, u.token, blob, { contentType: mime.split(";")[0] });
        if (!error) return u.path;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
      throw new ApiError(0, "upload_failed");
    },
    complete: (turnId, path, mime, command) => post<ClientTurn>("complete", { turnId, path, mime, command }),
    async end(sessionId) { await post("end", { sessionId }); },
  };
}
