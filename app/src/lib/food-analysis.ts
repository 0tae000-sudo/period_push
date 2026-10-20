import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

const PHOTO_BUCKET = 'food-photos';
const MAX_PHOTO_SIZE = 1024; // 긴 변 기준 px

export type FoodIcon = {
  id: string;
  key: string;
  image_url: string | null;
};

export type FoodAnalysisResult = {
  name: string;
  icon_key: string | null;
  icon: FoodIcon | null; // 카탈로그에 없으면 null (아이콘 생성은 별도 단계)
  category: string | null;
  expiry_date: string | null; // YYYY-MM-DD
  expiry_source: 'ocr' | 'ai_estimate' | null;
  storage_type: 'fridge' | 'freezer';
  confidence: number | null;
};

export type FoodAnalysis = {
  analysisId: string;
  photoPath: string;
  status: 'success' | 'no_food' | 'multiple_foods' | 'failed';
  result: FoodAnalysisResult | null;
};

export type AnalysisErrorCode = 'not_signed_in' | 'daily_limit' | 'upload_failed' | 'request_failed';

export class AnalysisError extends Error {
  constructor(
    public code: AnalysisErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AnalysisError';
  }
}

// 긴 변이 MAX_PHOTO_SIZE보다 길면 줄이고, JPEG로 저장한다.
async function resizePhoto(uri: string, width: number, height: number): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_PHOTO_SIZE) {
    context.resize(width >= height ? { width: MAX_PHOTO_SIZE } : { height: MAX_PHOTO_SIZE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return saved.uri;
}

/**
 * 사진을 줄여 Storage에 올린 뒤 Edge Function(analyze-food)으로 분석한다.
 * 분석 결과(성공, 음식 없음, 여러 개, 실패)는 status로 돌려주고, 로그인/한도/네트워크 문제는 AnalysisError로 던진다.
 */
export async function analyzePhoto(photo: { uri: string; width: number; height: number }): Promise<FoodAnalysis> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new AnalysisError('not_signed_in');

  let photoPath: string;
  try {
    const resizedUri = await resizePhoto(photo.uri, photo.width, photo.height);
    const body = await (await fetch(resizedUri)).arrayBuffer();
    photoPath = `${userData.user.id}/${randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(photoPath, body, {
      contentType: 'image/jpeg',
    });
    if (error) throw error;
  } catch (e) {
    throw new AnalysisError('upload_failed', e instanceof Error ? e.message : undefined);
  }

  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: { photo_path: photoPath },
  });

  if (error) {
    // 한도 초과(429)는 앱에서 별도 안내를 하므로 구분한다
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new AnalysisError('daily_limit');
    throw new AnalysisError('request_failed', error.message);
  }

  return {
    analysisId: data.analysis_id,
    photoPath,
    status: data.status,
    result: data.result ?? null,
  };
}
