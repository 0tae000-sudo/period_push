import { supabase } from '@/lib/supabase';

export type NewFoodItem = {
  userId: string;
  name: string;
  expiryDate: string; // YYYY-MM-DD
  /** 소비기한의 출처: 포장지에서 읽음(ocr), AI 추정(ai_estimate), 직접 입력(manual) */
  expirySource: 'ocr' | 'ai_estimate' | 'manual';
  storageType: 'fridge' | 'freezer';
  photoPath: string | null;
  analysisId: string | null;
  iconId: string | null;
};

/**
 * 음식을 냉장고에 등록한다. 알림은 DB 트리거가 자동으로 예약한다.
 * 실패하면 사용자에게 보여줄 한글 메시지를 돌려준다.
 */
export async function createFoodItem(input: NewFoodItem): Promise<{ error: string | null }> {
  const { error } = await supabase.from('food_items').insert({
    user_id: input.userId,
    name: input.name.trim(),
    expiry_date: input.expiryDate,
    expiry_source: input.expirySource,
    storage_type: input.storageType,
    photo_path: input.photoPath,
    analysis_id: input.analysisId,
    icon_id: input.iconId,
  });
  if (!error) return { error: null };

  // analysis_id는 한 번만 쓸 수 있다 (같은 분석 결과로 두 번 등록한 경우)
  if (error.code === '23505') return { error: '이미 등록한 사진이에요. 새로 찍어 주세요.' };
  return { error: '등록하지 못했어요. 잠시 후 다시 시도해 주세요.' };
}

/** 음식을 다 먹었거나 버렸을 때 냉장고에서 뺀다. 남은 알림은 DB 트리거가 건너뜀 처리한다. */
export async function closeFoodItem(
  id: string,
  status: 'consumed' | 'discarded',
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('food_items')
    .update({ status, closed_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? '처리하지 못했어요. 잠시 후 다시 시도해 주세요.' : null };
}
