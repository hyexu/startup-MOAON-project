import type { Metadata } from "next";
import ClientOnly from "./ClientOnly";
import "./parent.css";

export const metadata: Metadata = { title: "모아온 — 이야기 들려주기", robots: { index: false, follow: false } };

export default function Page() {
  return <ClientOnly />;
}
