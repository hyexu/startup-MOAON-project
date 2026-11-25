import type { ClientTurn, ParentInfo } from "./types";

export type Screen =
  | "loading" | "invalid" | "hello" | "consent-record" | "consent-ai" | "declined" | "mic-help" | "inapp-help"
  | "question" | "recording" | "thinking" | "goodbye" | "error";

export type ParentState = { screen: Screen; info: ParentInfo | null; turn: ClientTurn | null; sessionId: number | null; micDenied: boolean; consentsDone: boolean };

export type ParentEvent =
  | { type: "INFO_OK"; info: ParentInfo }
  | { type: "INFO_FAIL" }
  | { type: "START" }
  | { type: "CONSENT_OK"; screen: "record" | "ai" }
  | { type: "DECLINE" }
  | { type: "MIC_OK" }
  | { type: "MIC_DENIED" }
  | { type: "INAPP_BLOCKED" }
  | { type: "TURN"; turn: ClientTurn }
  | { type: "REC_START" }
  | { type: "REC_STOP" }
  | { type: "REC_LIMIT" }
  | { type: "COMMAND" }
  | { type: "UPLOAD_FAIL" }
  | { type: "RETRY" }
  | { type: "FAIL" }
  | { type: "END" };

export const initialState: ParentState = { screen: "loading", info: null, turn: null, sessionId: null, micDenied: false, consentsDone: false };

/** Pure screen transitions. Side effects (API, recording) live in the component. */
export function reduce(s: ParentState, e: ParentEvent): ParentState {
  switch (e.type) {
    case "INFO_OK": return { ...s, info: e.info, consentsDone: e.info.consentsDone, screen: "hello" };
    case "INFO_FAIL": return { ...s, screen: "invalid" };
    case "START": return { ...s, screen: s.consentsDone ? "mic-help" : "consent-record" };
    case "CONSENT_OK":
      return e.screen === "record" ? { ...s, screen: "consent-ai" } : { ...s, consentsDone: true, screen: "mic-help" };
    case "DECLINE": return { ...s, screen: "declined" };
    case "MIC_OK": return { ...s, micDenied: false, screen: "thinking" };
    case "MIC_DENIED": return { ...s, micDenied: true, screen: "mic-help" };
    case "INAPP_BLOCKED": return { ...s, screen: "inapp-help" };
    case "TURN":
      return { ...s, turn: e.turn, sessionId: e.turn.sessionId ?? s.sessionId, screen: e.turn.done ? "goodbye" : "question" };
    case "REC_START": return { ...s, screen: "recording" };
    case "REC_STOP":
    case "REC_LIMIT":
    case "COMMAND":
    case "RETRY":
    case "END": return { ...s, screen: "thinking" };
    case "UPLOAD_FAIL":
    case "FAIL": return { ...s, screen: "error" };
  }
}
