import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useIsFocused, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFoodDraft } from '@/contexts/food-draft-context';
import { showAlert } from '@/lib/alert';
import { AnalysisError, analyzeExpiryDate } from '@/lib/food-analysis';

/** 소비기한이 적힌 부분만 가까이에서 다시 찍어, 날짜만 읽어 오는 화면 */
export default function DateScanScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { draft, updateDraft } = useFoodDraft();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  if (!draft) return <Redirect href="/" />;

  const close = () => router.back();

  if (!permission) return <ThemedView style={styles.flex} />;

  if (!permission.granted) {
    return (
      <ThemedView style={styles.notice}>
        <SafeAreaView style={styles.noticeContent}>
          <ThemedText type="subtitle" style={styles.centerText}>
            카메라 권한이 필요해요
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={permission.canAskAgain ? requestPermission : close}
            style={styles.primaryButton}>
            <ThemedText type="smallBold" style={styles.primaryButtonText}>
              {permission.canAskAgain ? '권한 허용하기' : '돌아가기'}
            </ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const scan = async () => {
    if (!cameraRef.current || !isCameraReady || isWorking) return;
    setIsWorking(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      const result = await analyzeExpiryDate({
        uri: picture.uri,
        width: picture.width,
        height: picture.height,
      });

      if (result.expiryDate) {
        updateDraft({ expiryDate: result.expiryDate, expiryOrigin: 'ocr', reason: null });
        router.back();
      } else {
        showAlert('날짜를 찾지 못했어요', '날짜가 크게 보이도록 더 가까이, 밝은 곳에서 다시 찍어 주세요.');
      }
    } catch (e) {
      const code = e instanceof AnalysisError ? e.code : 'request_failed';
      if (code === 'daily_limit') {
        showAlert('오늘 분석 횟수를 모두 썼어요', '날짜를 직접 입력해 주세요.', [
          { text: '돌아가기', onPress: close },
        ]);
      } else {
        showAlert('날짜를 읽는 중 문제가 생겼어요', '네트워크를 확인하고 다시 시도해 주세요.');
      }
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <View style={styles.black}>
      <CameraView
        ref={cameraRef}
        active={isFocused}
        facing="back"
        onCameraReady={() => setIsCameraReady(true)}
        style={styles.flex}
      />

      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.hintBubble} pointerEvents="none">
          <ThemedText type="smallBold" style={styles.overlayText}>
            소비기한이 적힌 부분을 가까이 찍어 주세요
          </ThemedText>
        </View>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={close} style={styles.closeButton}>
          <ThemedText type="smallBold" style={styles.overlayText}>
            닫기
          </ThemedText>
        </Pressable>
      </SafeAreaView>

      {/* 날짜가 들어올 자리를 알려 주는 가이드 상자 */}
      <View style={styles.guideWrap} pointerEvents="none">
        <View style={styles.guideBox} />
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottomOverlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사진 찍기"
          disabled={!isCameraReady || isWorking}
          onPress={scan}
          style={({ pressed }) => [
            styles.shutterOuter,
            (!isCameraReady || isWorking) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          {isWorking ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
        </Pressable>
        {isWorking ? (
          <ThemedText type="smallBold" style={styles.overlayText}>
            날짜를 찾는 중이에요...
          </ThemedText>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  black: {
    flex: 1,
    backgroundColor: '#000',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  hintBubble: {
    alignItems: 'center',
  },
  overlayText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginRight: Spacing.three,
  },
  guideWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideBox: {
    width: '78%',
    height: 110,
    borderRadius: Spacing.three,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderStyle: 'dashed',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  notice: {
    flex: 1,
  },
  noticeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  primaryButton: {
    minWidth: 140,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    backgroundColor: '#FF7A9A',
  },
  primaryButtonText: {
    color: '#fff',
  },
});
