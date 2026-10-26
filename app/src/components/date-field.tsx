import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { daysUntil, describeDays, formatKoreanDate, formatYmd, parseYmd } from '@/lib/date';

type Props = {
  /** YYYY-MM-DD, 아직 없으면 null */
  value: string | null;
  onChange: (ymd: string) => void;
  /** 날짜가 꼭 필요한데 비어 있을 때 눈에 띄게 강조한다 */
  highlight?: boolean;
};

const PRIMARY = '#FF7A9A';

/** 소비기한 날짜 선택 칸. iOS는 달력, Android는 기본 날짜 선택창, 웹은 직접 입력(YYYY-MM-DD)이다. */
export function DateField({ value, onChange, highlight = false }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false); // iOS 달력 펼침
  // 웹에서 입력하는 중인 글자. 입력이 끝나면(포커스를 잃으면) null로 돌아가 value를 그대로 보여준다.
  const [typing, setTyping] = useState<string | null>(null);

  const borderColor = highlight ? PRIMARY : theme.backgroundSelected;
  const boxStyle = [
    styles.box,
    { backgroundColor: theme.backgroundElement, borderColor, borderWidth: highlight ? 2 : 1 },
  ];

  if (Platform.OS === 'web') {
    return (
      <TextInput
        accessibilityLabel="소비기한"
        inputMode="numeric"
        maxLength={10}
        onBlur={() => setTyping(null)}
        onChangeText={(next) => {
          setTyping(next);
          if (parseYmd(next)) onChange(next);
        }}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.textSecondary}
        style={[...boxStyle, { color: theme.text, fontSize: 16 }]}
        value={typing ?? value ?? ''}
      />
    );
  }

  const selected = value ? parseYmd(value) : null;
  const days = value ? daysUntil(value) : null;

  const handlePress = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selected ?? new Date(),
        mode: 'date',
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(formatYmd(date));
        },
      });
    } else {
      setOpen((current) => !current);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Pressable accessibilityRole="button" accessibilityLabel="소비기한 선택" onPress={handlePress} style={boxStyle}>
        {value ? (
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.dateText}>
              {formatKoreanDate(value)}
            </ThemedText>
            {days !== null ? (
              <View style={[styles.dayChip, days < 0 && styles.dayChipPast]}>
                <ThemedText type="small" style={[styles.dayChipText, days < 0 && styles.dayChipTextPast]}>
                  {describeDays(days)}
                </ThemedText>
              </View>
            ) : null}
          </View>
        ) : (
          <ThemedText themeColor="textSecondary">날짜를 선택해 주세요</ThemedText>
        )}
      </Pressable>

      {Platform.OS === 'ios' && open ? (
        <DateTimePicker
          display="inline"
          locale="ko-KR"
          mode="date"
          onChange={(_event, date) => {
            if (date) onChange(formatYmd(date));
          }}
          themeVariant={theme.background === '#000000' ? 'dark' : 'light'}
          value={selected ?? new Date()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  box: {
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  dateText: {
    fontSize: 16,
  },
  dayChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E3F7F4',
  },
  dayChipPast: {
    backgroundColor: '#FFE3E3',
  },
  dayChipText: {
    color: '#2C8C80',
    fontWeight: '700',
  },
  dayChipTextPast: {
    color: '#D6455D',
  },
});
