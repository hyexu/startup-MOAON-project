import type { MemoryState } from "../memory";

export type PromptTurn = { question: string; answer: string | null; command: string | null };

/** Only the profile fields the AI may see. Anything else (e.g. a real name) is dropped. */
export function safeProfile(p: MemoryState["profile"]) {
  const { respondent, honorific, birthYear, birthplace, purpose, lifeMap } = p;
  return { respondent, honorific, birthYear, birthplace, purpose, lifeMap };
}

export function answerText(t: PromptTurn): string {
  if (t.command) return `[버튼] ${t.command}`;
  const a = (t.answer ?? "").trim();
  return a || "(답 없음)";
}
