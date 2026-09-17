/**
 * 把运行库从 node_modules 复制到 vendor/，让项目不依赖国外 CDN。
 * 鸿蒙浏览器 / 国内网络访问 unpkg、jsdelivr 都可能很慢或失败，本地副本更稳。
 *
 * 注意：这里只复制浏览器真正需要的 React / ReactDOM。
 * Babel 只在开发时（scripts/build.mjs）用，不进 vendor —— 它有 3MB，别拖慢手机加载。
 *
 * 用法：node scripts/vendor.mjs
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'vendor')
mkdirSync(out, { recursive: true })

const files = [
  ['node_modules/react/umd/react.production.min.js', 'react.production.min.js'],
  ['node_modules/react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js'],
]

let ok = 0
for (const [src, name] of files) {
  const from = join(root, src)
  if (!existsSync(from)) {
    console.warn(`跳过（不存在）：${src}  → 请先跑 npm install --ignore-scripts`)
    continue
  }
  copyFileSync(from, join(out, name))
  console.log(`已复制 vendor/${name}`)
  ok++
}
console.log(`\n完成 ${ok}/${files.length}`)
