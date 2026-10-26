import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { FoodDraftProvider } from '@/contexts/food-draft-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <FoodDraftProvider>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </FoodDraftProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// 로그인 여부에 따라 로그인 화면과 탭 화면을 자동으로 전환한다.
function RootNavigator() {
  const { session, isLoading, isResettingPassword } = useAuth();
  const isSignedIn = !!session && !isResettingPassword;

  // 저장된 세션을 확인하는 동안에는 스플래시가 화면을 덮고 있다.
  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="register-food" options={{ presentation: 'modal' }} />
        <Stack.Screen name="date-scan" options={{ presentation: 'fullScreenModal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
    </Stack>
  );
}
