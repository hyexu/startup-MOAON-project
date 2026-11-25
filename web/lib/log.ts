/** Log an error without leaking personal data: database errors carry query parameters (transcripts, names). */
export function logError(label: string, e: unknown): void {
  if (e && typeof e === "object" && ("params" in e || "query" in e || (e as Error).name === "DrizzleQueryError")) {
    const cause = (e as { cause?: { code?: string } }).cause;
    console.error(label, (e as Error).name ?? "DatabaseError", cause?.code ?? "");
    return;
  }
  const detail = (e as { detail?: string })?.detail;
  console.error(label, e instanceof Error ? `${e.name}: ${e.message}${detail ? ` — ${detail}` : ""}` : String(e));
}
