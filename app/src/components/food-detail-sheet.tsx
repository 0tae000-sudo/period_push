import { Image } from 'expo-image';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { FridgeItem } from '@/hooks/use-fridge-items';
import { useTheme } from '@/hooks/use-theme';
import { daysUntil, describeDays, formatKoreanDate } from '@/lib/date';

type Props = {
  item: FridgeItem | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConsumed: () => void;
  onDiscarded: () => void;
};

/** 냉장고의 음식을 눌렀을 때 아래에서 올라오는 상세 시트 */
export function FoodDetailSheet({ item, busy, error, onClose, onConsumed, onDiscarded }: Props) {
  const theme = useTheme();
  const days = item?.expiryDate ? daysUntil(item.expiryDate) : null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={item !== null}>
      <Pressable accessibilityLabel="닫기" onPress={onClose} style={styles.backdrop} />
      {item ? (
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={styles.header}>
            <Image
              contentFit="contain"
              source={item.iconUrl ? { uri: item.iconUrl } : require('@/assets/images/default-food-icon.png')}
              style={styles.icon}
            />
            <View style={styles.headerText}>
              <ThemedText type="subtitle">{item.name}</ThemedText>
              <ThemedText themeColor="textSecondary">
                {item.storageType === 'freezer' ? '냉동 보관' : '냉장 보관'}
              </ThemedText>
            </View>
          </View>

          <View style={[styles.expiry, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              소비기한
            </ThemedText>
            <ThemedText type="smallBold">
              {item.expiryDate ? formatKoreanDate(item.expiryDate) : '날짜 없음'}
              {days !== null ? `  ·  ${describeDays(days)}` : ''}
            </ThemedText>
          </View>

          {error ? (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onConsumed}
              style={({ pressed }) => [styles.action, styles.primary, pressed && styles.pressed]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="smallBold" style={styles.primaryText}>
                  😋 다 먹었어요
                </ThemedText>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onDiscarded}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold">🗑️ 버렸어요</ThemedText>
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
            <ThemedText themeColor="textSecondary">닫기</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  icon: {
    width: 72,
    height: 72,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  expiry: {
    gap: 2,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
  },
  primary: {
    backgroundColor: '#FF7A9A',
  },
  primaryText: {
    color: '#fff',
  },
  close: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  error: {
    color: '#E5484D',
  },
  pressed: {
    opacity: 0.7,
  },
});
