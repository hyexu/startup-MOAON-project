import { CONSENT_SCREENS } from "../consent";
import type { ClientTurn, ParentApi } from "./types";

const QUESTIONS = [
  "어머님, 안녕하세요. 오늘은 어릴 적 이야기를 여쭤볼게요. 어릴 적 살던 집 하면 뭐가 먼저 떠오르세요?",
  "마당이 있는 집이었군요. 그 마당에서 주로 누구랑 뭘 하고 노셨어요?",
  "동생들을 돌보셨다니 일찍 철이 드셨겠어요. 그때 어머님 어머니는 하루를 어떻게 보내셨어요?",
  "부엌에서 늘 바쁘셨군요. 그 부엌에서 나던 냄새 중에 지금도 기억나는 게 있으세요?",
];
const CLOSING = "오늘 들려주신 마당 집 이야기 정말 고맙습니다. 다음에는 학교 다니시던 이야기를 들려주세요.";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fake API for /r?demo=1: nothing leaves the phone. */
export function demoApi(): ParentApi {
  let i = 0, id = 1;
  const turn = (question: string, done = false): ClientTurn => ({ turnId: id++, seq: id, question, audioUrl: null, source: "ai", done, sessionId: 1 });
  return {
    async info() { return { honorific: "어머님", operatorPhone: "010-0000-0000 (체험용)", consentsDone: false, consentScreens: CONSENT_SCREENS, retainUntil: "2027-11-25" }; },
    async consent(screen) { return { consentsDone: screen === "ai" }; },
    async start() { await wait(600); return { ...turn(QUESTIONS[0]), sessionId: 1 }; },
    async upload(turnId) { await wait(300); return `demo/${turnId}`; },
    async complete(_t, _p, _m, command) {
      await wait(1500);
      if (command === "오늘은 여기까지") return turn(CLOSING, true);
      i = (i + 1) % QUESTIONS.length;
      return turn(QUESTIONS[i === 0 ? 1 : i]);
    },
    async end() {},
  };
}
