export const config = { runtime: 'edge' };

const MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-flash-latest';

async function callGemini(model, apiKey, body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: '서버에 API 키가 설정되지 않았습니다. Vercel 환경변수 GEMINI_API_KEY를 확인하세요.' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: '요청 본문을 파싱할 수 없습니다. 이미지 크기가 너무 클 수 있습니다.' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    let { res, data } = await callGemini(MODEL, apiKey, body);

    // Auto-fallback to a different model on quota/rate-limit/overload.
    if ((res.status === 429 || res.status === 503 || res.status === 404) && FALLBACK_MODEL !== MODEL) {
      const fb = await callGemini(FALLBACK_MODEL, apiKey, body);
      if (fb.res.ok) {
        res = fb.res;
        data = fb.data;
      }
    }

    if (!res.ok) {
      // Surface upstream message verbatim so the client can show it.
      const message = data?.error?.message || `Gemini API 오류 (HTTP ${res.status})`;
      return new Response(JSON.stringify({ error: { message, status: res.status, upstream: data?.error } }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: { message: error.message || String(error) } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
