import type Anthropic from "@anthropic-ai/sdk";
import type { MemoryState } from "../memory";
import { answerText, safeProfile, type PromptTurn } from "./shared";

export const RECORDER_VERSION = "recorder-2026-11-25";
const RECORDER_TURNS = 12;

/** From spike/memoir-interviewer.html RECORDER_RULES. Output shape is enforced by memoryJsonSchema. */
export const RECORDER_SYSTEM = `너는 회고록 인터뷰의 기록자다. 인터뷰 대화를 읽고 기록 상태(JSON)를 갱신한다.
원칙: 대화에 실제로 나온 내용만 적는다. 추측·창작 금지. 연도·지명이 불확실하면 uncertain에 적는다. 화자가 넘어가고 싶다거나 책에 넣지 말라고 한 내용은 visibility를 "비공개"로, 제3자(형제·이웃 등)의 사생활·명예가 걸린 내용은 "확인 필요"로 둔다. quotes에는 화자의 답 원문에 있는 표현만, 한 글자도 바꾸지 말고 그대로 옮긴다(인상적인 구절 위주, 최대 5개).
기존 에피소드는 id를 유지하며 내용을 보강하고, 새 이야기면 새 id(e1, e2…)로 추가한다. 인생 지도(가족 구성·이사·이정표)는 profile.lifeMap에 짧게 누적한다.
periods 값은 그 시기의 채움 정도 0~3 (0 없음, 1 조금, 2 꽤, 3 충분). funnel은 깔때기 단계(열기, 장면, 감각, 인물·대사, 감정, 의미) 중 그 에피소드에서 실제로 채워진 단계만. currentPeriod는 유년|학창|청년|가정·중년|지금|시작 중 하나.
출력은 갱신된 기록 상태 JSON 하나뿐이다.`;

export function buildRecorderRequest(i: { state: MemoryState; turns: PromptTurn[] }): {
  system: string;
  messages: Anthropic.MessageParam[];
} {
  const state = { ...i.state, profile: safeProfile(i.state.profile) };
  const recent = i.turns.slice(-RECORDER_TURNS)
    .map((t) => `인터뷰어: ${t.question}\n화자: ${answerText(t)}`)
    .join("\n");
  return {
    system: RECORDER_SYSTEM,
    messages: [{
      role: "user",
      content: `[현재 기록 상태 JSON]\n${JSON.stringify(state)}\n\n[최근 대화 — 마지막 화자 답변을 반영하라]\n${recent}`,
    }],
  };
}
