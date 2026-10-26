import { randomUUID } from 'expo-crypto';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

const PHOTO_BUCKET = 'food-photos';
const MAX_PHOTO_SIZE = 1024; // 긴 변 기준 px
const JPEG_QUALITY = 0.8;

export type FoodIcon = {
  id: string;
  key: string;
  image_url: string | null;
};

export type ExpirySource = 'ocr' | 'ai_estimate';

export type FoodAnalysisResult = {
  name: string;
  icon_key: string | null;
  icon: FoodIcon | null; // 카탈로그에 없으면 null (아이콘 생성은 별도 단계)
  category: string | null;
  expiry_date: string | null; // YYYY-MM-DD
  expiry_source: ExpirySource | null;
  storage_type: 'fridge' | 'freezer';
  confidence: number | null;
  reason: string | null; // AI가 날짜를 그렇게 본 이유 (한 문장)
};

export type FoodAnalysis = {
  analysisId: string;
  photoPath: string;
  status: 'success' | 'no_food' | 'multiple_foods' | 'failed';
  result: FoodAnalysisResult | null;
};

export type DateAnalysis = {
  analysisId: string;
  photoPath: string;
  /** 사진에서 읽은 소비기한 (YYYY-MM-DD). 못 읽었으면 null */
  expiryDate: string | null;
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

type Photo = { uri: string; width: number; height: number };

// 긴 변이 MAX_PHOTO_SIZE보다 길면 줄이고, JPEG로 저장한다. 서버에 바로 보낼 base64도 함께 만든다.
async function resizePhoto(uri: string, width: number, height: number) {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > MAX_PHOTO_SIZE) {
    context.resize(width >= height ? { width: MAX_PHOTO_SIZE } : { height: MAX_PHOTO_SIZE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY, base64: true });
  if (!saved.base64) throw new Error('사진을 변환하지 못했어요.');
  return { uri: saved.uri, base64: saved.base64 };
}

// Storage에 사진을 올린다 (보관용). 분석에는 필요하지 않아서 분석과 동시에 진행한다.
async function uploadToStorage(uri: string, photoPath: string): Promise<void> {
  const body = await (await fetch(uri)).arrayBuffer();
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(photoPath, body, {
    contentType: 'image/jpeg',
  });
  if (error) throw error;
}

// 서버 함수(analyze-food) 호출. 한도 초과(429)는 앱에서 따로 안내하므로 구분한다.
async function invokeAnalysis(photoPath: string, imageBase64: string, mode?: 'date') {
  const { data, error } = await supabase.functions.invoke('analyze-food', {
    body: { photo_path: photoPath, image_base64: imageBase64, mode },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 429) throw new AnalysisError('daily_limit');
    throw new AnalysisError('request_failed', error.message);
  }
  return data;
}

/**
 * 사진을 줄이고, Storage 업로드와 서버 분석을 동시에 진행한다.
 * (예전에는 "업로드 → 서버가 다시 내려받기"라서 그만큼 더 오래 걸렸다.)
 */
async function uploadAndAnalyze(photo: Photo, mode?: 'date') {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new AnalysisError('not_signed_in');

  const startedAt = Date.now();
  let resized: { uri: string; base64: string };
  try {
    resized = await resizePhoto(photo.uri, photo.width, photo.height);
  } catch (e) {
    throw new AnalysisError('upload_failed', e instanceof Error ? e.message : undefined);
  }
  const resizedAt = Date.now();

  const photoPath = `${userData.user.id}/${randomUUID()}.jpg`;
  const [upload, analysis] = await Promise.allSettled([
    uploadToStorage(resized.uri, photoPath),
    invokeAnalysis(photoPath, resized.base64, mode),
  ]);

  // 한도 초과 같은 분석 쪽 오류를 먼저 알린다
  if (analysis.status === 'rejected') throw analysis.reason;
  if (upload.status === 'rejected') {
    throw new AnalysisError('upload_failed', upload.reason instanceof Error ? upload.reason.message : undefined);
  }

  if (__DEV__) {
    console.log('[사진 분석 시간]', {
      '사진 줄이기(ms)': resizedAt - startedAt,
      '업로드+분석(ms)': Date.now() - resizedAt,
      '전체(ms)': Date.now() - startedAt,
      '서버 단계별(ms)': analysis.value?.timings,
    });
  }
  return { photoPath, data: analysis.value };
}

/**
 * 사진을 줄여 Storage에 올린 뒤 Edge Function(analyze-food)으로 분석한다.
 * 분석 결과(성공, 음식 없음, 여러 개, 실패)는 status로 돌려주고, 로그인/한도/네트워크 문제는 AnalysisError로 던진다.
 */
export async function analyzePhoto(photo: Photo): Promise<FoodAnalysis> {
  const { photoPath, data } = await uploadAndAnalyze(photo);
  return {
    analysisId: data.analysis_id,
    photoPath,
    status: data.status,
    result: data.result ?? null,
  };
}

/** 소비기한이 적힌 부분만 다시 찍은 사진에서 날짜만 읽는다. */
export async function analyzeExpiryDate(photo: Photo): Promise<DateAnalysis> {
  const { photoPath, data } = await uploadAndAnalyze(photo, 'date');
  return {
    analysisId: data.analysis_id,
    photoPath,
    expiryDate: data.result?.expiry_date ?? null,
  };
}
