// 기능 켜고 끄기. 출시 단계에서 카카오 로그인을 붙일 때 true로 바꾼다.
// (카카오 앱 설정, Supabase Kakao provider, Redirect URLs 점검이 끝난 뒤에 켠다. CLAUDE.md 인증 항목 참고)
export const FEATURES = {
  kakaoLogin: false,
} as const;
