import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
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

import { DateField } from '@/components/date-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useFoodDraft, type ExpiryOrigin } from '@/contexts/food-draft-context';
import { useTheme } from '@/hooks/use-theme';
import { addDaysYmd, todayYmd, validateExpiryDate } from '@/lib/date';
import { createFoodItem } from '@/lib/food-items';

const PRIMARY = '#FF7A9A';
const NAME_MAX_LENGTH = 40;
const QUICK_DATES = [
  { label: '3일 뒤', days: 3 },
  { label: '1주일 뒤', days: 7 },
  { label: '2주일 뒤', days: 14 },
  { label: '1개월 뒤', days: 30 },
];

// 소비기한이 어디서 왔는지에 따라 보여주는 안내 배지
const BADGES: Record<ExpiryOrigin | 'none', { text: string; background: string; color: string }> = {
  ocr: { text: '📷 포장지에서 읽었어요', background: '#E3F7F4', color: '#2C8C80' },
  ai_estimate: { text: '✨ AI가 예상했어요', background: '#FFF1D6', color: '#B7791F' },
  manual: { text: '✏️ 직접 입력했어요', background: '#EEE9FF', color: '#6B5BD6' },
  none: { text: '🔍 날짜를 못 찾았어요. 알려주세요!', background: '#FFE3E8', color: '#D6455D' },
};

export default function RegisterFoodScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { draft, updateDraft, clearDraft } = useFoodDraft();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 새로고침 등으로 초안이 사라졌으면 처음 화면으로 돌려보낸다 (등록을 마친 경우는 제외)
  if (!draft) return saved ? null : <Redirect href="/" />;

  const name = draft.name.trim();
  const expiry = validateExpiryDate(draft.expiryDate);
  const nameMissing = name.length === 0;
  const dateMissing = !draft.expiryDate;
  const canSubmit = !nameMissing && !dateMissing && !expiry.error && !saving;
  const badge = BADGES[draft.expiryOrigin ?? 'none'];

  const setExpiry = (ymd: string) => updateDraft({ expiryDate: ymd, expiryOrigin: 'manual' });

  const close = () => {
    clearDraft();
    router.back();
  };

  const submit = async () => {
    setTriedSubmit(true);
    if (!canSubmit || !draft.expiryDate || !draft.expiryOrigin || !session) return;

    setSaving(true);
    setError(null);
    const result = await createFoodItem({
      userId: session.user.id,
      name,
      expiryDate: draft.expiryDate,
      expirySource: draft.expiryOrigin,
      storageType: draft.storageType,
      photoPath: draft.photoPath,
      analysisId: draft.analysisId,
      iconId: draft.icon?.id ?? null,
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    clearDraft();
    router.dismissTo('/');
  };

  const inputBase = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected },
  ];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              <ThemedText type="subtitle">냉장고에 넣기</ThemedText>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={close}>
                <ThemedText themeColor="textSecondary">닫기</ThemedText>
              </Pressable>
            </View>

            {/* 아이콘 */}
            <View style={styles.iconArea}>
              <View style={styles.iconCircle}>
                <Image
                  accessibilityLabel="음식 아이콘"
                  contentFit="contain"
                  source={
                    draft.icon?.image_url
                      ? { uri: draft.icon.image_url }
                      : require('@/assets/images/default-food-icon.png')
                  }
                  style={styles.icon}
                />
              </View>
              {!draft.icon?.image_url ? (
                <ThemedText type="small" themeColor="textSecondary">
                  아직 이 음식의 아이콘이 없어서 임시 아이콘을 보여줘요
                </ThemedText>
              ) : null}
            </View>

            {/* 제품명 */}
            <View style={styles.field}>
              <ThemedText type="smallBold">제품명</ThemedText>
              <TextInput
                accessibilityLabel="제품명"
                maxLength={NAME_MAX_LENGTH}
                onChangeText={(text) => updateDraft({ name: text })}
                placeholder="예: 딸기우유"
                placeholderTextColor={theme.textSecondary}
                style={[...inputBase, triedSubmit && nameMissing && styles.inputError]}
                value={draft.name}
              />
              {triedSubmit && nameMissing ? (
                <ThemedText type="small" style={styles.errorText}>
                  제품명을 입력해 주세요.
                </ThemedText>
              ) : null}
            </View>

            {/* 소비기한 */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <ThemedText type="smallBold">소비기한</ThemedText>
                <View style={[styles.badge, { backgroundColor: badge.background }]}>
                  <ThemedText type="small" style={[styles.badgeText, { color: badge.color }]}>
                    {badge.text}
                  </ThemedText>
                </View>
              </View>

              {draft.expiryOrigin === 'ai_estimate' ? (
                <ThemedText type="small" themeColor="textSecondary">
                  🐣 AI가 쓱 보고 예상한 날짜예요. 실제와 다를 수 있으니 꼭 확인해 주세요!
                  {draft.reason ? `\n“${draft.reason}”` : ''}
                </ThemedText>
              ) : null}

              <DateField highlight={dateMissing} onChange={setExpiry} value={draft.expiryDate} />

              <View style={styles.chips}>
                {QUICK_DATES.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.label}
                    onPress={() => setExpiry(addDaysYmd(todayYmd(), item.days))}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: theme.backgroundElement },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText type="small">{item.label}</ThemedText>
                  </Pressable>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/date-scan')}
                style={({ pressed }) => [styles.rescan, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={styles.rescanText}>
                  📷 날짜 부분만 다시 찍기
                </ThemedText>
              </Pressable>

              {expiry.error ? (
                <ThemedText type="small" style={styles.errorText}>
                  {expiry.error}
                </ThemedText>
              ) : null}
              {expiry.warning ? (
                <ThemedText type="small" style={styles.warningText}>
                  {expiry.warning}
                </ThemedText>
              ) : null}
              {triedSubmit && dateMissing ? (
                <ThemedText type="small" style={styles.errorText}>
                  소비기한을 입력해 주세요.
                </ThemedText>
              ) : null}
            </View>

            {/* 보관 위치 */}
            <View style={styles.field}>
              <ThemedText type="smallBold">보관 위치</ThemedText>
              <View style={styles.segment}>
                {(['fridge', 'freezer'] as const).map((type) => {
                  const active = draft.storageType === type;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={type}
                      onPress={() => updateDraft({ storageType: type })}
                      style={[
                        styles.segmentItem,
                        { backgroundColor: active ? PRIMARY : theme.backgroundElement },
                      ]}>
                      <ThemedText type="smallBold" style={{ color: active ? '#fff' : theme.text }}>
                        {type === 'fridge' ? '냉장' : '냉동'}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? (
              <ThemedText type="small" style={styles.errorText}>
                {error}
              </ThemedText>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={saving}
              onPress={submit}
              style={({ pressed }) => [
                styles.submit,
                !canSubmit && styles.submitDisabled,
                pressed && styles.pressed,
              ]}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText type="smallBold" style={styles.submitText}>
                  냉장고에 넣기
                </ThemedText>
              )}
            </Pressable>
          </View>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconArea: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE9EE',
  },
  icon: {
    width: 118,
    height: 118,
  },
  field: {
    gap: Spacing.two,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 1,
  },
  badgeText: {
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderRadius: Spacing.three,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#E5484D',
    borderWidth: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rescan: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.one,
  },
  rescanText: {
    color: PRIMARY,
  },
  segment: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  segmentItem: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
  },
  errorText: {
    color: '#E5484D',
  },
  warningText: {
    color: '#B7791F',
  },
  footer: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth / 2,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.two,
  },
  submit: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    backgroundColor: PRIMARY,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
