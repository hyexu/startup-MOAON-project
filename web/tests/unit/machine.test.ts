import { describe, expect, it } from "vitest";
import { initialState, reduce, type ParentEvent, type ParentState } from "@/lib/parent/machine";
import { detectInApp } from "@/lib/parent/browser";

const info = (consentsDone: boolean) => ({ honorific: "어머님", operatorPhone: "010-0000-0000", consentsDone, consentScreens: [], retainUntil: "2027-11-25" });
const turn = (over: Partial<{ turnId: number; done: boolean; question: string }> = {}) => ({
  turnId: 1, seq: 1, question: "어릴 적 살던 집 하면 뭐가 먼저 떠오르세요?", audioUrl: null, source: "ai" as const, done: false, sessionId: 9, ...over,
});
const run = (events: ParentEvent[], s: ParentState = initialState) => events.reduce(reduce, s);

describe("parent screen machine", () => {
  it("walks hello → two consents → mic help", () => {
    let s = run([{ type: "INFO_OK", info: info(false) }]);
    expect(s.screen).toBe("hello");
    s = run([{ type: "START" }], s);
    expect(s.screen).toBe("consent-record");
    s = run([{ type: "CONSENT_OK", screen: "record" }], s);
    expect(s.screen).toBe("consent-ai");
    s = run([{ type: "CONSENT_OK", screen: "ai" }], s);
    expect(s.screen).toBe("mic-help");
  });

  it("skips consents that were already given", () => {
    expect(run([{ type: "INFO_OK", info: info(true) }, { type: "START" }]).screen).toBe("mic-help");
  });

  it("shows the in-app browser guide when the app blocks the mic", () => {
    const s = run([{ type: "INFO_OK", info: info(true) }, { type: "START" }, { type: "INAPP_BLOCKED" }]);
    expect(s.screen).toBe("inapp-help");
  });

  it("goes from recording to thinking when the time limit hits", () => {
    const s = run([{ type: "INFO_OK", info: info(true) }, { type: "START" }, { type: "MIC_OK" }, { type: "TURN", turn: turn() }, { type: "REC_START" }, { type: "REC_LIMIT" }]);
    expect(s.screen).toBe("thinking");
  });

  it("keeps the same turn on upload failure so a retry resends it", () => {
    const s = run([{ type: "INFO_OK", info: info(true) }, { type: "START" }, { type: "MIC_OK" }, { type: "TURN", turn: turn({ turnId: 7 }) }, { type: "REC_START" }, { type: "REC_STOP" }, { type: "UPLOAD_FAIL" }]);
    expect(s.screen).toBe("error");
    expect(s.turn?.turnId).toBe(7);
    expect(run([{ type: "RETRY" }], s).screen).toBe("thinking");
  });

  it("ends on the goodbye screen after the closing turn", () => {
    const s = run([{ type: "INFO_OK", info: info(true) }, { type: "START" }, { type: "MIC_OK" }, { type: "TURN", turn: turn({ done: true }) }]);
    expect(s.screen).toBe("goodbye");
  });

  it("shows the invalid screen for a bad link", () => {
    expect(run([{ type: "INFO_FAIL" }]).screen).toBe("invalid");
  });

  it("shows the declined screen when a consent is refused", () => {
    expect(run([{ type: "INFO_OK", info: info(false) }, { type: "START" }, { type: "DECLINE" }]).screen).toBe("declined");
  });
});

describe("detectInApp", () => {
  it("recognizes KakaoTalk and leaves Safari alone", () => {
    expect(detectInApp("Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36 KAKAOTALK 10.8.1")).toBe("kakao");
    expect(detectInApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBeNull();
    expect(detectInApp("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130 Mobile Safari/537.36; wv)")).toBe("other");
  });
});
