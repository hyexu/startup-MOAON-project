let el: HTMLAudioElement | null = null;
const SILENT = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVFGmgqK////9bP/6XCykxBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";

export function soundOn(): boolean {
  try { return localStorage.getItem("moaon-sound") !== "off"; } catch { return true; }
}
export function setSound(on: boolean) {
  try { localStorage.setItem("moaon-sound", on ? "on" : "off"); } catch { /* ignore */ }
}

/** Call inside the first tap so later async playback is allowed on iPhone. */
export function unlockAudio() {
  el ??= new Audio();
  el.src = SILENT;
  void el.play().catch(() => {});
  try { speechSynthesis.speak(new SpeechSynthesisUtterance("")); } catch { /* ignore */ }
}

function browserVoice(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 0.9;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    } catch { resolve(); }
  });
}

export function stopSpeaking() {
  try { el?.pause(); speechSynthesis.cancel(); } catch { /* ignore */ }
}

/** Play the server voice if there is one, otherwise the phone's built-in voice. */
export async function playQuestion(audioUrl: string | null, text: string): Promise<void> {
  if (!soundOn()) return;
  stopSpeaking();
  if (audioUrl) {
    el ??= new Audio();
    el.src = audioUrl;
    try {
      await el.play();
      await new Promise<void>((r) => { el!.onended = () => r(); el!.onerror = () => r(); });
      return;
    } catch { /* fall through */ }
  }
  await browserVoice(text);
}
