import type { ParentEvent } from "./machine";

type Pending = { turnId: number; blob: Blob; mime: string };

/** Which screen an API failure should lead to. A dead link must not look like a network problem. */
export function eventForError(e: unknown): ParentEvent {
  const status = (e as { status?: number })?.status;
  if (status === 401) return { type: "INFO_FAIL" };
  if (status === 403) return { type: "CONSENT_NEEDED" };
  return { type: "UPLOAD_FAIL" };
}

/** Use the backup of the current turn only; everything else is stale and should be cleared. */
export function pickPending(pending: Pending[], turnId: number): { match: Pending | null; stale: number[] } {
  return {
    match: pending.find((p) => p.turnId === turnId) ?? null,
    stale: pending.filter((p) => p.turnId !== turnId).map((p) => p.turnId),
  };
}
