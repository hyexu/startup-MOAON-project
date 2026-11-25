import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { handleAdmin } from "@/lib/admin-api";
import { serverDeps } from "@/lib/server/deps";
import { signedInEmail } from "@/lib/supabase-auth";

export const maxDuration = 300;

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
  try {
    const out = await handleAdmin(
      { method: req.method, path: "/" + path.join("/"), body, adminEmail: await signedInEmail(), origin: new URL(req.url).origin },
      serverDeps(),
    );
    return NextResponse.json(out.json, { status: out.status, headers: { "cache-control": "no-store" } });
  } catch (e) {
    logError(`admin api failed ${path.join("/")}`, e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export { handle as GET, handle as POST, handle as PUT };
