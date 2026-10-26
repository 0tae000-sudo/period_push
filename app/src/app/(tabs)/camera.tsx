import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useIsFocused, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { EMPTY_DRAFT, useFoodDraft } from '@/contexts/food-draft-context';
import { showAlert } from '@/lib/alert';
import { AnalysisError, analyzePhoto } from '@/lib/food-analysis';

// 분석이 이만큼 연속으로 성공하지 못하면 "직접 입력하기"를 보여준다
const MANUAL_ENTRY_AFTER_FAILURES = 2;

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const router = useRouter();
  const { startDraft } = useFoodDraft();
  // 하단 탭바 위로 컨트롤을 띄운다: 홈 인디케이터 영역 + 탭바 높이 + 여백
  const insets = useSafeAreaInsets();
  const controlsBottom = insets.bottom + BottomTabInset + Spacing.four;
  const cameraRef = useRef<CameraView>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [failureCount, setFailureCount] = useState(0);
  // 가장 최근 분석 기록. "직접 입력하기"로 넘어갈 때 올려 둔 사진을 함께 쓰려고 기억해 둔다.
  const lastAnalysisRef = useRef<{ analysisId: string; photoPath: string } | null>(null);
  // 분석 요청 번호. 분석 중에 "다시 찍기"를 누르면 번호가 바뀌어서 늦게 도착한 옛 결과는 무시한다.
  const requestIdRef = useRef(0);

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
      const taken = { uri: picture.uri, width: picture.width, height: picture.height };
      setPhoto(taken);
      // 사진을 확인하는 단계 없이 바로 분석을 시작한다 (잘못 찍었으면 다시 찍기를 누르면 된다)
      startAnalysis(taken);
    } catch {
      showAlert('사진을 찍지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally {
      setIsCapturing(false);
    }
  };

  const retake = () => {
    requestIdRef.current += 1;
    setPhoto(null);
  };

  // 빈 입력창으로 등록 화면을 연다. 이미 올린 사진이 있으면 함께 쓴다.
  const enterManually = () => {
    startDraft({
      ...EMPTY_DRAFT,
      analysisId: lastAnalysisRef.current?.analysisId ?? null,
      photoPath: lastAnalysisRef.current?.photoPath ?? null,
    });
    setPhoto(null);
    router.push('/register-food');
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

  const startAnalysis = async (target: { uri: string; width: number; height: number }) => {
    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;
    lastAnalysisRef.current = null;
    try {
      const analysis = await analyzePhoto(target);
      if (!isCurrent()) return; // 그 사이 다시 찍기를 눌렀다
      lastAnalysisRef.current = { analysisId: analysis.analysisId, photoPath: analysis.photoPath };
      if (analysis.status === 'success' && analysis.result) {
        setFailureCount(0);
        // 분석 결과를 등록 화면에 채워서 보여준다. 날짜를 못 읽었으면 날짜 칸이 비어 있다.
        const r = analysis.result;
        startDraft({
          analysisId: analysis.analysisId,
          photoPath: analysis.photoPath,
          icon: r.icon,
          iconKey: r.icon_key,
          category: r.category,
          name: r.name,
          expiryDate: r.expiry_date,
          expiryOrigin: r.expiry_date ? (r.expiry_source ?? 'ai_estimate') : null,
          reason: r.reason,
          storageType: r.storage_type,
        });
        setPhoto(null);
        router.push('/register-food');
      } else if (analysis.status === 'multiple_foods') {
        handleFailure('음식이 여러 개 보여요', '한 번에 한 가지 음식만 찍어 주세요.');
      } else if (analysis.status === 'no_food') {
        handleFailure('음식을 찾지 못했어요', '음식이 잘 보이도록 다시 찍어 주세요.');
      } else {
        handleFailure('분석에 실패했어요', '잠시 후 다시 시도해 주세요.');
      }
    } catch (e) {
      if (!isCurrent()) return;
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
    }
  };

  if (photo) {
    return (
      <View style={styles.black}>
        <Image source={{ uri: photo.uri }} style={styles.flex} contentFit="cover" />
        <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="none">
          <ThemedText type="smallBold" style={styles.overlayText}>
            음식을 살펴보고 있어요...
          </ThemedText>
        </SafeAreaView>
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
        <View style={[styles.bottomOverlay, { bottom: controlsBottom }]}>
          <Pressable
            accessibilityRole="button"
            onPress={retake}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.overlayText}>
              취소하고 다시 찍기
            </ThemedText>
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
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
