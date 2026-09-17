/**
 * 运行期渲染验证 —— 比「语法能通过」硬得多的证据。
 *
 * 做什么：用 jsdom 搭一个假浏览器，真实执行 app.js，然后：
 *   1. 确认 React 真的挂载了（不是白屏）
 *   2. 逐个点击底部 5 个 tab，确认每个页面都能渲染出来、没有抛异常
 *   3. 验证「分析完自动留档」→「加入错题本复用同一条」这条主线不重复入库
 *   4. 验证触摸反馈、Toast、错因编辑器等交互
 *
 * 为什么需要：这个环境打不开真浏览器，语法检查只能证明「能编译」，
 * 证明不了「能渲染、能点、状态对」。
 *
 * 用法：node scripts/verify-render.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { IDBFactory } from 'fake-indexeddb'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(join(root, f), 'utf8')

const html = read('index.html').replace(/<script>[\s\S]*?<\/script>/g, '')
const REACT = read('vendor/react.production.min.js')
const REACT_DOM = read('vendor/react-dom.production.min.js')
const APP = read('app.js')

let failed = 0
const fail = (msg) => {
  console.error('✗ ' + msg)
  failed++
}
const ok = (msg) => console.log('✓ ' + msg)

/**
 * 起一个装了假 IndexedDB 的 jsdom，执行完整应用。
 * 每个实例用全新的 IDBFactory，互不干扰。
 */
async function boot({ records = null, settings = null } = {}) {
  const dom = new JSDOM(html, {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  })
  const w = dom.window

  // 关键：jsdom 不带 IndexedDB，应用现在依赖它，必须注入
  w.indexedDB = new IDBFactory()
  w.IDBKeyRange = (await import('fake-indexeddb')).IDBKeyRange

  w.fetch = () => Promise.reject(new Error('测试环境不发起真实请求'))
  w.confirm = () => true
  w.URL.createObjectURL = () => 'blob:test'
  w.URL.revokeObjectURL = () => {}
  // navigator.clipboard 在 jsdom 里没有，给个假的
  Object.defineProperty(w.navigator, 'clipboard', {
    value: { writeText: async () => {} },
    configurable: true,
  })

  const errors = []
  w.addEventListener('error', (e) => errors.push(e.message || String(e.error)))
  w.addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + e.reason))

  w.eval(REACT)
  w.eval(REACT_DOM)

  // 预置数据：必须在应用启动前写进 IndexedDB，否则会被 hydration 覆盖
  if (records || settings) {
    await new Promise((resolve, reject) => {
      const req = w.indexedDB.open('gongkao_coach', 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' })
          s.createIndex('updatedAt', 'updatedAt')
          s.createIndex('createdAt', 'createdAt')
          s.createIndex('saved', 'saved')
        }
      }
      req.onsuccess = () => {
        const db = req.result
        const t = db.transaction(['settings', 'records'], 'readwrite')
        if (settings) t.objectStore('settings').put(settings, 'app')
        if (records) records.forEach((r) => t.objectStore('records').put(r))
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error)
      }
      req.onerror = () => reject(req.error)
    })
  }

  w.eval(APP)

  // 等 hydration（IndexedDB 读取）完成
  await new Promise((r) => setTimeout(r, 400))

  const rootEl = w.document.getElementById('root')
  const navButtons = [...w.document.querySelectorAll('nav button')]
  const TAB_ICON = { 分析: '📷', 记录: '📋', 弱点: '📊', 技巧: '📚', 设置: '⚙️' }
  const navBtn = (name) => navButtons.find((b) => b.textContent.includes(TAB_ICON[name]))
  const allButtons = () => [...rootEl.querySelectorAll('button')]
  const clickTab = async (name) => {
    navBtn(name)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 150))
  }

  return { w, rootEl, navButtons, navBtn, allButtons, clickTab, errors }
}

/* ------------------------- 1. 基本启动与页面渲染 ------------------------- */

const app = await boot({ settings: { apiKey: 'sk-test-fake', model: 'deepseek-chat' } })
const { w, rootEl, navButtons, navBtn, allButtons, clickTab, errors } = app

if (!rootEl || rootEl.textContent.trim().length < 5) {
  fail('页面是空的（白屏）')
  console.log('root 内容：' + JSON.stringify((rootEl?.textContent || '').slice(0, 200)))
  process.exit(1)
}
ok(`React 已挂载，首页渲染出 ${rootEl.textContent.length} 个字符`)

if (navButtons.length !== 5) fail(`底部导航应有 5 个 tab，实际 ${navButtons.length} 个`)
else ok('底部导航 5 个 tab 都在')

const expectations = [
  { tab: '分析', expect: ['分析这道题', '申论批改', '示例分析'] },
  { tab: '记录', expect: ['记录', '最近分析', '还没有任何记录'] },
  { tab: '弱点', expect: ['弱点报告', '还没有数据可以分析'] },
  { tab: '技巧', expect: ['解题技巧库', '截位直除', '特征数字法'] },
  { tab: '设置', expect: ['API Key', '导出备份', '复制文字版错题本'] },
]

for (const { tab, expect } of expectations) {
  const btn = navBtn(tab)
  if (!btn) {
    fail(`找不到「${tab}」tab`)
    continue
  }
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 150))
  const text = rootEl.textContent
  const missing = expect.filter((k) => !text.includes(k))
  if (missing.length) {
    fail(`「${tab}」页缺少文案：${missing.join('、')}`)
    console.log('   [诊断] 页面文字前 200 字：' + JSON.stringify(text.slice(0, 200)))
  } else ok(`「${tab}」页渲染正常`)
}

/* ------------------------- 2. 示例分析渲染 ------------------------- */

await clickTab('分析')
const demoBtn = allButtons().find((b) => b.textContent.includes('示例分析'))
if (!demoBtn) {
  fail('找不到「示例分析」按钮')
} else {
  demoBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 250))
  const text = rootEl.textContent
  const need = ['比重变化两步法', '找部分增速', '抄进错题本', '出题人埋的坑']
  const missing = need.filter((k) => !text.includes(k))
  if (missing.length) fail('示例分析渲染不完整，缺少：' + missing.join('、'))
  else ok('示例分析完整渲染（快解步骤 / 坑 / 错题本一句话 都在）')
}

/* ------------------------- 3. 记录页两个视图 ------------------------- */

const mk = (i, { saved, status = 'wrong', types = ['stem_misread'], module = 'data' } = {}) => ({
  id: 'x' + i,
  createdAt: Date.now() - i * 1000,
  updatedAt: Date.now() - i * 1000,
  status,
  saved,
  module,
  topic: '增长率比较',
  questionText: '测试题 ' + i,
  analysis: { module, topic: '增长率比较', error_types: types, error_summary: '测试错因 ' + i },
})

const app2 = await boot({
  settings: { apiKey: 'sk-test-fake' },
  records: [
    mk(1, { saved: true }),
    mk(2, { saved: true, status: 'correct', types: ['unit_trap'] }),
    mk(3, { saved: false, types: ['stem_misread'] }),
    mk(4, { saved: false, types: ['stem_misread'] }),
    mk(5, { saved: false, types: ['stem_misread'] }),
  ],
})

await app2.clickTab('记录')
{
  const text = app2.rootEl.textContent
  if (!text.includes('错题本 2')) fail('错题本数量应为 2，页面没显示对')
  else ok('错题本视图只显示已收藏的 2 条')

  if (!text.includes('最近分析 5')) fail('最近分析数量应为 5')
  else ok('最近分析视图统计全部 5 条')

  // 切到「最近分析」，应能看到未收藏的条目以及「+ 加入错题本」按钮
  const allTab = app2
    .allButtons()
    .find((b) => b.textContent.includes('最近分析'))
  allTab?.dispatchEvent(new app2.w.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 200))

  const text2 = app2.rootEl.textContent
  if (!text2.includes('未收藏')) fail('最近分析里没有标记「未收藏」的条目')
  else ok('最近分析里正确标记了未收藏条目')

  const addBtn = app2.allButtons().find((b) => b.textContent.includes('加入错题本'))
  if (!addBtn) {
    fail('找不到「+ 加入错题本」按钮')
  } else {
    addBtn.dispatchEvent(new app2.w.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 250))
    const text3 = app2.rootEl.textContent
    if (!text3.includes('错题本 3')) fail('加入错题本后数量应变为 3')
    else ok('点「+ 加入错题本」后，错题本数量正确增加')
    if (!text3.includes('已加入错题本')) fail('加入后没有出现 Toast 提示')
    else ok('加入错题本时有 Toast 反馈')
  }
}

/* ------------- 4. 统计口径：「已掌握」不计入错因统计 ------------- */

await app2.clickTab('弱点')
{
  const text = app2.rootEl.textContent
  if (!text.includes('已掌握')) fail('弱点页没有「已掌握」统计')
  else if (text.includes('单位/量级没换')) {
    fail('「已掌握」的错因（单位/量级没换）仍被计入统计')
  } else ok('「已掌握」的错因已排除在统计之外')

  if (!text.includes('题干看错')) fail('待攻克的错因没有出现在错因分布里')
  else ok('「待攻克」的错因正常计入统计')
}

/* ------------------- 5. 详情页：错因修正 / 重做 ------------------- */

await app2.clickTab('记录')
{
  const card = app2
    .allButtons()
    .find((b) => b.textContent.includes('测试错因 1'))
  if (!card) {
    fail('找不到可点开的记录卡片')
  } else {
    card.dispatchEvent(new app2.w.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 250))

    let d = app2.rootEl.textContent
    const need = ['错因归因', '重做一遍', '遮住答案，重做这道题', '问老师']
    const missing = need.filter((k) => !d.includes(k))
    if (missing.length) fail('详情页缺少：' + missing.join('、'))
    else ok('详情页渲染正常（错因归因 / 重做 / 问老师 都在）')

    const editBtn = app2.allButtons().find((b) => b.textContent.includes('AI 判错了'))
    if (!editBtn) fail('找不到「AI 判错了？点这里改」按钮')
    else {
      editBtn.dispatchEvent(new app2.w.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
      d = app2.rootEl.textContent
      const groups = ['读题层', '计算与效率层', '心态与习惯层', '计算失误']
      const missG = groups.filter((k) => !d.includes(k))
      if (missG.length) fail('错因编辑器没渲染出分组：' + missG.join('、'))
      else ok('错因编辑器渲染正常（按分组列出全部错因）')
    }
  }
}

/* --------------- 6. 存储层：写入真的落到 IndexedDB --------------- */

{
  const ids = await new Promise((resolve) => {
    const req = app2.w.indexedDB.open('gongkao_coach', 1)
    req.onsuccess = () => {
      const db = req.result
      const t = db.transaction('records', 'readonly')
      const all = t.objectStore('records').getAll()
      all.onsuccess = () => resolve(all.result.map((r) => ({ id: r.id, saved: r.saved })))
      all.onerror = () => resolve([])
    }
    req.onerror = () => resolve([])
  })
  if (ids.length !== 5) fail(`IndexedDB 里应有 5 条记录，实际 ${ids.length} 条`)
  else ok(`IndexedDB 里确实存了 ${ids.length} 条记录（存储层真的在工作）`)

  const savedCount = ids.filter((r) => r.saved).length
  if (savedCount !== 3) fail(`IndexedDB 里 saved=true 的应有 3 条，实际 ${savedCount}`)
  else ok('收藏状态已正确写回 IndexedDB')
}

/* ------------------------- 7. 无 JS 错误 ------------------------- */

const allErrors = [...errors, ...app2.errors]
if (allErrors.length) {
  fail('渲染过程中捕获到错误：\n  - ' + allErrors.join('\n  - '))
} else ok('整个过程中没有 JS 错误')

console.log('')
if (failed) {
  console.error(`渲染验证失败：${failed} 个问题`)
  process.exit(1)
}
console.log('渲染验证全部通过 ✅')
