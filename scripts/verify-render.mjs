/**
 * 运行期渲染验证 —— 比"语法能通过"更硬的证据。
 *
 * 做什么：用 jsdom 搭一个假浏览器，真实执行 app.js，然后：
 *   1. 确认 React 真的挂载了（不是白屏）
 *   2. 逐个点击底部 5 个 tab，确认每个页面都能渲染出来、没有抛异常
 *   3. 点开一条示例分析，确认详情组件不炸
 *
 * 为什么需要：这个环境打不开真浏览器，语法检查只能证明"能编译"，
 * 证明不了"能渲染"。这个脚本能抓出 undefined 组件、hook 用法错误之类的问题。
 *
 * 用法：node scripts/verify-render.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(join(root, f), 'utf8')

const html = read('index.html')
  // 去掉 Service Worker 注册和 CDN 回退，jsdom 里不需要
  .replace(/<script>[\s\S]*?<\/script>/g, '')
  .replace(/<script src="\.\/app\.js"><\/script>/, '')

const dom = new JSDOM(html, {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
})

const { window } = dom
let failed = 0
const fail = (msg) => {
  console.error('✗ ' + msg)
  failed++
}
const ok = (msg) => console.log('✓ ' + msg)

// jsdom 没有 fetch / matchMedia，补上最小实现
window.fetch = () => Promise.reject(new Error('测试环境不发起真实请求'))
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }))
window.confirm = () => true

// 关键：预置一个假 API Key。
// 否则应用检测到没配 Key 会自动跳到「设置」页，导致后面点 tab 其实没切过去，
// 验证会变成假阳性（检查的是设置页的文案）。
window.localStorage.setItem('gk_settings_v1', JSON.stringify({ apiKey: 'sk-test-fake', model: 'deepseek-chat' }))

const errors = []
window.addEventListener('error', (e) => errors.push(e.message || String(e.error)))
window.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + e.reason))

// 真实执行 React 与应用代码
try {
  window.eval(read('vendor/react.production.min.js'))
  window.eval(read('vendor/react-dom.production.min.js'))
} catch (e) {
  fail('React 运行库加载失败：' + e.message)
  process.exit(1)
}
ok('React / ReactDOM 运行库加载成功')

if (!window.React || !window.ReactDOM) fail('React 全局对象没挂上（vendor 文件可能有问题）')
else ok('React 全局对象正常')

try {
  window.eval(read('app.js'))
} catch (e) {
  fail('app.js 执行抛异常：' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n'))
  process.exit(1)
}
ok('app.js 执行无异常')

// React 18 的 render 是异步的，等一拍
await new Promise((r) => setTimeout(r, 300))

const $ = (sel) => window.document.querySelector(sel)
const rootEl = window.document.getElementById('root')

if (!rootEl || rootEl.textContent.trim().length < 5) {
  fail('页面是空的（白屏）—— React 没有渲染出内容')
  console.log('root 内容：' + JSON.stringify((rootEl?.textContent || '').slice(0, 200)))
  process.exit(1)
}
ok(`React 已挂载，首页渲染出 ${rootEl.textContent.length} 个字符`)

// 底部导航：5 个 tab
const navButtons = [...window.document.querySelectorAll('nav button')]
if (navButtons.length !== 5) fail(`底部导航应有 5 个 tab，实际 ${navButtons.length} 个`)
else ok('底部导航 5 个 tab 都在')

// 注意：必须靠图标精确定位导航按钮。
// 用 textContent.includes('弱点') 会误匹配到页面里的「弱点报告」标题，
// 那样测试就点错了元素，还会产生假阳性。
const TAB_ICON = { 分析: '📷', 错题: '📋', 弱点: '📊', 技巧: '📚', 设置: '⚙️' }
const navBtn = (name) => navButtons.find((b) => b.textContent.includes(TAB_ICON[name]))

const expectations = [
  { tab: '分析', expect: ['分析这道题', '申论批改', '示例分析'] },
  { tab: '错题', expect: ['错题本'] },
  { tab: '弱点', expect: ['弱点报告', '还没有数据可以分析'] },
  { tab: '技巧', expect: ['解题技巧库', '截位直除', '特征数字法'] },
  { tab: '设置', expect: ['API Key', '导出备份', '在手机上使用', '通义千问', '测试能否读图'] },
]

for (const { tab, expect } of expectations) {
  const btn = navBtn(tab)
  if (!btn) {
    fail(`找不到「${tab}」tab`)
    continue
  }
  try {
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  } catch (e) {
    fail(`点击「${tab}」抛异常：${e.message}`)
    continue
  }
  await new Promise((r) => setTimeout(r, 120))
  const text = rootEl.textContent
  const missing = expect.filter((w) => !text.includes(w))
  if (missing.length) {
    fail(`「${tab}」页缺少文案：${missing.join('、')}`)
    console.log('   [诊断] 当前页面文字前 300 字：' + JSON.stringify(text.slice(0, 300)))
    console.log(
      '   [诊断] 导航按钮文案：' + navButtons.map((b) => JSON.stringify(b.textContent)).join(', '),
    )
  } else ok(`「${tab}」页渲染正常`)
}

// 点「示例分析」，验证分析结果那一大坨组件能渲染
const captureBtn = navBtn('分析')
captureBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((r) => setTimeout(r, 120))
const demoBtn = [...window.document.querySelectorAll('button')].find((b) =>
  b.textContent.includes('示例分析'),
)
if (!demoBtn) {
  fail('找不到「示例分析」按钮')
} else {
  demoBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 200))
  const text = rootEl.textContent
  const need = ['比重变化两步法', '找部分增速', '抄进错题本', '存入错题本', '出题人埋的坑']
  const missing = need.filter((w) => !text.includes(w))
  if (missing.length) fail('示例分析渲染不完整，缺少：' + missing.join('、'))
  else ok('示例分析完整渲染（快解步骤 / 坑 / 错题本一句话 都在）')
}

if (errors.length) {
  fail('渲染过程中捕获到错误：\n  - ' + errors.join('\n  - '))
} else {
  ok('整个过程中没有 JS 错误')
}

/* ---------- 载入示例数据，验证统计与条形图渲染 ---------- */
const weaknessBtn = navBtn('弱点')
weaknessBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
await new Promise((r) => setTimeout(r, 150))

const loadDemo = [...window.document.querySelectorAll('button')].find((b) =>
  b.textContent.includes('先用示例数据'),
)
if (!loadDemo) {
  fail('弱点页空状态缺少「先用示例数据」按钮')
} else {
  loadDemo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 250))
  const text = rootEl.textContent
  const need = ['错因分布', '模块分布', '近 7 天录入量', '高频考点', '题干看错', '单位/量级没换']
  const missing = need.filter((w) => !text.includes(w))
  if (missing.length) fail('示例数据载入后统计页渲染不完整，缺少：' + missing.join('、'))
  else ok('弱点报告渲染正常（错因分布 / 模块分布 / 7 天趋势 都在）')

  // 记录页应出现 18 条示例记录
  const recordsBtn = navBtn('错题')
  recordsBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 200))
  const rtext = rootEl.textContent
  if (!rtext.includes('共 18 条记录')) {
    const m = rtext.match(/共 (\d+) 条记录/)
    fail(`错题本应有 18 条示例记录，实际：${m ? m[1] : '没渲染出记录数'}`)
  } else {
    ok('错题本载入 18 条示例记录，列表渲染正常')
  }

  /* ---------- 打开一条记录，验证详情页的三个关键交互 ---------- */
  // 点列表里第一条记录的卡片（卡片标题是考点名，这里挑业务文案定位）
  const firstCardBtn = [...rootEl.querySelectorAll('button')].find((b) =>
    b.textContent.includes('凭感觉判断比重升降'),
  )
  if (!firstCardBtn) {
    fail('错题列表里找不到可点开的记录卡片')
  } else {
    firstCardBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 200))

    let dtext = rootEl.textContent
    const needDetail = ['错因归因', '重做一遍', '遮住答案，重做这道题', '问老师']
    const missDetail = needDetail.filter((w) => !dtext.includes(w))
    if (missDetail.length) fail('详情页缺少：' + missDetail.join('、'))
    else ok('详情页渲染正常（错因归因 / 重做 / 问老师 都在）')

    // 1) 错因修正入口
    const editBtn = [...rootEl.querySelectorAll('button')].find((b) =>
      b.textContent.includes('AI 判错了'),
    )
    if (!editBtn) {
      fail('详情页找不到「AI 判错了？点这里改」按钮')
    } else {
      editBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 150))
      dtext = rootEl.textContent
      const needGroups = ['读题层', '计算与效率层', '心态与习惯层', '计算失误']
      const missGroups = needGroups.filter((w) => !dtext.includes(w))
      if (missGroups.length) fail('错因编辑器没渲染出分组：' + missGroups.join('、'))
      else ok('错因编辑器渲染正常（按分组列出全部错因）')
    }

    // 2) 重做流程：遮住答案 → 选项 → 选一个 → 记录结果
    const redoBtn = [...rootEl.querySelectorAll('button')].find((b) =>
      b.textContent.includes('遮住答案'),
    )
    if (!redoBtn) {
      fail('详情页找不到「遮住答案，重做这道题」按钮')
    } else {
      redoBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
      dtext = rootEl.textContent
      if (!dtext.includes('这道题没有存下选项')) {
        // 示例记录没存选项，走的是"自评"分支，这里确认提示文案出来了
        fail('重做界面没有走预期的无选项分支')
      } else {
        ok('重做界面正常（示例记录无选项时给出自评提示）')
      }
    }
  }

  /* ---------- 验证「已掌握」不计入错因统计 ---------- */
  // 注意：这里必须重新加载整个应用（改 localStorage 不会让 React 的 state 变化），
  // 所以单独开一个 jsdom，预置「已掌握 + 待攻克」混合数据来看统计口径。
  await verifyMasteredExcluded()
}

/**
 * 第二个 jsdom 实例：预置 5 条记录（2 条已掌握、3 条待攻克），
 * 确认「已掌握」不会继续计入错因统计 —— 治好的毛病不该永远挂在弱点报告上。
 */
async function verifyMasteredExcluded() {
  const mk = (i, status, errTypes) => ({
    id: 'x' + i,
    createdAt: Date.now() - i * 1000,
    status,
    module: 'data',
    topic: '增长率比较',
    questionText: '测试题 ' + i,
    analysis: { module: 'data', topic: '增长率比较', error_types: errTypes, error_summary: '测试' },
  })

  const dom2 = new JSDOM(html, {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  })
  const w2 = dom2.window
  w2.fetch = () => Promise.reject(new Error('测试环境不发起真实请求'))
  w2.confirm = () => true
  w2.localStorage.setItem('gk_settings_v1', JSON.stringify({ apiKey: 'sk-test-fake' }))
  w2.localStorage.setItem(
    'gk_records_v1',
    JSON.stringify([
      mk(1, 'correct', ['unit_trap']), // 已掌握：不该计入
      mk(2, 'correct', ['unit_trap']), // 已掌握：不该计入
      mk(3, 'wrong', ['stem_misread']),
      mk(4, 'wrong', ['stem_misread']),
      mk(5, 'wrong', ['stem_misread']),
    ]),
  )

  w2.eval(read('vendor/react.production.min.js'))
  w2.eval(read('vendor/react-dom.production.min.js'))
  w2.eval(read('app.js'))
  await new Promise((r) => setTimeout(r, 300))

  const root2 = w2.document.getElementById('root')
  const tabs2 = [...w2.document.querySelectorAll('nav button')]
  const btn = tabs2.find((b) => b.textContent.includes('📊'))
  if (!btn) {
    fail('第二个实例里找不到弱点 tab')
    return
  }
  btn.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 250))

  const text = root2.textContent

  // 统计卡片上应显示 已掌握 2 / 待攻克 3
  if (!text.includes('已掌握')) {
    fail('弱点页没有「已掌握」统计卡片')
    return
  }

  // 关键：unit_trap 只出现在已掌握的那两条里，所以不该出现在错因分布里；
  // stem_misread 出现在 3 条待攻克里，必须出现且计数为 3。
  const okStem = text.includes('题干看错')
  const badUnit = text.includes('单位/量级没换')

  if (badUnit) fail('「已掌握」的错因（单位/量级没换）仍然被计入统计 —— 统计口径漏了过滤')
  else ok('「已掌握」的错因已被排除在统计之外')

  if (!okStem) fail('待攻克的错因（题干看错）没有出现在错因分布里')
  else ok('「待攻克」的错因正常计入统计')

  if (!text.includes('题干看错 · 3') && !/题干看错\s*3/.test(text)) {
    // 条形图里的计数格式可能是 "3 · 100%"，这里宽松判断
    if (!text.includes('100%')) fail('错因计数或占比不对（3 条待攻克应占 100%）')
    else ok('错因占比按待攻克题数计算（100%）')
  }
}

console.log('')
if (failed) {
  console.error(`渲染验证失败：${failed} 个问题`)
  process.exit(1)
}
console.log('渲染验证全部通过 ✅')
