// 음식 사진을 Gemini로 분석하고 결과를 food_analyses에 기록한다.
// 요청: POST { photo_path: "{user_id}/{파일명}.jpg" }  (Storage food-photos 버킷의 경로)
// 응답: 분석 결과는 항상 HTTP 200 + { status, ... }. 인증/요청 오류/한도 초과만 4xx.

import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  PROMPT_VERSION,
  RESPONSE_SCHEMA,
  USER_PROMPT,
  addDaysToDate,
  buildSystemPrompt,
  parseAnalysis,
  type AnalysisResult,
  type AnalysisStatus,
  type IconCatalogItem,
} from '../_shared/analysis.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite';
const DAILY_LIMIT = Number(Deno.env.get('ANALYSIS_DAILY_LIMIT') ?? '30');
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 앱에서 1024px로 줄여 올리므로 충분히 넉넉하다
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

async function callGemini(systemPrompt: string, mimeType: string, imageBase64: string): Promise<GeminiOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [{ text: USER_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: RESPONSE_SCHEMA,
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

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

  if (!GEMINI_API_KEY) return json({ error: 'server_misconfigured' }, 500);

  let photoPath: unknown;
  try {
    ({ photo_path: photoPath } = await req.json());
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

  // 기록/아이콘 조회는 서비스 롤로 한다 (food_analyses는 앱에서 쓰지 못한다)
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 하루 호출 한도 (재촬영과 실패 포함)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from('food_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (countError) return json({ error: 'server_error' }, 500);
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: 'daily_limit', limit: DAILY_LIMIT }, 429);

  const { data: blob, error: downloadError } = await userClient.storage.from('food-photos').download(photoPath);
  if (downloadError || !blob) return json({ error: 'photo_not_found' }, 404);
  if (blob.size > MAX_IMAGE_BYTES) return json({ error: 'photo_too_large' }, 413);
  const imageBase64 = encodeBase64(new Uint8Array(await blob.arrayBuffer()));
  const mimeType = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg';

  const { data: iconRows } = await admin
    .from('food_icons')
    .select('id, key, name_ko, category, image_url, default_shelf_life_days')
    .eq('status', 'ready')
    .limit(300);
  const icons = iconRows ?? [];
  const catalog: IconCatalogItem[] = icons.map((i) => ({ key: i.key, name_ko: i.name_ko, category: i.category }));

  const today = todayInKst();
  const gemini = await callGemini(buildSystemPrompt(catalog, today), mimeType, imageBase64);
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
      model: GEMINI_MODEL,
      prompt_version: PROMPT_VERSION,
      raw_result: rawResult,
      confidence: result?.confidence ?? null,
    })
    .select('id')
    .single();
  if (saveError || !saved) return json({ error: 'server_error' }, 500);

  return json({
    analysis_id: saved.id,
    status,
    result: status === 'success' ? { ...result, icon } : null,
  });
});
