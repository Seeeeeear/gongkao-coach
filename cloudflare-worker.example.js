/**
 * 可选的 Cloudflare Worker：帮前端保管 API Key。
 *
 * 什么时候需要它？
 *   你自己一个人用 → 不需要，Key 存手机浏览器里就行（更简单）。
 *   你想把网址发给别人用 → 需要。因为静态网页的代码人人可见，
 *     把 Key 写在前端等于公开送人刷你的余额。
 *
 * 部署步骤：
 *   1. Cloudflare Dashboard → Workers & Pages → Create Worker，把本文件内容粘进去
 *   2. Settings → Variables → 添加加密变量：DEEPSEEK_API_KEY = sk-你的key
 *      （想允许任意上游，再加一个 ALLOWED_HOSTS，逗号分隔）
 *   3. 部署后拿到 https://xxx.workers.dev
 *   4. 在本项目「设置」→「代理地址」里填这个地址
 *
 * 前端请求会打到 https://xxx.workers.dev/v1/chat/completions
 */

const DEFAULT_UPSTREAM = 'https://api.deepseek.com'

export default {
  async fetch(request, env) {
    // 允许自己的域名跨域调用
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    if (request.method !== 'POST') {
      return json({ error: '只支持 POST' }, 405, cors)
    }

    const key = env.DEEPSEEK_API_KEY
    if (!key) {
      return json({ error: 'Worker 没配 DEEPSEEK_API_KEY 环境变量' }, 500, cors)
    }

    // 只允许转发到白名单里的上游，避免被当成开放代理
    const allowed = (env.ALLOWED_HOSTS || 'api.deepseek.com,dashscope.aliyuncs.com,open.bigmodel.cn,api.moonshot.cn')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const reqUrl = new URL(request.url)
    const upstreamBase = env.UPSTREAM_BASE || DEFAULT_UPSTREAM
    let upstreamHost
    try {
      upstreamHost = new URL(upstreamBase).host
    } catch {
      return json({ error: 'UPSTREAM_BASE 配置不是合法地址' }, 500, cors)
    }
    if (!allowed.includes(upstreamHost)) {
      return json({ error: `上游 ${upstreamHost} 不在白名单内` }, 403, cors)
    }

    const upstream = upstreamBase.replace(/\/$/, '') + reqUrl.pathname

    try {
      const res = await fetch(upstream, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: await request.text(),
      })

      // 原样回传，但补上 CORS 头
      const out = new Response(res.body, res)
      Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v))
      return out
    } catch (e) {
      return json({ error: '转发失败：' + e.message }, 502, cors)
    }
  },
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
