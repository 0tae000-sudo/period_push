import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { FEATURES } from '@/constants/features';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'signIn' | 'signUp';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signInWithEmail, signUpWithEmail, signInWithKakao } = useAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 진행 중인 작업: 버튼별로 로딩 표시를 하고 중복 탭을 막는다
  const [busy, setBusy] = useState<'kakao' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'signUp';

  const switchMode = () => {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setError(null);
    setNotice(null);
  };

  const handleKakao = async () => {
    if (busy) return;
    setBusy('kakao');
    setError(null);
    setNotice(null);
    try {
      const result = await signInWithKakao();
      if (result.error) setError(result.error);
    } catch {
      setError('로그인에 실패했어요. 다시 시도해 주세요.');
    } finally {
      // 어떤 경우에도 버튼이 로딩 상태로 멈춰 있지 않게 한다
      setBusy(null);
    }
    // 성공하면 세션이 생기면서 화면이 자동으로 탭 화면으로 바뀐다
  };

  const handleEmail = async () => {
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('이메일 형식이 올바르지 않아요.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상으로 입력해 주세요.');
      return;
    }

    setBusy('email');
    setError(null);
    setNotice(null);
    if (isSignUp) {
      const result = await signUpWithEmail(trimmedEmail, password);
      if (result.error) {
        setError(result.error);
        // 이미 가입된 이메일이면 로그인 화면으로 바꿔 바로 로그인할 수 있게 한다
        if (result.alreadyRegistered) setMode('signIn');
      } else if (result.needsEmailConfirmation) {
        setNotice('인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
        setMode('signIn');
        setPassword('');
      }
    } else {
      const result = await signInWithEmail(trimmedEmail, password);
      if (result.error) setError(result.error);
    }
    setBusy(null);
  };

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
  ];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <ThemedText type="title" style={styles.centerText}>
                먹어도 돼?
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                {'사진 한 장으로 소비기한을 챙겨요'}
              </ThemedText>
            </View>

            {FEATURES.kakaoLogin ? (
              <>
                <View style={styles.section}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy !== null}
                    onPress={handleKakao}
                    style={({ pressed }) => [styles.button, styles.kakao, pressed && styles.pressed]}>
                    {busy === 'kakao' ? (
                      <ActivityIndicator color="#191919" />
                    ) : (
                      <ThemedText type="smallBold" style={styles.kakaoText}>
                        카카오 로그인
                      </ThemedText>
                    )}
                  </Pressable>
                </View>

                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: theme.backgroundSelected }]} />
                  <ThemedText type="small" themeColor="textSecondary">
                    또는 이메일로
                  </ThemedText>
                  <View style={[styles.dividerLine, { backgroundColor: theme.backgroundSelected }]} />
                </View>
              </>
            ) : null}

            <View style={styles.section}>
              <TextInput
                accessibilityLabel="이메일"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="이메일"
                placeholderTextColor={theme.textSecondary}
                style={inputStyle}
                value={email}
              />
              <TextInput
                accessibilityLabel="비밀번호"
                autoCapitalize="none"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                onChangeText={setPassword}
                onSubmitEditing={handleEmail}
                placeholder="비밀번호 (6자 이상)"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="go"
                secureTextEntry
                style={inputStyle}
                value={password}
              />

              {error ? (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              ) : null}
              {notice ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {notice}
                </ThemedText>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy !== null}
                onPress={handleEmail}
                style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}>
                {busy === 'email' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText type="smallBold" style={styles.primaryText}>
                    {isSignUp ? '이메일로 가입하기' : '이메일로 로그인'}
                  </ThemedText>
                )}
              </Pressable>

              {!isSignUp ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/forgot-password')}
                  style={styles.switchMode}>
                  <ThemedText type="small" themeColor="textSecondary">
                    비밀번호를 잊으셨나요?
                  </ThemedText>
                </Pressable>
              ) : null}

              <Pressable accessibilityRole="button" onPress={switchMode} style={styles.switchMode}>
                <ThemedText type="small" themeColor="textSecondary">
                  {isSignUp ? '이미 계정이 있나요? 로그인' : '처음이신가요? 이메일로 가입하기'}
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.four,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  kakao: {
    backgroundColor: '#FEE500',
  },
  kakaoText: {
    color: '#191919',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  primary: {
    backgroundColor: '#FF7A9A',
  },
  primaryText: {
    color: '#fff',
  },
  pressed: {
    opacity: 0.7,
  },
  input: {
    minHeight: 52,
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  error: {
    color: '#E5484D',
  },
  switchMode: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
