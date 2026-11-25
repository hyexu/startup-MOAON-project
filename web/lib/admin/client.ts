"use client";

import { createBrowserClient } from "@supabase/ssr";

export const supabaseBrowser = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

/** Admin API call; sends the operator to the login page when the session is missing. */
export async function adminApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/admin${path}`, {
    method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { location.href = "/admin/login"; throw new Error("unauthorized"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `요청 실패 (${r.status})`);
  return j as T;
}

export const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : "—";
