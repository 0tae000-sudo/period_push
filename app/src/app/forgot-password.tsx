import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^\d{6,8}$/;
const RESEND_SECONDS = 60;

type Step = 'email' | 'code';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { requestPasswordReset, resetPasswordWithCode } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // 코드 재전송 대기시간
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = async () => {
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('이메일 형식이 올바르지 않아요.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(trimmedEmail);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEmail(trimmedEmail);
    setStep('code');
    setCooldown(RESEND_SECONDS);
  };

  const submit = async () => {
    if (busy) return;
    if (!CODE_PATTERN.test(code)) {
      setError('메일로 받은 숫자 코드를 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상으로 입력해 주세요.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 서로 달라요.');
      return;
    }

    setBusy(true);
    setError(null);
    const result = await resetPasswordWithCode(email, code, password);
    setBusy(false);
    if (result.error) setError(result.error);
    // 성공하면 로그인 상태가 되면서 화면이 자동으로 탭 화면으로 바뀐다
  };

  const goBackToEmail = () => {
    setStep('email');
    setCode('');
    setPassword('');
    setPasswordConfirm('');
    setError(null);
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
              <ThemedText type="subtitle" style={styles.centerText}>
                비밀번호 찾기
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.centerText}>
                {step === 'email'
                  ? '가입한 이메일로 인증 코드를 보내드려요.'
                  : `${email}로 코드를 보냈어요.\n가입된 이메일이라면 곧 도착해요. 스팸함도 확인해 주세요.`}
              </ThemedText>
            </View>

            <View style={styles.section}>
              {step === 'email' ? (
                <TextInput
                  accessibilityLabel="이메일"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  inputMode="email"
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onSubmitEditing={sendCode}
                  placeholder="이메일"
                  placeholderTextColor={theme.textSecondary}
                  returnKeyType="send"
                  style={inputStyle}
                  value={email}
                />
              ) : (
                <>
                  <TextInput
                    accessibilityLabel="인증 코드"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    keyboardType="number-pad"
                    maxLength={8}
                    onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
                    placeholder="인증 코드 (숫자)"
                    placeholderTextColor={theme.textSecondary}
                    style={inputStyle}
                    textContentType="oneTimeCode"
                    value={code}
                  />
                  <TextInput
                    accessibilityLabel="새 비밀번호"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setPassword}
                    placeholder="새 비밀번호 (6자 이상)"
                    placeholderTextColor={theme.textSecondary}
                    secureTextEntry
                    style={inputStyle}
                    value={password}
                  />
                  <TextInput
                    accessibilityLabel="새 비밀번호 확인"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setPasswordConfirm}
                    onSubmitEditing={submit}
                    placeholder="새 비밀번호 확인"
                    placeholderTextColor={theme.textSecondary}
                    returnKeyType="go"
                    secureTextEntry
                    style={inputStyle}
                    value={passwordConfirm}
                  />
                </>
              )}

              {error ? (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={step === 'email' ? sendCode : submit}
                style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}>
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText type="smallBold" style={styles.primaryText}>
                    {step === 'email' ? '인증 코드 보내기' : '비밀번호 변경하기'}
                  </ThemedText>
                )}
              </Pressable>

              {step === 'code' ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || cooldown > 0}
                    onPress={sendCode}
                    style={styles.linkButton}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {cooldown > 0 ? `코드 다시 받기 (${cooldown}초 후)` : '코드 다시 받기'}
                    </ThemedText>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={goBackToEmail} style={styles.linkButton}>
                    <ThemedText type="small" themeColor="textSecondary">
                      다른 이메일로 받기
                    </ThemedText>
                  </Pressable>
                </>
              ) : null}

              <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.linkButton}>
                <ThemedText type="small" themeColor="textSecondary">
                  로그인으로 돌아가기
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
  },
  centerText: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  input: {
    minHeight: 52,
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
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
  error: {
    color: '#E5484D',
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
});
