// React Native에는 WebCrypto(`crypto`)가 없어서, Supabase PKCE 로그인이
//  - 코드 검증값을 Math.random으로 만들고
//  - code challenge를 SHA-256이 아닌 plain으로 보내는
// 약한 방식으로 동작한다. expo-crypto로 필요한 부분만 채워 넣는다.
import { digest, getRandomValues, randomUUID } from 'expo-crypto';

type MinimalCrypto = {
  getRandomValues?: typeof getRandomValues;
  randomUUID?: typeof randomUUID;
  subtle?: {
    digest: (algorithm: string | { name: string }, data: BufferSource) => Promise<ArrayBuffer>;
  };
};

const target = globalThis as unknown as { crypto?: MinimalCrypto };

if (!target.crypto) target.crypto = {};
const webCrypto = target.crypto;

if (!webCrypto.getRandomValues) webCrypto.getRandomValues = getRandomValues;
if (!webCrypto.randomUUID) webCrypto.randomUUID = randomUUID;
if (!webCrypto.subtle) {
  webCrypto.subtle = {
    // expo-crypto의 알고리즘 이름("SHA-256" 등)은 WebCrypto와 같은 문자열이다.
    digest: (algorithm, data) =>
      digest((typeof algorithm === 'string' ? algorithm : algorithm.name) as Parameters<typeof digest>[0], data),
  };
}
