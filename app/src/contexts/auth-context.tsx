import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ALREADY_REGISTERED_MESSAGE, isAlreadyRegistered, toKoreanAuthMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

type AuthResult = { error: string | null };
type SignUpResult = AuthResult & { needsEmailConfirmation: boolean; alreadyRegistered: boolean };

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  // 비밀번호 재설정 중에는 로그인 상태여도 탭 화면으로 넘어가지 않는다
  isResettingPassword: boolean;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string) => Promise<SignUpResult>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    // 앱이 백그라운드에 있는 동안에는 토큰 자동 갱신을 멈춘다.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      listener.subscription.unsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? toKoreanAuthMessage(error) : null };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const alreadyRegistered = error.code === 'user_already_exists';
      return { error: toKoreanAuthMessage(error), needsEmailConfirmation: false, alreadyRegistered };
    }
    // 이미 가입된 이메일이면 Supabase는 에러 없이 성공처럼 응답하고 메일도 보내지 않는다.
    if (isAlreadyRegistered(data.user)) {
      return { error: ALREADY_REGISTERED_MESSAGE, needsEmailConfirmation: false, alreadyRegistered: true };
    }
    // 이메일 인증을 켜 둔 프로젝트에서는 가입 직후 세션이 없다.
    return { error: null, needsEmailConfirmation: !data.session, alreadyRegistered: false };
  }, []);

  // 가입 여부가 드러나지 않도록 화면에서는 성공/실패와 관계없이 같은 안내를 보여준다 (요청 횟수 제한 오류만 예외).
  const requestPasswordReset = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error ? toKoreanAuthMessage(error) : null };
  }, []);

  // 메일로 받은 코드를 확인하면 로그인 상태가 되는데, 비밀번호 변경까지 끝나기 전에는 화면이 넘어가지 않게 막는다.
  const resetPasswordWithCode = useCallback(
    async (email: string, code: string, newPassword: string): Promise<AuthResult> => {
      setIsResettingPassword(true);
      try {
        const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
        if (verifyError) return { error: toKoreanAuthMessage(verifyError) };

        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
          // 비밀번호를 못 바꿨으면 로그인 상태로 남기지 않는다
          await supabase.auth.signOut();
          return { error: toKoreanAuthMessage(updateError) };
        }
        return { error: null };
      } finally {
        setIsResettingPassword(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      isLoading,
      isResettingPassword,
      signInWithEmail,
      signUpWithEmail,
      requestPasswordReset,
      resetPasswordWithCode,
      signOut,
    }),
    [
      session,
      isLoading,
      isResettingPassword,
      signInWithEmail,
      signUpWithEmail,
      requestPasswordReset,
      resetPasswordWithCode,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있어요.');
  return value;
}
