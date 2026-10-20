import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { showAlert } from '@/lib/alert';
import { AnalysisError, analyzePhoto } from '@/lib/food-analysis';

// 분석이 이만큼 연속으로 성공하지 못하면 "직접 입력하기"를 보여준다
const MANUAL_ENTRY_AFTER_FAILURES = 2;

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  // 하단 탭바 위로 컨트롤을 띄운다: 홈 인디케이터 영역 + 탭바 높이 + 여백
  const insets = useSafeAreaInsets();
  const controlsBottom = insets.bottom + BottomTabInset + Spacing.four;
  const cameraRef = useRef<CameraView>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  // 권한 상태를 아직 모르는 동안
  if (!permission) {
    return <ThemedView style={styles.flex} />;
  }

  if (!permission.granted) {
    return (
      <PermissionNotice
        canAskAgain={permission.canAskAgain}
        onRequest={requestPermission}
      />
    );
  }

  const takePicture = async () => {
    if (!cameraRef.current || !isCameraReady || isCapturing) return;
    setIsCapturing(true);
    try {
      // 업로드 전 리사이즈는 분석 단계에서 처리한다 (긴 변 약 1024px)
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setPhoto({ uri: picture.uri, width: picture.width, height: picture.height });
    } catch {
      showAlert('사진을 찍지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsCapturing(false);
    }
  };

  const retake = () => setPhoto(null);

  // TODO: 수정 가능한 입력창 화면으로 연결한다 (빈 입력창으로 시작)
  const enterManually = () => {
    showAlert('준비 중이에요', '직접 입력 화면은 다음 단계에서 연결할 예정이에요.');
  };

  // 성공하지 못한 경우: 안내하고 다시 찍게 한다. 연속 실패가 쌓이면 직접 입력을 권한다.
  const handleFailure = (title: string, message: string) => {
    const nextCount = failureCount + 1;
    setFailureCount(nextCount);
    setPhoto(null);
    showAlert(title, message, [
      { text: '다시 찍기', style: 'cancel' },
      ...(nextCount >= MANUAL_ENTRY_AFTER_FAILURES
        ? [{ text: '직접 입력하기', onPress: enterManually }]
        : []),
    ]);
  };

  const usePhoto = async () => {
    if (!photo || isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const analysis = await analyzePhoto(photo);
      if (analysis.status === 'success' && analysis.result) {
        setFailureCount(0);
        // TODO: 결과를 수정 가능한 입력창에 채워서 보여준다. 지금은 확인용으로만 표시한다.
        const { name, expiry_date, expiry_source, icon_key } = analysis.result;
        showAlert(
          '분석 결과 (임시)',
          `${name}\n소비기한: ${expiry_date ?? '알 수 없음'} (${expiry_source ?? '-'})\n아이콘: ${icon_key ?? '-'}`,
          [{ text: '확인', onPress: retake }],
        );
      } else if (analysis.status === 'multiple_foods') {
        handleFailure('음식이 여러 개 보여요', '한 번에 한 가지 음식만 찍어 주세요.');
      } else if (analysis.status === 'no_food') {
        handleFailure('음식을 찾지 못했어요', '음식이 잘 보이도록 다시 찍어 주세요.');
      } else {
        handleFailure('분석에 실패했어요', '잠시 후 다시 시도해 주세요.');
      }
    } catch (e) {
      const code = e instanceof AnalysisError ? e.code : 'request_failed';
      if (code === 'not_signed_in') {
        showAlert('로그인이 필요해요', '로그인한 뒤에 음식을 등록할 수 있어요.');
      } else if (code === 'daily_limit') {
        showAlert('오늘 분석 횟수를 모두 썼어요', '내일 다시 시도하거나 직접 입력해 주세요.', [
          { text: '확인', style: 'cancel' },
          { text: '직접 입력하기', onPress: enterManually },
        ]);
      } else {
        handleFailure('분석 중 문제가 생겼어요', '네트워크를 확인하고 다시 시도해 주세요.');
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (photo) {
    return (
      <View style={styles.black}>
        <Image source={{ uri: photo.uri }} style={styles.flex} contentFit="cover" />
        <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="none">
          <ThemedText type="smallBold" style={styles.overlayText}>
            {isAnalyzing ? '분석하고 있어요...' : '이 사진으로 분석할까요?'}
          </ThemedText>
        </SafeAreaView>
        <View style={[styles.bottomOverlay, { bottom: controlsBottom }]}>
          <Pressable
            accessibilityRole="button"
            disabled={isAnalyzing}
            onPress={retake}
            style={({ pressed }) => [
              styles.secondaryButton,
              (pressed || isAnalyzing) && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={styles.overlayText}>
              다시 찍기
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isAnalyzing}
            onPress={usePhoto}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            {isAnalyzing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText type="smallBold" style={styles.primaryButtonText}>
                사용하기
              </ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.black}>
      {/* 탭이 화면에 보일 때만 카메라를 켜서 배터리와 발열을 줄인다 */}
      <CameraView
        ref={cameraRef}
        style={styles.flex}
        facing="back"
        active={isFocused}
        onCameraReady={() => setIsCameraReady(true)}
        onMountError={() =>
          showAlert('카메라를 켜지 못했어요', '앱을 다시 실행해 주세요.')
        }
      />
      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="none">
        <ThemedText type="smallBold" style={styles.overlayText}>
          음식 한 가지만 화면에 담아주세요
        </ThemedText>
      </SafeAreaView>
      <View style={[styles.bottomOverlay, { bottom: controlsBottom }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="사진 찍기"
          disabled={!isCameraReady || isCapturing}
          onPress={takePicture}
          style={({ pressed }) => [
            styles.shutterOuter,
            (!isCameraReady || isCapturing) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          {isCapturing ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
        </Pressable>
      </View>
    </View>
  );
}

type PermissionNoticeProps = {
  canAskAgain: boolean;
  onRequest: () => Promise<unknown>;
};

function PermissionNotice({ canAskAgain, onRequest }: PermissionNoticeProps) {
  const insets = useSafeAreaInsets();
  return (
    <ThemedView style={styles.notice}>
      <SafeAreaView style={[styles.noticeContent, { paddingBottom: insets.bottom + BottomTabInset }]}>
        <ThemedText type="subtitle" style={styles.centerText}>
          카메라 권한이 필요해요
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          {canAskAgain
            ? '음식 사진을 찍어 소비기한을 분석하려면\n카메라 접근을 허용해 주세요.'
            : '카메라 권한이 꺼져 있어요.\n설정에서 카메라 접근을 허용해 주세요.'}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          onPress={canAskAgain ? onRequest : () => Linking.openSettings()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.primaryButtonText}>
            {canAskAgain ? '권한 허용하기' : '설정 열기'}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
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
  },
  overlayText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
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
  secondaryButton: {
    minWidth: 120,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
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
});
