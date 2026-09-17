/**
 * Service Worker —— 让 App 能离线打开（已在手机上打开过一次后即可）。
 *
 * 策略：
 *   - 应用外壳（HTML/CSS/JS/React）用 cache-first，秒开、断网可用
 *   - 版本号变了就清掉旧缓存（改完代码记得更新 VERSION）
 *
 * 注意：华为鸿蒙自带浏览器对 Service Worker 支持不完整（官方论坛有反馈），
 * 所以单题分析、申论批改这些需要联网的功能在鸿蒙上仍依赖网络，这是正常的。
 */

const VERSION = 'v2'
const CACHE = `gk-coach-${VERSION}`

// 应用外壳：首次安装时全部预缓存，之后离线也能启动
const SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // 某个资源没缓存上不应该让整个安装失败
        console.warn('[sw] 预缓存部分失败', err)
        return self.skipWaiting()
      }),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // 只处理自家静态资源的 GET；AI 接口请求一律直连网络，绝不缓存
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // 网络优先拿最新代码，失败时回退缓存 —— 避免你更新了代码却还在跑旧版
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit
          // 导航请求离线时回退到首页，避免白屏
          if (req.mode === 'navigate') return caches.match('./index.html')
          return new Response('离线且无缓存', { status: 503, statusText: 'Offline' })
        }),
      ),
  )
})

// 页面可以发消息让新版本立即生效
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
