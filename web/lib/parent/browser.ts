/** In-app browsers often block the microphone or lose recordings. */
export function detectInApp(ua: string): "kakao" | "other" | null {
  if (/KAKAOTALK/i.test(ua)) return "kakao";
  if (/NAVER\(inapp/i.test(ua) || /Instagram/i.test(ua) || /FBAN|FBAV|FB_IAB/.test(ua) || /; wv\)/.test(ua) || /\bLine\//.test(ua) || /BAND\//.test(ua)) return "other";
  return null;
}

export const isIOS = (ua: string) => /iPhone|iPad|iPod/.test(ua);
