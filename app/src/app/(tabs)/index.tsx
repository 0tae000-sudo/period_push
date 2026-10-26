import { Image } from 'expo-image';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset } from '@/constants/theme';

// 웹은 상단 탭바가 화면 위에 떠 있어서 그만큼 비워 둔다
const WEB_TOP_INSET = 72;
const FRIDGE_MAX_WIDTH = 480;

export default function FridgeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.container}>
      {/* 냉장고 그림이 상태바와 하단 탭바 사이를 가득 채운다. 음식 아이콘은 이 위에 FRIDGE_* 좌표로 얹는다. */}
      <View
        style={[
          styles.fridge,
          {
            marginTop: Platform.OS === 'web' ? WEB_TOP_INSET : insets.top,
            marginBottom: insets.bottom + BottomTabInset + 4,
          },
        ]}>
        <Image
          source={require('@/assets/images/fridge.png')}
          style={StyleSheet.absoluteFill}
          contentFit="fill"
          accessibilityLabel="냉장고"
        />

        {/* TODO: 음식 목록을 불러오면 아래 안내 대신 getFridgeSlot(index) 위치에 아이콘을 놓는다 */}
        <View style={styles.emptyNotice} pointerEvents="none">
          <ThemedText type="smallBold" style={styles.emptyText}>
            냉장고가 비어 있어요
          </ThemedText>
          <ThemedText type="small" style={styles.emptyText}>
            촬영 탭에서 음식을 담아 보세요
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  fridge: {
    flex: 1,
    width: '100%',
    maxWidth: FRIDGE_MAX_WIDTH,
  },
  emptyNotice: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  emptyText: {
    color: '#8A8272',
    textAlign: 'center',
  },
});
