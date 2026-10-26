import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { FridgeItem as FridgeItemData } from '@/hooks/use-fridge-items';
import { daysUntil, shortDayLabel } from '@/lib/date';

type Props = {
  item: FridgeItemData;
  /** 아이콘이 서는 바닥 중앙 위치 (px, 냉장고 그림 기준) */
  x: number;
  floorY: number;
  size: number;
  onPress: (item: FridgeItemData) => void;
};

// 소비기한이 가까울수록 눈에 띄는 색으로 보여준다
function badgeColor(days: number | null): string {
  if (days === null) return '#B3AB98';
  if (days <= 1) return '#FF5C5C';
  if (days <= 3) return '#FF9F43';
  if (days <= 7) return '#E6B422';
  return '#4CAF50';
}

/** 냉장고 선반 위에 놓이는 음식 아이콘과 D-day 표시 */
export function FridgeItem({ item, x, floorY, size, onPress }: Props) {
  const days = item.expiryDate ? daysUntil(item.expiryDate) : null;
  const label = days === null ? '?' : shortDayLabel(days);
  const badgeHeight = Math.max(16, size * 0.3);

  return (
    <Pressable
      accessibilityLabel={`${item.name}, ${label}`}
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.item,
        {
          left: x - size / 2,
          top: floorY - size - badgeHeight + 2,
          width: size,
          height: size + badgeHeight,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.badge, { height: badgeHeight, backgroundColor: badgeColor(days) }]}>
        <ThemedText type="small" style={[styles.badgeText, { fontSize: Math.max(9, size * 0.19) }]}>
          {item.storageType === 'freezer' ? `❄️${label}` : label}
        </ThemedText>
      </View>
      <Image
        contentFit="contain"
        source={item.iconUrl ? { uri: item.iconUrl } : require('@/assets/images/default-food-icon.png')}
        style={{ width: size, height: size }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    position: 'absolute',
    alignItems: 'center',
  },
  badge: {
    minWidth: 34,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontWeight: '800',
    lineHeight: undefined,
  },
  pressed: {
    opacity: 0.7,
  },
});
