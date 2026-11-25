import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./db/types";
import { consents } from "./db/schema";

export const CONSENT_VERSION = "2026-11-25";

export type ConsentScreen = { id: "record" | "ai"; title: string; body: string[]; items: string[] };

/** Plain-language consent copy (spec 6-1). "{보관기한}" is replaced with the parent's retention date. */
export const CONSENT_SCREENS: ConsentScreen[] = [
  {
    id: "record",
    title: "말씀을 녹음해서 보관해도 될까요?",
    body: [
      "답해 주시는 목소리를 녹음하고, 말씀하신 내용을 글로 옮겨 보관합니다.",
      "부모님 이야기를 책으로 만들기 위해서만 씁니다.",
      "가족과 모아온 담당자만 볼 수 있습니다.",
      "{보관기한}까지 보관하고, 그 전에라도 원하시면 내려받거나 지워 드립니다.",
      "AI를 가르치는 데에는 쓰지 않습니다.",
    ],
    items: ["개인정보 수집·이용", "음성 녹음과 보관"],
  },
  {
    id: "ai",
    title: "AI가 말씀을 듣고 다음 질문을 드려도 될까요?",
    body: [
      "녹음과 글은 국내 업체 마인드로직(BAZE)을 거쳐 미국의 AI 회사로 보내집니다.",
      "Soniox는 녹음을 글로 옮기고, Google은 질문을 소리로 읽어 드리고, Anthropic은 다음 질문을 만듭니다.",
      "이 회사들은 보내 드린 내용을 AI 학습에 쓰지 않습니다.",
      "성함과 연락처는 보내지 않고, 정해 주신 호칭으로만 부릅니다.",
    ],
    items: ["AI 처리 위탁(국외 이전 포함)"],
  },
];

const ALL_ITEMS = CONSENT_SCREENS.flatMap((s) => s.items);

export async function recordConsent(db: Db, parentId: number, linkId: number | null, screen: "record" | "ai") {
  const s = CONSENT_SCREENS.find((x) => x.id === screen);
  if (!s) throw new Error("unknown consent screen");
  await db.insert(consents).values(s.items.map((item) => ({ parentId, linkId, item, textVersion: CONSENT_VERSION })));
}

export async function hasAllConsents(db: Db, parentId: number): Promise<boolean> {
  const rows = await db
    .selectDistinct({ item: consents.item })
    .from(consents)
    .where(and(eq(consents.parentId, parentId), eq(consents.textVersion, CONSENT_VERSION), inArray(consents.item, ALL_ITEMS)));
  return rows.length === ALL_ITEMS.length;
}
