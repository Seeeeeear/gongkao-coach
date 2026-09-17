/**
 * 免构建项目的语法校验：用 Babel standalone 把 app.jsx 编译成 JS。
 * 免构建路线没有编译器兜底，所以每次改完都跑一遍这个，能抓出语法错误。
 * 用法：node scripts/check.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let Babel
try {
  Babel = require('@babel/standalone')
} catch {
  console.error('找不到 @babel/standalone，先跑：npm install --ignore-scripts')
  process.exit(1)
}

const targets = ['app.jsx']
let failed = 0

for (const rel of targets) {
  const file = join(root, rel)
  let code
  try {
    code = readFileSync(file, 'utf8')
  } catch {
    console.error(`✗ 读不到 ${rel}`)
    failed++
    continue
  }
  try {
    const out = Babel.transform(code, {
      presets: [['react', { runtime: 'classic' }]],
      filename: rel,
      sourceType: 'script',
    })
    const kb = (out.code.length / 1024).toFixed(0)
    console.log(`✓ ${rel} 语法通过（编译后约 ${kb} KB）`)
  } catch (e) {
    failed++
    console.error(`✗ ${rel} 有语法错误：\n${e.message}`)
  }
}

process.exit(failed ? 1 : 0)
