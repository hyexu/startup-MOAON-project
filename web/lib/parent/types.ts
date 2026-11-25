import type { ConsentScreen } from "../consent";

export type ParentInfo = { honorific: string; operatorPhone: string; consentsDone: boolean; consentScreens: ConsentScreen[]; retainUntil: string };
export type ClientTurn = { turnId: number; seq: number; question: string; audioUrl: string | null; source: "ai" | "seed" | "system"; done: boolean; sessionId?: number };

/** Same shape as POST /api/r/{action}; the demo uses a fake with this signature. */
export type ParentApi = {
  info(): Promise<ParentInfo>;
  consent(screen: "record" | "ai"): Promise<{ consentsDone: boolean }>;
  start(): Promise<ClientTurn & { sessionId: number }>;
  upload(turnId: number, blob: Blob, mime: string): Promise<string>;
  complete(turnId: number, path: string | null, mime: string | null, command: string | null, partial?: boolean): Promise<ClientTurn>;
  end(sessionId: number): Promise<void>;
};
