import type { Metadata } from "next";
import { CONSENT_VERSION } from "@/lib/consent";
import { CONFIG } from "@/lib/config";

export const metadata: Metadata = { title: "모아온 개인정보 안내" };

const S = { main: { maxWidth: 640, margin: "0 auto", padding: "32px 20px 64px", fontSize: 20, lineHeight: 1.75 }, h2: { fontSize: 22, margin: "32px 0 8px" } } as const;

export default function Privacy() {
  const phone = process.env.OPERATOR_PHONE;
  return (
    <main style={S.main}>
      <h1 style={{ fontSize: 28, lineHeight: 1.4 }}>모아온 개인정보 안내</h1>
      <p>모아온은 부모님의 살아오신 이야기를 말로 듣고, 글로 옮겨, 책으로 만들기 위해 아래 정보를 받습니다. 책을 만드는 일 말고는 쓰지 않습니다.</p>

      <h2 style={S.h2}>무엇을 모으나요</h2>
      <p>답해 주시는 목소리 녹음, 그 녹음을 글로 옮긴 내용, 그리고 신청하신 가족이 알려 주신 호칭·고향·가족 이야기 같은 기본 정보입니다.</p>

      <h2 style={S.h2}>누가 볼 수 있나요</h2>
      <p>신청하신 가족과 모아온 담당자만 볼 수 있습니다. 녹음은 잠긴 저장소에 두고, 담당자 화면에서도 짧은 시간 동안만 열리는 주소로 재생합니다.</p>

      <h2 style={S.h2}>AI에는 무엇이 전달되나요</h2>
      <p>녹음과 글은 국내 업체 마인드로직(BAZE)을 거쳐 미국의 AI 회사로 보내집니다.</p>
      <ul>
        <li>Soniox: 녹음을 글로 옮깁니다.</li>
        <li>Google: 질문을 소리로 읽어 드립니다.</li>
        <li>Anthropic: 말씀을 듣고 다음 질문을 만들고, 이야기를 정리합니다.</li>
      </ul>
      <p>이 회사들은 보내 드린 내용을 AI 학습에 쓰지 않습니다. 성함과 연락처는 보내지 않고, 정해 주신 호칭(예: 어머님)으로만 부릅니다.</p>

      <h2 style={S.h2}>얼마나 보관하나요</h2>
      <p>정해 드린 보관 기한(기본 {Math.round(CONFIG.retentionDays / 365)}년)까지 보관합니다. 기한이 지나면 링크로 더 이상 들어올 수 없고, 남은 자료는 지웁니다.</p>

      <h2 style={S.h2}>내려받기와 지우기</h2>
      <p>원하시면 언제든 녹음 원본과 글을 내려받거나 지워 드립니다. 모아온에 연락 주시면 바로 처리해 드려요.{phone ? ` 연락처: ${phone}` : ""}</p>

      <h2 style={S.h2}>동의하지 않으시면</h2>
      <p>동의하지 않으셔도 됩니다. 그러면 녹음은 하지 않고, 전화로 여쭤보는 방법을 안내해 드립니다.</p>

      <p style={{ color: "var(--muted)", fontSize: 16, marginTop: 40 }}>안내문 버전 {CONSENT_VERSION}</p>
    </main>
  );
}
