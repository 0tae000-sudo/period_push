import { Redirect } from 'expo-router';

// 카카오 로그인 후 앱으로 돌아오는 딥링크(caneatthis://auth/callback)가 "없는 화면"으로 보이지 않게 막는다.
// 실제 세션 교환은 src/lib/oauth.ts에서 처리하므로 여기서는 처음 화면으로 보내기만 한다.
export default function AuthCallbackScreen() {
  return <Redirect href="/" />;
}
