"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/admin/client";
import { FUNNEL } from "@/lib/funnel";
import type { MemoryState } from "@/lib/memory";
import { PERIODS } from "@/lib/seeds";

export default function Cards({ id }: { id: number }) {
  const [m, setM] = useState<MemoryState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { adminApi<MemoryState>("GET", `/parents/${id}/memory`).then(setM).catch((e) => setMsg(e.message)); }, [id]);
  if (!m) return <p className="muted">{msg ?? "불러오는 중…"}</p>;
  const row = (k: string, v: string | undefined) => (v && v.trim() ? <><dt>{k}</dt><dd>{v}</dd></> : null);
  return (
    <div className="stack">
      <div className="card">
        <b>시기별 진행</b>
        <div>{PERIODS.map((p) => <span key={p}>{p} <span className="dots">{"●".repeat(m.periods[p] ?? 0)}{"○".repeat(3 - (m.periods[p] ?? 0))}</span>　</span>)}</div>
        <dl>{row("인생 지도", m.profile.lifeMap)}{row("태어난 곳", m.profile.birthplace)}{row("출생", m.profile.birthYear)}</dl>
      </div>
      {m.episodes.length === 0 && <p className="muted">아직 정리된 이야기가 없습니다. 부모님이 답하시면 AI 기록자가 카드를 만듭니다.</p>}
      {m.episodes.map((e) => (
        <div key={e.id} className="card">
          <b>{e.title} {e.visibility !== "공개" && <span className="pill warn">{e.visibility}</span>}</b>
          <span className="muted">{[e.id, e.period, e.age].filter(Boolean).join(" · ")}</span>
          <dl>
            {row("장소", e.place)}{row("등장인물", e.people)}{row("줄거리", e.story)}{row("감각", e.senses)}
            {row("원래 표현", e.quotes.map((q) => `“${q}”`).join("\n"))}{row("감정·의미", [e.emotion, e.meaning].filter(Boolean).join(" / "))}{row("확인 필요", e.uncertain)}
          </dl>
          <span className="muted">깔때기: {FUNNEL.map((f) => (e.funnel.includes(f) ? `[${f}]` : f)).join(" · ")}</span>
        </div>
      ))}
    </div>
  );
}
