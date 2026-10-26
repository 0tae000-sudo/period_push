import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type FridgeItem = {
  id: string;
  name: string;
  expiryDate: string | null; // YYYY-MM-DD
  storageType: 'fridge' | 'freezer';
  iconUrl: string | null; // 아이콘이 없거나 생성 중이면 null (기본 아이콘을 보여준다)
};

type Row = {
  id: string;
  name: string;
  expiry_date: string | null;
  storage_type: 'fridge' | 'freezer';
  icon: { image_url: string | null } | null;
};

/**
 * 냉장고에 들어 있는(active) 음식을 소비기한이 임박한 순으로 불러온다.
 * 이 화면이 다시 보일 때마다(등록 후 돌아오는 경우 등) 새로 불러온다.
 */
export function useFridgeItems() {
  const [items, setItems] = useState<FridgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('food_items')
      .select('id, name, expiry_date, storage_type, icon:food_icons(image_url)')
      .eq('status', 'active')
      .order('expiry_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .returns<Row[]>();

    if (queryError) {
      setError('냉장고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } else {
      setError(null);
      setItems(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          expiryDate: row.expiry_date,
          storageType: row.storage_type,
          iconUrl: row.icon?.image_url ?? null,
        })),
      );
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { items, loading, error, reload };
}
