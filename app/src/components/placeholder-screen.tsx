import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type Props = {
  title: string;
  description: string;
};

// 탭 화면 구현 전까지 쓰는 임시 화면
export function PlaceholderScreen({ title, description }: Props) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">{title}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.description}>
          {description}
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  description: {
    textAlign: 'center',
  },
});
