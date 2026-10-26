// 음식 사진을 Gemini로 분석하고 결과를 food_analyses에 기록한다.
// 요청: POST { photo_path: "{user_id}/{파일명}.jpg" }  (Storage food-photos 버킷의 경로)
// 응답: 분석 결과는 항상 HTTP 200 + { status, ... }. 인증/요청 오류/한도 초과만 4xx.

import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  DATE_PROMPT_VERSION,
  DATE_RESPONSE_SCHEMA,
  DATE_USER_PROMPT,
  PROMPT_VERSION,
  RESPONSE_SCHEMA,
  USER_PROMPT,
  addDaysToDate,
  buildDatePrompt,
  buildSystemPrompt,
  parseAnalysis,
  parseDateAnalysis,
  type AnalysisResult,
  type AnalysisStatus,
  type IconCatalogItem,
} from '../_shared/analysis.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// 사용할 모델을 우선순위 순서로 쉼표로 나열한다 (시크릿 GEMINI_MODELS, 하나만 쓰려면 GEMINI_MODEL).
// 앞 모델이 느리거나(시간 초과) 혼잡해서(503 등) 실패하면 다음 모델로 자동으로 넘어간다.
const GEMINI_MODELS = (
  Deno.env.get('GEMINI_MODELS') ??
  Deno.env.get('GEMINI_MODEL') ??
  'gemini-3-flash-preview,gemini-3.5-flash,gemini-3.5-flash-lite'
)
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const ATTEMPT_TIMEOUT_MS = Number(Deno.env.get('GEMINI_ATTEMPT_TIMEOUT_MS') ?? '15000'); // 마지막 모델을 뺀 모델의 대기 시간
const DAILY_LIMIT = Number(Deno.env.get('ANALYSIS_DAILY_LIMIT') ?? '30');
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 앱에서 1024px로 줄여 올리므로 충분히 넉넉하다
const MAX_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8;
const GEMINI_TIMEOUT_MS = 30_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function todayInKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type GeminiOutcome =
  | { ok: true; text: string; usage: unknown }
  | { ok: false; error: string };

type GeminiRequest = {
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  mimeType: string;
  imageBase64: string;
};

async function callGemini(
  { systemPrompt, userPrompt, schema, mimeType, imageBase64 }: GeminiRequest,
  model: string,
  timeoutMs: number,
): Promise<GeminiOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }, { inlineData: { mimeType, data: imageBase64 } }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            temperature: 0.2,
          },
        }),
      },
    );
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 500);
      return { ok: false, error: `gemini_http_${res.status}: ${detail}` };
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      const reason = data?.promptFeedback?.blockReason ?? data?.candidates?.[0]?.finishReason ?? 'no_text';
      return { ok: false, error: `gemini_no_text: ${reason}` };
    }
    return { ok: true, text, usage: data.usageMetadata ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `gemini_fetch: ${e.name}` : 'gemini_fetch' };
  } finally {
    clearTimeout(timer);
  }
}

type Attempt = { model: string; ms: number; error?: string };

/** 우선순위 순서대로 모델을 시도한다. 성공하면 바로 돌려주고, 모두 실패하면 마지막 실패를 돌려준다. */
async function callGeminiWithFallback(
  request: GeminiRequest,
): Promise<{ outcome: GeminiOutcome; model: string; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  let outcome: GeminiOutcome = { ok: false, error: 'no_model' };
  let model = GEMINI_MODELS[GEMINI_MODELS.length - 1] ?? 'unknown';
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    model = GEMINI_MODELS[i];
    const isLast = i === GEMINI_MODELS.length - 1;
    const startedAttempt = performance.now();
    outcome = await callGemini(request, model, isLast ? GEMINI_TIMEOUT_MS : ATTEMPT_TIMEOUT_MS);
    attempts.push({
      model,
      ms: Math.round(performance.now() - startedAttempt),
      ...(outcome.ok ? {} : { error: outcome.error.slice(0, 120) }),
    });
    if (outcome.ok) break;
  }
  return { outcome, model, attempts };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 단계별 걸린 시간(ms). 느린 곳을 찾기 위해 분석 기록에 함께 남긴다.
  const startedAt = performance.now();
  let lapAt = startedAt;
  const timings: Record<string, number> = {};
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - lapAt);
    lapAt = now;
  };

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  // 호출한 회원 확인 (이 클라이언트는 회원 권한으로 동작하므로 Storage RLS가 그대로 적용된다)
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;
  lap('auth_ms');

  if (!GEMINI_API_KEY) return json({ error: 'server_misconfigured' }, 500);

  let photoPath: unknown;
  let mode: unknown;
  let imageBase64Input: unknown;
  try {
    ({ photo_path: photoPath, mode, image_base64: imageBase64Input } = await req.json());
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  if (
    typeof photoPath !== 'string' ||
    !photoPath.startsWith(`${userId}/`) ||
    photoPath.includes('..') ||
    photoPath.length > 200
  ) {
    return json({ error: 'invalid_photo_path' }, 400);
  }
  // 앱이 사진을 요청에 함께 보내면 Storage에서 다시 내려받지 않아도 된다 (JPEG, 줄인 사진)
  let imageBase64: string | null = null;
  if (imageBase64Input !== undefined && imageBase64Input !== null) {
    if (
      typeof imageBase64Input !== 'string' ||
      imageBase64Input.length === 0 ||
      imageBase64Input.length > MAX_BASE64_LENGTH ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64Input)
    ) {
      return json({ error: 'invalid_image' }, 400);
    }
    imageBase64 = imageBase64Input;
  }
  const isDateMode = mode === 'date';

  // 기록/아이콘 조회는 서비스 롤로 한다 (food_analyses는 앱에서 쓰지 못한다)
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 서로 기다릴 필요 없는 준비 작업은 한꺼번에 한다: 하루 호출 한도 확인, 아이콘 목록, (필요하면) 사진 내려받기
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [countResult, iconResult, downloaded] = await Promise.all([
    admin.from('food_analyses').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', since),
    isDateMode
      ? Promise.resolve(null)
      : admin
          .from('food_icons')
          .select('id, key, name_ko, category, image_url, default_shelf_life_days')
          .eq('status', 'ready')
          .limit(300),
    imageBase64 ? Promise.resolve(null) : userClient.storage.from('food-photos').download(photoPath),
  ]);
  lap('prep_ms');

  // 하루 호출 한도 (재촬영과 실패 포함)
  if (countResult.error) return json({ error: 'server_error' }, 500);
  if ((countResult.count ?? 0) >= DAILY_LIMIT) return json({ error: 'daily_limit', limit: DAILY_LIMIT }, 429);

  let mimeType = 'image/jpeg';
  if (!imageBase64) {
    if (!downloaded || downloaded.error || !downloaded.data) return json({ error: 'photo_not_found' }, 404);
    if (downloaded.data.size > MAX_IMAGE_BYTES) return json({ error: 'photo_too_large' }, 413);
    imageBase64 = encodeBase64(new Uint8Array(await downloaded.data.arrayBuffer()));
    if (downloaded.data.type?.startsWith('image/')) mimeType = downloaded.data.type;
  }

  const today = todayInKst();

  // 날짜 부분만 다시 찍은 사진: 소비기한 날짜만 읽는다
  if (isDateMode) {
    const {
      outcome: dateGemini,
      model: dateModel,
      attempts: dateAttempts,
    } = await callGeminiWithFallback({
      systemPrompt: buildDatePrompt(today),
      userPrompt: DATE_USER_PROMPT,
      schema: DATE_RESPONSE_SCHEMA,
      mimeType,
      imageBase64,
    });
    lap('gemini_ms');
    const dateParsed = dateGemini.ok ? parseDateAnalysis(dateGemini.text, today) : null;
    const found = !!(dateParsed?.ok && dateParsed.result.expiry_date);
    const dateRaw: Record<string, unknown> =
      dateGemini.ok && dateParsed?.ok
        ? { ...dateParsed.result, usage: dateGemini.usage }
        : { error: !dateGemini.ok ? dateGemini.error : dateParsed && !dateParsed.ok ? dateParsed.error : 'unknown' };

    const { data: dateSaved, error: dateSaveError } = await admin
      .from('food_analyses')
      .insert({
        user_id: userId,
        photo_path: photoPath,
        status: found ? 'success' : 'failed',
        model: dateModel,
        prompt_version: DATE_PROMPT_VERSION,
        raw_result: { ...dateRaw, timings, attempts: dateAttempts },
        confidence: dateParsed?.ok ? dateParsed.result.confidence : null,
      })
      .select('id')
      .single();
    lap('db_ms');
    timings.total_ms = Math.round(performance.now() - startedAt);
    if (dateSaveError || !dateSaved) return json({ error: 'server_error' }, 500);

    return json({
      analysis_id: dateSaved.id,
      status: found ? 'success' : 'failed',
      result: found && dateParsed?.ok ? dateParsed.result : null,
      timings,
      model: dateModel,
    });
  }

  const icons = iconResult?.data ?? [];
  const catalog: IconCatalogItem[] = icons.map((i) => ({ key: i.key, name_ko: i.name_ko, category: i.category }));

  const { outcome: gemini, model: usedModel, attempts } = await callGeminiWithFallback({
    systemPrompt: buildSystemPrompt(catalog, today),
    userPrompt: USER_PROMPT,
    schema: RESPONSE_SCHEMA,
    mimeType,
    imageBase64,
  });
  lap('gemini_ms');
  const parsed = gemini.ok ? parseAnalysis(gemini.text, today) : null;

  let status: AnalysisStatus = 'failed';
  let result: AnalysisResult | null = null;
  let rawResult: Record<string, unknown>;
  if (gemini.ok && parsed?.ok) {
    status = parsed.status;
    result = parsed.result;
    rawResult = { ...result, usage: gemini.usage };
  } else {
    const error = !gemini.ok ? gemini.error : parsed && !parsed.ok ? parsed.error : 'unknown';
    rawResult = { error, text: gemini.ok ? gemini.text.slice(0, 2000) : null };
  }

  // 카탈로그에 있는 아이콘이면 연결하고, 날짜를 못 구했으면 아이콘의 기본 보관일수로 추정한다
  let icon: { id: string; key: string; image_url: string | null } | null = null;
  if (result && status === 'success') {
    const matched = icons.find((i) => i.key === result!.icon_key);
    if (matched) {
      icon = { id: matched.id, key: matched.key, image_url: matched.image_url };
      if (!result.expiry_date && matched.default_shelf_life_days) {
        result.expiry_date = addDaysToDate(today, matched.default_shelf_life_days);
        result.expiry_source = 'ai_estimate';
      }
    }
  }

  const { data: saved, error: saveError } = await admin
    .from('food_analyses')
    .insert({
      user_id: userId,
      photo_path: photoPath,
      status,
      model: usedModel,
      prompt_version: PROMPT_VERSION,
      raw_result: { ...rawResult, timings, attempts },
      confidence: result?.confidence ?? null,
    })
    .select('id')
    .single();
  lap('db_ms');
  timings.total_ms = Math.round(performance.now() - startedAt);
  if (saveError || !saved) return json({ error: 'server_error' }, 500);

  return json({
    analysis_id: saved.id,
    status,
    result: status === 'success' ? { ...result, icon } : null,
    timings,
    model: usedModel,
  });
});
