"use client";

import { useEffect, useState } from "react";
import { adminApi, fmt } from "@/lib/admin/client";
import { PERIODS } from "@/lib/seeds";

type Row = { id: number; honorific: string; status: string; lastAnswerAt: string | null; periods: Record<string, number> | null; monthCredits: number; retainUntil: string };

export default function Parents() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => adminApi<Row[]>("GET", "/parents").then(setRows).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);

  return (
    <>
      <h1>부모님 목록</h1>
      {error && <p className="err">{error}</p>}
      <div className="scroll">
        <table>
          <thead><tr><th>호칭</th><th>상태</th><th>시기별 진행</th><th>마지막 답변</th><th>이번 달 크레딧</th><th>보관 기한</th></tr></thead>
          <tbody>
            {rows?.length === 0 && <tr><td colSpan={6} className="muted">아직 등록된 부모님이 없습니다. 아래에서 등록해 주세요.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td><a href={`/admin/parents/${r.id}`}>{r.honorific}</a></td>
                <td>{r.status}</td>
                <td>{PERIODS.map((p) => <span key={p} title={p}>{p} <span className="dots">{"●".repeat(r.periods?.[p] ?? 0)}{"○".repeat(3 - (r.periods?.[p] ?? 0))}</span> </span>)}</td>
                <td>{fmt(r.lastAnswerAt)}</td>
                <td>{Math.round(r.monthCredits).toLocaleString()}</td>
                <td>{r.retainUntil}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>부모님 등록</h2>
      <form onSubmit={async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        try {
          const { id } = await adminApi<{ id: number }>("POST", "/parents", { ...f, birthYear: f.birthYear || null });
          location.href = `/admin/parents/${id}`;
        } catch (err) { setError((err as Error).message); }
      }}>
        <div className="grid2">
          <label>호칭 (AI가 부를 이름, 예: 어머님)<input id="honorific" name="honorific" required /></label>
          <label>실명 (운영용, AI로 보내지 않음)<input id="realName" name="realName" /></label>
          <label>출생 연도<input id="birthYear" name="birthYear" inputMode="numeric" /></label>
          <label>고향<input id="hometown" name="hometown" /></label>
          <label>직업<input id="job" name="job" /></label>
          <label>신청한 자녀 연락처 (운영용)<input id="guardianContact" name="guardianContact" /></label>
        </div>
        <label>가족 메모 (형제, 배우자 등 — 질문 맥락에만 씀)<textarea id="familyNote" name="familyNote" rows={3} /></label>
        <button className="go">등록하고 질문 묶음 만들기</button>
      </form>
    </>
  );
}
