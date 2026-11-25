"use client";

import { useEffect, useState } from "react";
import { adminApi, fmt } from "@/lib/admin/client";

type L = { id: number; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); } catch { setDone(false); } }}>{done ? "복사했습니다" : label}</button>;
}

export default function Links({ id }: { id: number }) {
  const [list, setList] = useState<L[]>([]);
  const [made, setMade] = useState<{ url: string; message: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => adminApi<L[]>("GET", `/parents/${id}/links`).then(setList).catch((e) => setMsg(e.message));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack">
      <div className="panel">
        <p className="muted">링크는 만든 직후 한 번만 보입니다. 카카오톡이나 문자로 부모님께 보내 주세요. 기본 90일 동안 쓸 수 있습니다.</p>
        <div><button className="go" onClick={async () => { try { setMade(await adminApi("POST", `/parents/${id}/links`)); await load(); } catch (e) { setMsg((e as Error).message); } }}>새 링크 만들기</button></div>
        {made && (
          <>
            <div className="copybox">{made.message}</div>
            <div><Copy text={made.message} label="보낼 문안 복사" /> <Copy text={made.url} label="링크만 복사" /></div>
          </>
        )}
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th>번호</th><th>만든 때</th><th>만료</th><th>마지막 사용</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td><td>{fmt(l.createdAt)}</td><td>{fmt(l.expiresAt)}</td><td>{fmt(l.lastUsedAt)}</td>
                <td>{l.revokedAt ? "중지됨" : new Date(l.expiresAt) < new Date() ? "만료" : "사용 중"}</td>
                <td>{!l.revokedAt && <button onClick={async () => { await adminApi("POST", `/links/${l.id}/revoke`); await load(); }}>중지</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className="err">{msg}</p>}
    </div>
  );
}
