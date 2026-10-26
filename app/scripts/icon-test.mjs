// 음식 아이콘 그림체 시험: 같은 음식을 두 이미지 모델로 만들어 나란히 비교한다.
//
// 사용법 (app 폴더에서, 키는 채팅에 쓰지 말고 터미널에만 입력):
//   GEMINI_API_KEY=발급받은키 node scripts/icon-test.mjs
//   node scripts/icon-test.mjs --dry              # 요청만 점검 (키 없이, 네트워크 호출 없음)
//   GEMINI_API_KEY=... node scripts/icon-test.mjs --no-refs   # 기준 이미지 없이 생성
//   GEMINI_API_KEY=... node scripts/icon-test.mjs --model gemini-nano-banana-2.1   # 한 모델만
//
// 결과: ../design/icon-test/<모델>/<key>.png 와 ../design/icon-test/index.html (브라우저로 열어 비교)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'design', 'icon-test');

const MODELS = ['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image'];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

// 분류별 배경색 (CLAUDE.md의 "아이콘 생성" 규칙과 같다)
const BG = {
  과일: '#FFE3E3',
  채소: '#E3F7E8',
  '육류·수산': '#FFE9D6',
  '계란·유제품': '#FFF6D6',
  '가공·조리': '#EEE9FF',
  '음료·기타': '#E3F0FF',
};

// 시험할 음식 6개: 분류가 겹치지 않게, 한국 냉장고에 흔한 것으로 골랐다
const FOODS = [
  { key: 'apple', ko: '사과', en: 'apple', category: '과일' },
  { key: 'carrot', ko: '당근', en: 'carrot', category: '채소' },
  { key: 'pork', ko: '돼지고기', en: 'raw pork meat cut', category: '육류·수산' },
  { key: 'milk', ko: '우유', en: 'milk carton', category: '계란·유제품' },
  { key: 'kimchi', ko: '김치', en: 'kimchi in a small jar', category: '가공·조리' },
  { key: 'juice', ko: '주스', en: 'juice bottle', category: '음료·기타' },
];

// 그림체 기준 이미지 (우리가 이미 만든 아이콘)
const REFERENCES = [
  join(root, 'design', 'app-icon-512.png'),
  join(root, 'app', 'assets', 'images', 'default-food-icon.png'),
];

export function buildPrompt(food) {
  const bg = BG[food.category];
  return [
    `Create a cute kawaii flat-vector sticker-style icon of a single ${food.en} (a Korean grocery item, ${food.ko}).`,
    'Style rules:',
    '- One centered object only. The object has a simple smiling face: two small dark dot eyes with tiny white highlights, a small curved smile, and soft pink cheek blush.',
    '- Soft, thick, warm-gray outline (#8A8272), flat pastel fill colors with one subtle highlight, clean simple shapes.',
    '- No text, no letters, no shadows, no props, no extra objects.',
    `- The ENTIRE square canvas is filled edge to edge with one solid flat pastel background color ${bg} (no gradient, no border, no frame, no vignette).`,
    '- The object occupies about 65% of the canvas width and sits slightly above the center.',
    'Match the visual style of the reference images exactly: same face style, outline weight and flat colors.',
  ].join('\n');
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const noRefs = args.includes('--no-refs');
const modelArgIndex = args.indexOf('--model');
const models = modelArgIndex >= 0 ? [args[modelArgIndex + 1]] : MODELS;

// 응답 어디에 있든 base64 이미지 데이터를 찾아낸다 (응답 형태가 문서에 정확히 나와 있지 않아서 방어적으로 찾는다)
export function findImageData(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findImageData(item);
      if (found) return found;
    }
    return null;
  }
  const looksLikeImage =
    node.type === 'image' || (typeof node.mime_type === 'string' && node.mime_type.startsWith('image/'));
  if (looksLikeImage && typeof node.data === 'string' && node.data.length > 100) return node.data;
  const inline = node.inline_data ?? node.inlineData;
  if (inline && typeof inline.data === 'string' && inline.data.length > 100) return inline.data;
  for (const value of Object.values(node)) {
    const found = findImageData(value);
    if (found) return found;
  }
  return null;
}

// 디버그 출력에서 base64가 화면을 덮지 않게 줄인다
function shorten(value) {
  return JSON.stringify(value, (_key, v) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 40)}...(${v.length}자)` : v), 2);
}

function buildBody(model, food) {
  const input = [{ type: 'text', text: buildPrompt(food) }];
  if (!noRefs) {
    for (const path of REFERENCES) {
      input.push({ type: 'image', mime_type: 'image/png', data: readFileSync(path).toString('base64') });
    }
  }
  return {
    model,
    input,
    response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '1:1', image_size: '1K' },
  };
}

async function generate(model, food, apiKey) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(model, food)),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  const data = findImageData(json);
  if (!data) throw new Error(`응답에서 이미지를 찾지 못했어요. 응답 구조:\n${shorten(json).slice(0, 1500)}`);
  return Buffer.from(data, 'base64');
}

async function main() {
  if (dry) {
    console.log('== 점검 모드 (네트워크 호출 없음) ==');
    for (const model of models) {
      for (const food of FOODS.slice(0, 1)) {
        console.log(`\n[${model}] 요청 본문 예시 (${food.key}):\n${shorten(buildBody(model, food))}`);
      }
    }
    console.log(`\n프롬프트 전문(사과):\n${buildPrompt(FOODS[0])}`);
    console.log(`\n기준 이미지: ${noRefs ? '사용 안 함' : REFERENCES.map((p) => p.split('/').slice(-2).join('/')).join(', ')}`);
    console.log(`생성 예정: ${models.length}개 모델 x ${FOODS.length}개 음식 = ${models.length * FOODS.length}장`);
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY 환경변수가 필요해요. 예: GEMINI_API_KEY=발급받은키 node scripts/icon-test.mjs');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });
  const results = {}; // results[model][key] = 파일 경로 또는 오류
  for (const model of models) {
    mkdirSync(join(outDir, model), { recursive: true });
    results[model] = {};
    for (const food of FOODS) {
      const started = Date.now();
      try {
        const png = await generate(model, food, apiKey);
        writeFileSync(join(outDir, model, `${food.key}.png`), png);
        results[model][food.key] = { ok: true, seconds: ((Date.now() - started) / 1000).toFixed(1) };
        console.log(`✅ ${model} / ${food.key} (${results[model][food.key].seconds}초, ${(png.length / 1024).toFixed(0)}KB)`);
      } catch (e) {
        results[model][food.key] = { ok: false, error: String(e.message ?? e) };
        console.log(`❌ ${model} / ${food.key}: ${String(e.message ?? e).split('\n')[0]}`);
        // 첫 실패의 자세한 내용은 한 번만 보여준다 (원인 파악용)
        if (Object.values(results[model]).filter((r) => !r.ok).length === 1) console.log(String(e.message ?? e));
      }
    }
  }

  // 나란히 비교하는 HTML
  const rows = FOODS.map((food) => {
    const cells = models
      .map((model) => {
        const r = results[model][food.key];
        return r?.ok
          ? `<td><img src="${model}/${food.key}.png" width="220" height="220" style="border-radius:50%"><div>${r.seconds}초</div></td>`
          : `<td style="color:#c33">실패</td>`;
      })
      .join('');
    return `<tr><th>${food.ko}<br><small>${food.category}</small></th>${cells}</tr>`;
  }).join('\n');
  writeFileSync(
    join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>아이콘 그림체 시험</title>
<style>body{font-family:sans-serif;padding:24px}td,th{padding:12px;text-align:center}table{border-collapse:collapse}</style>
<h2>아이콘 그림체 시험 (동그랗게 잘라서 표시)</h2>
<table><tr><th></th>${models.map((m) => `<th>${m}</th>`).join('')}</tr>
${rows}</table>`,
  );
  console.log(`\n완료: ${join(outDir, 'index.html')} 를 브라우저로 열어 비교해 보세요.`);
}

main();
