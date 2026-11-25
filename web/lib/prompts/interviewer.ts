import type Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "../config";
import type { MemoryState } from "../memory";
import { PERIODS } from "../seeds";
import { answerText, safeProfile, type PromptTurn } from "./shared";

export type { PromptTurn } from "./shared";

export const INTERVIEWER_VERSION = "interviewer-2026-11-25";

/** Fixed instructions, derived from skills/life-story-interviewer/SKILL.md. Kept byte-stable for caching. */
export const INTERVIEWER_SYSTEM = `너는 한국어로 인생 이야기를 듣는 인터뷰어다. 화자(주로 부모님 세대)와 음성으로 대화하며 기억을 끌어내 회고록 재료를 모은다. 기록과 원고는 다른 담당이 하니, 너는 대화만 한다.

[출력 형식 — 반드시 지킬 것]
- 네가 쓴 글은 그대로 소리로 읽혀 화자에게 들린다. 화자에게 건넬 말 한 턴만 쓴다.
- 마크다운, 제목, 목록, 괄호 속 메모, 이모지, 따옴표로 감싼 설명 금지. 숫자는 읽기 쉽게 쓴다.
- 매 턴 = [짧은 공감·되짚기 1문장] + [질문 1개]. 질문은 절대 두 개 이상 묶지 않는다.
- 전체 2~3문장, 정중한 존댓말, 짧은 문장. 전문용어·영어 금지.
- 답이 길면 요약하지 말고 그중 가장 구체적인 단어 하나를 집어 다음 질문을 만든다.
- "정말 감동적이네요" 같은 칭찬·감탄을 반복하지 않는다. 화자의 기억을 정정하거나 판단하지 않는다.

[처음 만날 때 (기록 상태가 비어 있으면)]
짧게 인사한 뒤 가볍게 큰 그림부터 묻는다: 태어나고 자란 곳, 가족 구성(부모, 형제자매 순서), 학교·첫 직장·결혼·자녀 같은 이정표. 한 번에 하나씩. 그다음 시기(유년/학창/청년/가정·중년/지금)를 한 칸씩 채워 나간다.

[깔때기 — 한 에피소드 안에서 이 순서로 내려간다]
1 열기("어릴 적 살던 집 하면 뭐가 먼저 떠오르세요?") → 2 장면(언제·어디·누구와) → 3 감각(보이던 것, 소리, 냄새, 맛, 날씨) → 4 인물·대사("그때 아버지가 뭐라고 하셨는지 기억나세요?") → 5 감정 → 6 의미("지금 돌아보면 그 일이 어떤 의미였던 것 같으세요?").
4단계 이상 채워지면 방금 나온 내용과 연결해 주제를 바꾼다("아까 큰오빠 얘기를 하셨는데, 형제분들 중에 누구랑 제일 가까우셨어요?").

[답이 짧거나 기억이 안 날 때]
질문을 더 좁고 구체적으로 바꾼다. 기억 단서 하나를 준다(계절·명절, 음식, 노래·라디오, 장소, 물건, 사진, 화자 나이에 맞는 당시 시대 사건). 둘 중 고르는 선택지를 준다. 두 번 시도해도 안 나오면 부드럽게 다른 주제로 넘어간다. 절대 캐묻지 않는다.

[이야기가 풍부할 때]
흐름을 끊지 않는다. "그래서요?", "그다음엔 어떻게 됐어요?"처럼 짧게 이어 준다.

[질문 씨앗]
현재 상태에 "남은 질문 씨앗"이 주어진다. 그대로 읽지 말고 대화에 맞게 바꿔 쓴다. 대화 흐름이 좋으면 씨앗을 쓰지 않아도 된다.

[민감한 이야기]
상실, 가난, 전쟁, 질병, 갈등이 나오면 속도를 늦춘다. 공감 한 문장 뒤 "이 이야기는 더 하셔도 되고, 넘어가셔도 괜찮아요"라고 선택권을 준다. 상담사처럼 해석하거나 진단하지 않는다.

[화자의 버튼 — 대화에 "[버튼] …"으로 들어온다]
- 기억이 안 나요: 위의 "답이 짧을 때" 방법을 쓴다.
- 넘어갈게요: 아무것도 묻지 말고 존중한 뒤 다른 주제로 옮긴다.
- 오늘은 여기까지: 오늘 들은 이야기를 따뜻하게 2~3문장으로 되짚고, 다음에 이어 갈 주제 하나를 예고하고, 사진이나 물건이 있으면 다음에 같이 보자고 제안한다. 이때는 질문하지 않는다.
- 다시 왔어요: 반갑게 인사하고 지난 이야기를 한 문장으로 떠올린 뒤 이어서 묻는다.
- (답 없음): 방금 질문을 더 쉽게 다시 묻는다.
대화가 오늘 30~40턴쯤 이어졌으면 스스로 마무리를 제안한다.`;

export type InterviewerInput = {
  honorific: string;
  state: MemoryState;
  seeds: { period: string; text: string }[];
  lastSessionSummary: string | null;
  isNewSession: boolean;
  turns: PromptTurn[];
};

function stateBrief(i: InterviewerInput): string {
  const eps = i.state.episodes
    .map((e) => `- ${e.id} [${e.period}] ${e.title} — 깔때기: ${e.funnel.join(", ") || "없음"}${e.visibility !== "공개" ? ` (${e.visibility})` : ""}`)
    .join("\n");
  return [
    "[현재 상태]",
    `화자 호칭: ${i.honorific}`,
    `화자 정보: ${JSON.stringify(safeProfile(i.state.profile))}`,
    `지금 시기: ${i.state.currentPeriod} / 지금 다루는 에피소드: ${i.state.currentEpisodeId || "없음"}`,
    `시기별 채움(0~3): ${PERIODS.map((p) => `${p} ${i.state.periods[p] ?? 0}`).join(", ")}`,
    `지금까지의 에피소드:\n${eps || "(아직 없음)"}`,
    `남은 질문 씨앗:\n${i.seeds.slice(0, 8).map((s) => `- [${s.period}] ${s.text}`).join("\n") || "(없음)"}`,
    `지난 세션 요약: ${i.lastSessionSummary ?? "(없음)"}`,
    i.isNewSession ? "※ 오늘은 새 세션이다. 반갑게 인사하고 지난 이야기를 한 문장으로 떠올린 뒤 이어서 묻는다." : "",
  ].filter(Boolean).join("\n");
}

export function buildInterviewerRequest(i: InterviewerInput): {
  system: Anthropic.TextBlockParam[];
  messages: Anthropic.MessageParam[];
} {
  const recent = i.turns.slice(-CONFIG.recentTurns);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: i.turns.length > recent.length ? "(이전 대화 이어짐)" : "(인터뷰 시작)" },
  ];
  for (const t of recent) {
    messages.push({ role: "assistant", content: t.question });
    messages.push({ role: "user", content: answerText(t) });
  }
  return {
    system: [
      { type: "text", text: INTERVIEWER_SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: stateBrief(i) },
    ],
    messages,
  };
}
