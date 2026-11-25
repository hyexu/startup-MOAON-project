import type { Metadata } from "next";
import CreditBar from "./CreditBar";
import "../admin.css";

export const metadata: Metadata = { title: "모아온 운영", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="admin">
      <CreditBar />
      <nav><a href="/admin">부모님 목록</a><a href="/r?demo=1" target="_blank" rel="noopener">부모님 화면 체험</a><a href="/privacy">개인정보 안내</a></nav>
      {children}
    </main>
  );
}
