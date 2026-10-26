import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { FoodIcon } from '@/lib/food-analysis';

/** 소비기한이 어디서 왔는지. null이면 아직 날짜가 없다. */
export type ExpiryOrigin = 'ocr' | 'ai_estimate' | 'manual';

/** 촬영 후 등록 화면에서 수정하는 음식 초안 */
export type FoodDraft = {
  analysisId: string | null;
  photoPath: string | null;
  icon: FoodIcon | null;
  iconKey: string | null;
  category: string | null;
  name: string;
  expiryDate: string | null; // YYYY-MM-DD
  expiryOrigin: ExpiryOrigin | null;
  /** AI가 소비기한을 그렇게 본 이유 */
  reason: string | null;
  storageType: 'fridge' | 'freezer';
};

export const EMPTY_DRAFT: FoodDraft = {
  analysisId: null,
  photoPath: null,
  icon: null,
  iconKey: null,
  category: null,
  name: '',
  expiryDate: null,
  expiryOrigin: null,
  reason: null,
  storageType: 'fridge',
};

type FoodDraftContextValue = {
  draft: FoodDraft | null;
  startDraft: (draft: FoodDraft) => void;
  updateDraft: (patch: Partial<FoodDraft>) => void;
  clearDraft: () => void;
};

const FoodDraftContext = createContext<FoodDraftContextValue | null>(null);

export function FoodDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<FoodDraft | null>(null);

  const startDraft = useCallback((next: FoodDraft) => setDraft(next), []);
  const updateDraft = useCallback(
    (patch: Partial<FoodDraft>) => setDraft((current) => (current ? { ...current, ...patch } : current)),
    [],
  );
  const clearDraft = useCallback(() => setDraft(null), []);

  const value = useMemo(
    () => ({ draft, startDraft, updateDraft, clearDraft }),
    [draft, startDraft, updateDraft, clearDraft],
  );
  return <FoodDraftContext.Provider value={value}>{children}</FoodDraftContext.Provider>;
}

export function useFoodDraft(): FoodDraftContextValue {
  const value = useContext(FoodDraftContext);
  if (!value) throw new Error('useFoodDraft는 FoodDraftProvider 안에서만 사용할 수 있어요.');
  return value;
}
