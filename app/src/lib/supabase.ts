import 'react-native-url-polyfill/auto';
import '@/lib/crypto-polyfill';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다. app/.env.local에 설정해 주세요.');
}

// 세션은 AsyncStorage에 저장하고, 앱이 켜져 있는 동안 토큰을 자동 갱신한다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // 웹은 소셜 로그인 후 돌아온 주소의 code를 자동으로 세션으로 교환한다. 폰은 src/lib/oauth.ts에서 직접 처리한다.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce', // 소셜 로그인은 코드 교환 방식(PKCE)으로 처리한다
  },
});
