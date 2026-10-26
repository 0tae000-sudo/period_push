// 소비기한 날짜 도우미. 날짜는 "YYYY-MM-DD" 문자열로 다루고, 계산은 기기의 현지 날짜(한국) 기준이다.

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// 이보다 먼 미래의 날짜는 입력 오류로 본다
export const MAX_EXPIRY_YEARS = 5;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "YYYY-MM-DD"를 현지 자정의 Date로 바꾼다. 형식이 틀리거나 없는 날짜(2월 30일 등)면 null */
export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function todayYmd(now: Date = new Date()): string {
  return formatYmd(now);
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  if (!date) return ymd;
  date.setDate(date.getDate() + days);
  return formatYmd(date);
}

/** 오늘부터 해당 날짜까지 남은 일수. 오늘이면 0, 지났으면 음수 */
export function daysUntil(ymd: string, now: Date = new Date()): number | null {
  const target = parseYmd(ymd);
  const today = parseYmd(todayYmd(now));
  if (!target || !today) return null;
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

/** 예: 2026년 10월 25일 (일) */
export function formatKoreanDate(ymd: string): string {
  const date = parseYmd(ymd);
  if (!date) return ymd;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${DAY_NAMES[date.getDay()]})`;
}

/** 예: D-3, 오늘까지, 3일 지남 */
export function describeDays(days: number): string {
  if (days > 0) return `D-${days}`;
  if (days === 0) return '오늘까지';
  return `${-days}일 지남`;
}

/** 냉장고 아이콘 위의 짧은 표시. 예: D-3, D-DAY, D+2(지남) */
export function shortDayLabel(days: number): string {
  if (days > 0) return `D-${days}`;
  if (days === 0) return 'D-DAY';
  return `D+${-days}`;
}

export type ExpiryCheck = { error: string | null; warning: string | null };

/** 소비기한 입력 검사. error가 있으면 등록할 수 없고, warning은 안내만 한다. */
export function validateExpiryDate(ymd: string | null, now: Date = new Date()): ExpiryCheck {
  if (!ymd) return { error: null, warning: null };
  const days = daysUntil(ymd, now);
  if (days === null) return { error: '날짜 형식이 올바르지 않아요.', warning: null };

  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() + MAX_EXPIRY_YEARS);
  if (parseYmd(ymd)! > limit) {
    return { error: `${MAX_EXPIRY_YEARS}년이 넘는 날짜예요. 날짜를 다시 확인해 주세요.`, warning: null };
  }
  if (days < 0) {
    return { error: null, warning: `이미 지난 날짜예요 (${-days}일 지남). 그래도 등록할 수 있어요.` };
  }
  return { error: null, warning: null };
}
