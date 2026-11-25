export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 28, margin: 0 }}>모아온 인터뷰 서비스</h1>
      <p style={{ color: "var(--muted)" }}>부모님께는 운영자가 보내 드린 링크로 들어오시면 됩니다.</p>
      <p><a href="/admin">운영자 화면</a> · <a href="/privacy">개인정보 안내</a></p>
    </main>
  );
}
