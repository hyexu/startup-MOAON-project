"use client";

import { useEffect, useState } from "react";
import { adminApi, fmt } from "@/lib/admin/client";

type Credits = { keys: { name: string; remaining: number }[]; snapshotAt: string; paused: boolean; reason: "manual" | "credits" | null; monthUsage: { credits: number; costUsd: number; turns: number }; avgCreditsPerTurn: number };

/** Top band on every operator page: per-key credits, monthly use, AI pause switch. */
export default function CreditBar() {
  const [c, setC] = useState<Credits | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => adminApi<Credits>("GET", "/credits").then(setC).catch(() => setC(null));
  useEffect(() => { void load(); }, []);
  if (!c) return null;
  const keys = c.keys.map((k) => `${k.name} ${Math.round(k.remaining).toLocaleString()}`).join(" · ");
  return (
    <div className={`bar${c.paused ? " paused" : ""}`} role="status">
      <span>
        AI 크레딧: {keys || "키 없음"} · 이번 달 {Math.round(c.monthUsage.credits).toLocaleString()} 사용 (답변 {c.monthUsage.turns}개, 1턴 평균 {c.avgCreditsPerTurn}크레딧, 약 ${c.monthUsage.costUsd.toFixed(2)})
        <span className="muted"> · {fmt(c.snapshotAt)} 기준</span>
        {c.paused && <><br /><b>AI 멈춤 ({c.reason === "manual" ? "운영자가 멈춤" : "크레딧 부족"})</b> — 부모님은 미리 정한 질문으로 계속 녹음할 수 있어요</>}
      </span>
      <button disabled={busy} onClick={async () => { setBusy(true); await adminApi("PUT", "/ai-pause", { paused: !c.paused }).catch(() => {}); await load(); setBusy(false); }}>
        {c.paused ? "AI 다시 켜기" : "AI 멈추기"}
      </button>
    </div>
  );
}
