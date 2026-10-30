import { onRequestPost } from './api/aicha.js';

interface Env {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/** On Cloudflare Workers: only /api goes through this code, everything else is served as static files. */
export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const { pathname } = new URL(request.url);
    if (pathname !== '/api/aicha') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    return onRequestPost({ request, env });
  },
};
