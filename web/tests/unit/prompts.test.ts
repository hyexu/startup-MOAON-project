import { describe, expect, it } from "vitest";
import { buildInterviewerRequest, type PromptTurn } from "@/lib/prompts/interviewer";
import { buildRecorderRequest } from "@/lib/prompts/recorder";
import { blankMemory } from "@/lib/memory";

const turnsN = (n: number): PromptTurn[] =>
  Array.from({ length: n }, (_, i) => ({ question: `질문${i}`, answer: `답${i}`, command: null }));

const base = {
  honorific: "어머님",
  state: blankMemory("어머님"),
  seeds: [{ period: "유년", text: "어릴 적 살던 집 하면 뭐가 먼저 떠오르세요?" }],
  lastSessionSummary: null,
  isNewSession: false,
};

const allText = (r: { system: unknown; messages: unknown }) => JSON.stringify(r);

describe("buildInterviewerRequest", () => {
  it("never carries a real name that slipped into the memory profile", () => {
    const state = blankMemory("어머님");
    (state.profile as Record<string, string>).realName = "김가명";
    const r = buildInterviewerRequest({ ...base, state, turns: turnsN(2) });
    expect(allText(r)).not.toContain("김가명");
  });

  it("keeps only the most recent 30 turns", () => {
    const r = buildInterviewerRequest({ ...base, turns: turnsN(45) });
    const questions = r.messages.filter((m) => m.role === "assistant");
    expect(questions).toHaveLength(30);
    expect(allText(r)).toContain("질문44");
    expect(allText(r)).not.toContain("질문14\"");
  });

  it("starts and ends with a user message", () => {
    for (const n of [0, 1, 5]) {
      const r = buildInterviewerRequest({ ...base, turns: turnsN(n) });
      expect(r.messages[0].role).toBe("user");
      expect(r.messages.at(-1)!.role).toBe("user");
    }
  });

  it("renders a button command as a tagged user message", () => {
    const r = buildInterviewerRequest({ ...base, turns: [{ question: "q", answer: null, command: "오늘은 여기까지" }] });
    expect(r.messages.at(-1)!.content).toBe("[버튼] 오늘은 여기까지");
  });

  it("marks the fixed instructions for caching", () => {
    const r = buildInterviewerRequest({ ...base, turns: [] });
    expect(r.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("says when this is a new session", () => {
    const r = buildInterviewerRequest({ ...base, isNewSession: true, lastSessionSummary: "감나무 이야기", turns: [] });
    expect(r.system[1].text).toContain("새 세션");
    expect(r.system[1].text).toContain("감나무 이야기");
  });
});

describe("buildRecorderRequest", () => {
  it("sends the current state and only the last 12 turns, without real names", () => {
    const state = blankMemory("어머님");
    (state.profile as Record<string, string>).realName = "김가명";
    const r = buildRecorderRequest({ state, turns: turnsN(20) });
    const text = JSON.stringify(r);
    expect(text).not.toContain("김가명");
    expect(text).toContain("답19");
    expect(text).not.toContain("답7\"");
    expect(r.messages.at(-1)!.role).toBe("user");
  });
});
