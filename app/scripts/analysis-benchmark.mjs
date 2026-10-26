// 사진 분석(Gemini) 속도 비교: 같은 사진을 여러 설정으로 보내 걸린 시간과 토큰 수를 표로 보여준다.
//
// 사용법 (app 폴더에서, 키는 채팅에 쓰지 말고 터미널에만 입력):
//   GEMINI_API_KEY=발급받은키 node --experimental-strip-types scripts/analysis-benchmark.mjs <음식 사진 경로>
//   예) ... scripts/analysis-benchmark.mjs ~/Desktop/milk.jpg
//   node --experimental-strip-types scripts/analysis-benchmark.mjs --dry     # 점검만 (키, 네트워크 필요 없음)
//
// 사진은 실제로 앱에서 찍는 것과 비슷한 음식 사진이 좋다 (포장지가 보이는 것 하나, 신선식품 하나를 따로 시험해 보면 더 좋다).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RESPONSE_SCHEMA,
  USER_PROMPT,
  buildSystemPrompt,
  parseAnalysis,
} from '../supabase/functions/_shared/analysis.ts';

const CURRENT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const RUNS = Number(argValue('--runs') ?? 2);
// 예: --only 8,10,11  (번호로 변형을 골라 실행)
const ONLY = argValue('--only')?.split(',').map((n) => n.trim()) ?? null;

// 미리 만들 아이콘 30개가 들어갔을 때를 가정한 카탈로그 (프롬프트 길이를 실제와 비슷하게 맞추려는 용도)
const CATALOG = [
  ['apple', '사과', '과일'], ['banana', '바나나', '과일'], ['strawberry', '딸기', '과일'], ['mandarin', '귤', '과일'],
  ['grape', '포도', '과일'], ['watermelon', '수박', '과일'], ['carrot', '당근', '채소'], ['onion', '양파', '채소'],
  ['potato', '감자', '채소'], ['tomato', '토마토', '채소'], ['broccoli', '브로콜리', '채소'], ['cucumber', '오이', '채소'],
  ['bell_pepper', '파프리카', '채소'], ['lettuce', '상추', '채소'], ['beef', '소고기', '육류'], ['pork', '돼지고기', '육류'],
  ['chicken', '닭고기', '육류'], ['fish', '생선', '수산물'], ['egg', '계란', '계란'], ['milk', '우유', '유제품'],
  ['cheese', '치즈', '유제품'], ['yogurt', '요거트', '유제품'], ['tofu', '두부', '가공식품'], ['kimchi', '김치', '가공식품'],
  ['ham', '햄', '가공식품'], ['fish_cake', '어묵', '가공식품'], ['dumpling', '만두', '가공식품'], ['bread', '빵', '가공식품'],
  ['cake', '케이크', '조리음식'], ['juice', '주스', '음료'],
].map(([key, name_ko, category]) => ({ key, name_ko, category }));

const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 비교할 변형. generationConfig에 덧붙일 설정(gen), 모델, 사진 크기, 스키마 사용 여부를 바꾼다.
const VARIANTS = [
  { name: '1. 현재 설정', model: CURRENT_MODEL },
  { name: '2. 생각 수준 minimal', model: CURRENT_MODEL, gen: { thinkingConfig: { thinkingLevel: 'minimal' } } },
  { name: '3. 생각 끄기(예산 0)', model: CURRENT_MODEL, gen: { thinkingConfig: { thinkingBudget: 0 } } },
  { name: '4. gemini-2.5-flash-lite', model: 'gemini-2.5-flash-lite' },
  { name: '5. gemini-3.1-flash-lite', model: 'gemini-3.1-flash-lite' },
  { name: '6. 사진 768px', model: CURRENT_MODEL, small: true },
  { name: '7. 스키마 없이', model: CURRENT_MODEL, noSchema: true },
  // 아래는 속도 문제를 풀기 위한 추가 시험: 우선 처리 등급(priority)과 다른 모델
  { name: '8. 우선 처리(priority) 등급', model: CURRENT_MODEL, top: { serviceTier: 'priority' } },
  { name: '9. gemini-3.5-flash', model: 'gemini-3.5-flash' },
  { name: '10. gemini-3.6-flash', model: 'gemini-3.6-flash' },
  { name: '11. gemini-3.8-flash', model: 'gemini-3.8-flash' },
  { name: '12. gemini-3-flash-preview', model: 'gemini-3-flash-preview' },
  { name: '13. 3-flash-preview + 생각 minimal', model: 'gemini-3-flash-preview', gen: { thinkingConfig: { thinkingLevel: 'minimal' } } },
  { name: '14. 3.5-flash + 생각 minimal', model: 'gemini-3.5-flash', gen: { thinkingConfig: { thinkingLevel: 'minimal' } } },
];

const selectedVariants = () => VARIANTS.filter((v) => !ONLY || ONLY.includes(v.name.split('.')[0]));

// macOS 기본 도구(sips)로 JPEG로 바꾸면서 긴 변을 줄인다. HEIC(아이폰 사진), PNG도 받을 수 있다.
function toJpeg(path, maxSize, name) {
  const out = join(mkdtempSync(join(tmpdir(), 'bench-')), name);
  execFileSync('sips', ['-Z', String(maxSize), '--setProperty', 'format', 'jpeg', path, '--out', out], { stdio: 'ignore' });
  return out;
}

function buildBody(variant, imageBase64) {
  const generationConfig = { responseMimeType: 'application/json', temperature: 0.2, ...(variant.gen ?? {}) };
  if (!variant.noSchema) generationConfig.responseJsonSchema = RESPONSE_SCHEMA;
  return {
    ...(variant.top ?? {}),
    systemInstruction: { parts: [{ text: buildSystemPrompt(CATALOG, today) }] },
    contents: [{ role: 'user', parts: [{ text: USER_PROMPT }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] }],
    generationConfig,
  };
}

async function run(variant, imageBase64, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${variant.model}:generateContent`;
  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildBody(variant, imageBase64)),
      signal: AbortSignal.timeout(120_000),
    });
    const seconds = (performance.now() - started) / 1000;
    const text = await res.text();
    if (!res.ok) return { seconds, error: `HTTP ${res.status}: ${text.slice(0, 160).replace(/\s+/g, ' ')}` };
    const json = JSON.parse(text);
    const answer = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    const usage = json.usageMetadata ?? {};
    const parsed = typeof answer === 'string' ? parseAnalysis(answer, today) : null;
    return {
      seconds,
      prompt: usage.promptTokenCount,
      output: usage.candidatesTokenCount,
      thoughts: usage.thoughtsTokenCount ?? 0,
      valid: parsed?.ok ? `${parsed.status}${parsed.result.name ? ` (${parsed.result.name})` : ''}` : '형식 오류',
    };
  } catch (e) {
    return { seconds: (performance.now() - started) / 1000, error: String(e.message ?? e).slice(0, 160) };
  }
}

async function main() {
  if (args.includes('--dry')) {
    console.log('== 점검 모드 ==');
    console.log(`현재 모델: ${CURRENT_MODEL}, 변형 ${selectedVariants().length}개 x ${RUNS}번 = ${selectedVariants().length * RUNS}번 호출 예정`);
    for (const v of selectedVariants()) {
      const config = JSON.stringify(buildBody(v, 'AAAA').generationConfig).replace(/"responseJsonSchema":\{.*?\}\}\}/, '"responseJsonSchema":{...}');
      console.log(`- ${v.name} | ${v.model}${v.small ? ' | 사진 768px' : ''} | ${config.slice(0, 120)}`);
    }
    const sample = buildBody(VARIANTS[0], 'AAAA');
    console.log(`\n시스템 프롬프트 길이: ${sample.systemInstruction.parts[0].text.length}자 (아이콘 목록 ${CATALOG.length}개 포함)`);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const photoPath = args.find((a, i) => !a.startsWith('--') && !['--only', '--runs'].includes(args[i - 1]));
  if (!apiKey || !photoPath) {
    console.error('사용법: GEMINI_API_KEY=키 node --experimental-strip-types scripts/analysis-benchmark.mjs <음식 사진 경로>');
    console.error('예) 사진 파일을 터미널 창으로 끌어다 놓으면 경로가 입력돼요.');
    process.exit(1);
  }

  const resolvedPath = photoPath.replace(/^~(?=\/|$)/, process.env.HOME ?? '~');
  if (!existsSync(resolvedPath)) {
    console.error(`사진 파일을 찾을 수 없어요: ${resolvedPath}`);
    console.error('실제로 있는 사진의 경로를 써 주세요. 터미널 창에 사진 파일을 끌어다 놓으면 경로가 자동으로 입력돼요.');
    process.exit(1);
  }

  // 앱과 똑같이 긴 변을 1024px로 줄인 사진을 "현재" 기준으로 쓰고, 6번 변형은 768px로 줄인다
  const original = readFileSync(toJpeg(resolvedPath, 1024, 'photo-1024.jpg')).toString('base64');
  const smallBase64 = readFileSync(toJpeg(resolvedPath, 768, 'photo-768.jpg')).toString('base64');
  console.log(`사진: ${resolvedPath} (1024px ${(original.length * 0.75 / 1024).toFixed(0)}KB, 768px ${(smallBase64.length * 0.75 / 1024).toFixed(0)}KB)\n`);

  for (const variant of selectedVariants()) {
    const times = [];
    let last;
    for (let i = 0; i < RUNS; i++) {
      last = await run(variant, variant.small ? smallBase64 : original, apiKey);
      if (last.error) { console.log(`${variant.name}: ❌ ${last.error}`); break; }
      times.push(last.seconds.toFixed(1));
    }
    if (!last?.error) {
      console.log(`${variant.name.padEnd(24)} ${times.join('초, ')}초  | 입력 ${last.prompt}, 출력 ${last.output}, 생각 ${last.thoughts} 토큰 | ${last.valid}`);
    }
  }
  console.log('\n위 표를 그대로 복사해서 알려주세요. (사진 파일 자체는 보내지 않아도 돼요)');
}

main();
