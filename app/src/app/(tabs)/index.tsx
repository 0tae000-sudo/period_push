import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FoodDetailSheet } from '@/components/food-detail-sheet';
import { FridgeItem } from '@/components/fridge-item';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FRIDGE_CAPACITY, FRIDGE_DESIGN, getFridgeSlot } from '@/constants/fridge-layout';
import { BottomTabInset } from '@/constants/theme';
import { useFridgeItems, type FridgeItem as FridgeItemData } from '@/hooks/use-fridge-items';
import { closeFoodItem } from '@/lib/food-items';

// 웹은 상단 탭바가 화면 위에 떠 있어서 그만큼 비워 둔다
const WEB_TOP_INSET = 72;
const FRIDGE_MAX_WIDTH = 480;
// 아이콘 크기: 냉장고 그림(너비 390 기준)에서 한 칸의 너비가 66이라 그보다 조금 작게 잡는다
const ICON_DESIGN_SIZE = 56;

export default function FridgeScreen() {
  const insets = useSafeAreaInsets();
  const { items, loading, error, reload } = useFridgeItems();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<FridgeItemData | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };

  const openItem = (item: FridgeItemData) => {
    setSheetError(null);
    setSelected(item);
  };

  const closeItem = async (status: 'consumed' | 'discarded') => {
    if (!selected || busy) return;
    setBusy(true);
    setSheetError(null);
    const result = await closeFoodItem(selected.id, status);
    setBusy(false);
    if (result.error) {
      setSheetError(result.error);
      return;
    }
    setSelected(null);
    reload();
  };

  const visibleItems = items.slice(0, FRIDGE_CAPACITY);
  const hiddenCount = items.length - visibleItems.length;
  const iconSize = (size.width * ICON_DESIGN_SIZE) / FRIDGE_DESIGN.width;

  return (
    <ThemedView style={styles.container}>
      {/* 냉장고 그림이 상태바와 하단 탭바 사이를 가득 채우고, 음식 아이콘이 선반 위에 놓인다 */}
      <View
        onLayout={onLayout}
        style={[
          styles.fridge,
          {
            marginTop: Platform.OS === 'web' ? WEB_TOP_INSET : insets.top,
            marginBottom: insets.bottom + BottomTabInset + 4,
          },
        ]}>
        <Image
          accessibilityLabel="냉장고"
          contentFit="fill"
          source={require('@/assets/images/fridge.png')}
          style={StyleSheet.absoluteFill}
        />

        {size.width > 0
          ? visibleItems.map((item, index) => {
              const slot = getFridgeSlot(index);
              if (!slot) return null;
              return (
                <FridgeItem
                  floorY={slot.yRatio * size.height}
                  item={item}
                  key={item.id}
                  onPress={openItem}
                  size={iconSize}
                  x={slot.xRatio * size.width}
                />
              );
            })
          : null}

        {loading ? (
          <View style={styles.center} pointerEvents="none">
            <ActivityIndicator color="#8A8272" />
          </View>
        ) : null}

        {!loading && items.length === 0 && !error ? (
          <View style={styles.center} pointerEvents="none">
            <ThemedText type="smallBold" style={styles.noticeText}>
              냉장고가 비어 있어요
            </ThemedText>
            <ThemedText type="small" style={styles.noticeText}>
              촬영 탭에서 음식을 담아 보세요
            </ThemedText>
          </View>
        ) : null}

        {error || hiddenCount > 0 ? (
          <View style={styles.topNotice} pointerEvents="none">
            <ThemedText type="small" style={styles.topNoticeText}>
              {error ?? `냉장고가 가득 차서 ${hiddenCount}개는 아직 보이지 않아요`}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <FoodDetailSheet
        busy={busy}
        error={sheetError}
        item={selected}
        onClose={() => setSelected(null)}
        onConsumed={() => closeItem('consumed')}
        onDiscarded={() => closeItem('discarded')}
      />
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
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  noticeText: {
    color: '#8A8272',
    textAlign: 'center',
  },
  topNotice: {
    position: 'absolute',
    top: '6.5%',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  topNoticeText: {
    color: '#8A8272',
    textAlign: 'center',
  },
});
