import { describe, expect, it, vi } from "vitest";
import { eventForError, pickPending } from "@/lib/parent/recovery";
import { singleFlight } from "@/lib/parent/guard";
import { ApiError } from "@/lib/parent/api";
import { initialState, reduce } from "@/lib/parent/machine";
import { logError } from "@/lib/log";

describe("eventForError", () => {
  it("sends an invalid or revoked link to the invalid screen, not a network error", () => {
    expect(eventForError(new ApiError(401, "link_invalid"))).toEqual({ type: "INFO_FAIL" });
    expect(eventForError(new ApiError(403, "consent_required"))).toEqual({ type: "CONSENT_NEEDED" });
    expect(eventForError(new Error("network"))).toEqual({ type: "UPLOAD_FAIL" });
  });
});

describe("machine additions", () => {
  it("lets a parent reconsider after declining, and re-asks consent when the server needs it", () => {
    const declined = reduce(reduce({ ...initialState, screen: "hello" }, { type: "START" }), { type: "DECLINE" });
    expect(reduce(declined, { type: "RECONSIDER" }).screen).toBe("consent-record");
    expect(reduce({ ...initialState, screen: "thinking", consentsDone: true }, { type: "CONSENT_NEEDED" }).screen).toBe("consent-record");
  });
});

describe("pickPending", () => {
  it("uses only the backup for the current turn and marks the rest stale", () => {
    const b = (turnId: number) => ({ turnId, blob: new Blob(["x"]), mime: "audio/webm" });
    expect(pickPending([b(3), b(7)], 7)).toEqual({ match: b(7), stale: [3] });
    expect(pickPending([b(3)], 9)).toEqual({ match: null, stale: [3] });
  });
});

describe("singleFlight", () => {
  it("ignores taps while the first one is still running", async () => {
    let runs = 0;
    const f = singleFlight(async () => { runs++; await new Promise((r) => setTimeout(r, 20)); });
    await Promise.all([f(), f(), f()]);
    expect(runs).toBe(1);
    await f();
    expect(runs).toBe(2);
  });
});

describe("logError", () => {
  it("never prints database query parameters (which may hold transcripts)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = Object.assign(new Error('Failed query: update "turns" set "transcript" = $1\nparams: 감나무가 있었어요'), { name: "DrizzleQueryError", query: "update", params: ["감나무가 있었어요"] });
    logError("stt failed", e);
    const printed = JSON.stringify(spy.mock.calls);
    expect(printed).not.toContain("감나무");
    expect(printed).toContain("DrizzleQueryError");
    spy.mockRestore();
  });
});

vi.mock("@supabase/supabase-js", () => {
  const uploadToSignedUrl = vi.fn(async () => ({ error: null }));
  return { createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }), __upload: uploadToSignedUrl };
});

describe("realApi upload", () => {
  it("uploads with upsert so a retry to the same path succeeds", async () => {
    const { realApi } = await import("@/lib/parent/api");
    const mod = (await import("@supabase/supabase-js")) as unknown as { __upload: ReturnType<typeof vi.fn> };
    globalThis.fetch = vi.fn(async () => Response.json({ path: "a/1/2.webm", token: "t" })) as never;
    await realApi("tok").upload(2, new Blob(["x"]), "audio/webm;codecs=opus");
    expect(mod.__upload.mock.calls[0][3]).toMatchObject({ upsert: true, contentType: "audio/webm" });
  });
});
