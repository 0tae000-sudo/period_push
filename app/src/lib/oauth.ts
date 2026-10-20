import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { toKoreanAuthMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

// 인증 브라우저가 닫힌 뒤 앱으로 돌아오는 처리를 마무리한다 (웹에서 필요)
WebBrowser.maybeCompleteAuthSession();

const FAILED_MESSAGE = '로그인에 실패했어요. 다시 시도해 주세요.';

/**
 * 카카오 로그인.
 * - 폰: 인증 브라우저를 열고, 돌아온 주소의 code를 세션으로 교환한다. 사용자가 중간에 닫으면 에러 없이 끝나고 세션은 생기지 않는다.
 * - 웹: 페이지 전체가 카카오로 이동했다가 돌아온다. 돌아온 주소의 code는 Supabase 클라이언트가 자동으로 세션으로 교환한다.
 */
export async function signInWithKakao(): Promise<{ error: string | null }> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { redirectTo: `${window.location.origin}/` },
    });
    return { error: error ? toKoreanAuthMessage(error) : null };
  }

  const redirectTo = Linking.createURL('auth/callback');
  // 개발 중 확인용: 이 주소가 Supabase의 Redirect URLs 허용 목록과 맞아야 앱으로 돌아온다
  if (__DEV__) console.log('[카카오 로그인] redirectTo =', redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) return { error: toKoreanAuthMessage(error) };

  // 이전 시도의 인증 창이 남아 있으면 새로 열리지 않을 수 있어서 먼저 정리한다
  WebBrowser.dismissAuthSession();

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  } catch {
    return { error: FAILED_MESSAGE };
  }
  if (result.type !== 'success') return { error: null };

  const params = new URL(result.url).searchParams;
  if (params.get('error_description') ?? params.get('error')) return { error: FAILED_MESSAGE };

  const code = params.get('code');
  if (!code) return { error: FAILED_MESSAGE };

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  return { error: exchangeError ? toKoreanAuthMessage(exchangeError) : null };
}
