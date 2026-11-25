import type { Db } from "./db/types";
import { questionSeeds } from "./db/schema";

export const PERIODS = ["유년", "학창", "청년", "가정·중년", "지금"] as const;
export type Period = (typeof PERIODS)[number];

/** Default question seeds per life period (SKILL.md 2-6), asked in this order. */
export const DEFAULT_SEEDS: { period: Period; text: string }[] = [
  { period: "유년", text: "어릴 적 살던 집 하면 뭐가 먼저 떠오르세요?" },
  { period: "유년", text: "어릴 때 동네 친구들이랑 주로 뭐 하고 노셨어요?" },
  { period: "유년", text: "어린 시절 명절에는 집안 풍경이 어땠어요?" },
  { period: "유년", text: "어릴 때 제일 좋아하셨던 음식은 뭐였어요?" },
  { period: "학창", text: "학교 다니실 때 등굣길은 어떤 길이었어요?" },
  { period: "학창", text: "학교 다닐 때 기억에 남는 선생님이 계세요?" },
  { period: "학창", text: "그 시절 제일 친했던 친구는 어떤 사람이었어요?" },
  { period: "학창", text: "학교 다닐 때 도시락 반찬은 주로 뭐였어요?" },
  { period: "청년", text: "처음 집을 떠나 사셨던 때가 기억나세요?" },
  { period: "청년", text: "첫 월급을 받으셨던 날, 그 돈으로 뭘 하셨어요?" },
  { period: "청년", text: "배우자분을 처음 만나신 날은 어땠어요?" },
  { period: "청년", text: "젊은 시절 가장 힘들었던 때는 언제였고, 어떻게 버티셨어요?" },
  { period: "가정·중년", text: "첫아이가 태어나던 날이 기억나세요?" },
  { period: "가정·중년", text: "살림하시면서, 또 일하시면서 가장 큰 고비는 언제였어요?" },
  { period: "가정·중년", text: "살면서 가장 자랑스러웠던 순간은 언제였어요?" },
  { period: "지금", text: "요즘 하루 중 가장 좋은 시간은 언제예요?" },
  { period: "지금", text: "살면서 가장 고마운 사람은 누구세요?" },
  { period: "지금", text: "자녀분들과 손주들에게 꼭 남기고 싶은 말씀이 있으세요?" },
];

export async function copyDefaultSeeds(db: Db, parentId: number): Promise<void> {
  await db.insert(questionSeeds).values(
    DEFAULT_SEEDS.map((s, i) => ({ parentId, period: s.period, text: s.text, source: "기본", position: i })),
  );
}
