/**
 * 把 app.jsx 预编译成 app.js。
 *
 * 为什么需要它：免构建方案原本让浏览器用 Babel 现场编译 JSX，
 * 但 Babel standalone 有 3MB，手机上每次打开都要下载，太慢。
 * 这里在开发时用同一份 Babel 把 JSX 编译成普通 JS（87KB），
 * 浏览器直接跑，不再需要 Babel，手机首次加载从 3MB 降到约 250KB。
 *
 * 不用放弃「免构建」的好处：产物 app.js 一并提交到仓库，
 * 部署到 Cloudflare Pages / GitHub Pages 依然是纯静态文件，线上不跑任何构建。
 *
 * 用法：
 *   node scripts/build.mjs            编译一次
 *   node scripts/build.mjs --watch    改 app.jsx 自动重编译
 */
import { readFileSync, writeFileSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'app.jsx')
const OUT = join(root, 'app.js')

const Babel = require('@babel/standalone')

function compile({ quiet = false } = {}) {
  let code
  try {
    code = readFileSync(SRC, 'utf8')
  } catch (e) {
    console.error('✗ 读不到 app.jsx：' + e.message)
    return false
  }

  try {
    const out = Babel.transform(code, {
      presets: [['react', { runtime: 'classic' }]], // 生成 React.createElement，配合 UMD React
      filename: 'app.jsx',
      sourceType: 'script', // 普通脚本，不是 ES module
      compact: false,
      comments: true,
    })

    const banner = `/* 本文件由 scripts/build.mjs 从 app.jsx 自动生成，请勿直接修改。
 * 改代码请改 app.jsx，然后运行：node scripts/build.mjs
 * 生成时间：${new Date().toLocaleString('zh-CN')}
 */\n`

    writeFileSync(OUT, banner + out.code, 'utf8')
    if (!quiet) {
      const kb = (out.code.length / 1024).toFixed(1)
      console.log(`✓ 已生成 app.js（${kb} KB）`)
    }
    return true
  } catch (e) {
    console.error('✗ app.jsx 有语法错误：\n' + e.message)
    return false
  }
}

if (process.argv.includes('--watch')) {
  compile()
  console.log('👀 监听 app.jsx 变化中…（Ctrl+C 退出）')
  let timer = null
  watch(SRC, () => {
    clearTimeout(timer)
    timer = setTimeout(() => compile(), 150)
  })
} else {
  process.exit(compile() ? 0 : 1)
}
