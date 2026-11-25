import { NextResponse } from "next/server";
import { handleParent } from "@/lib/parent-api";
import { serverDeps } from "@/lib/server/deps";

export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const out = await handleParent(action, body && typeof body === "object" ? body : {}, serverDeps());
    return NextResponse.json(out.json, { status: out.status, headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("parent api failed", action, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
