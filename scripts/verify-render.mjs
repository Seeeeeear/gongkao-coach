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
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

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
  w.IDBKeyRange = IDBKeyRange

  /**
   * fetch 垫片。
   * 应用会 fetch('./skills/packs/xxx.json') 加载方法流派包，
   * 这里把这些请求指向本地真实文件 —— 测的是真实加载路径。
   * 其他请求一律抛错，避免测试误发真实网络请求。
   */
  const packHits = []
  w.fetch = async (url) => {
    const u = String(url)
    const m = u.match(/skills\/(.+\.json)$/)
    if (m) {
      packHits.push(m[1])
      try {
        const text = readFileSync(join(root, 'skills', m[1]), 'utf8')
        return { ok: true, status: 200, json: async () => JSON.parse(text) }
      } catch {
        return { ok: false, status: 404, json: async () => ({}) }
      }
    }
    throw new Error('测试环境不发起真实请求：' + u)
  }

  w.confirm = () => true
  w.URL.createObjectURL = () => 'blob:test'
  w.URL.revokeObjectURL = () => {}

  /**
   * canvas / Image 垫片。
   * jsdom 不带 canvas（getContext 返回 null、没有 toDataURL），
   * 而裁剪流程靠它出图。这里给一个最小实现，让"裁剪接线是否正确"
   * 可以被验证 —— 注意这**测不出真实裁剪效果**，只能测流程通不通。
   */
  w.HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: '#fff',
      fillRect() {},
      drawImage() {},
    }
  }
  w.HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/jpeg;base64,CROPPED'
  }
  // 让 new Image() 立刻 onload，并带一个假的尺寸
  Object.defineProperty(w, 'Image', {
    configurable: true,
    value: class FakeImage {
      constructor() {
        this.width = 1200
        this.height = 1600
        this.onload = null
        this.onerror = null
      }
      set src(v) {
        this._src = v
        setTimeout(() => this.onload && this.onload(), 0)
      }
      get src() {
        return this._src
      }
    },
  })
  // FileReader 也需要能吐出 dataURL
  Object.defineProperty(w, 'FileReader', {
    configurable: true,
    value: class FakeFileReader {
      readAsDataURL() {
        setTimeout(() => {
          this.result = 'data:image/jpeg;base64,RAW'
          this.onload && this.onload()
        }, 0)
      }
    },
  })
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
      // 版本要和 app.jsx 里的 DB_VERSION 一致，否则应用会再触发一次 upgrade
      const req = w.indexedDB.open('gongkao_coach', 2)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' })
          s.createIndex('updatedAt', 'updatedAt')
          s.createIndex('createdAt', 'createdAt')
          s.createIndex('saved', 'saved')
        }
        if (!db.objectStoreNames.contains('skills')) db.createObjectStore('skills')
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
  const TAB_ICON = { 分析: '📷', 记录: '📋', 弱点: '📊', 技巧: '📚', 设置: '⚙️' }
  const allButtons = () => [...rootEl.querySelectorAll('button')]

  /**
   * 每次都重新查询导航按钮。
   * 不能缓存启动时抓到的那批引用 —— 导航栏会随状态重新挂载，
   * 旧引用会失效，点了没反应（这个坑真的踩过一次）。
   */
  const navBtn = (name) => {
    const nav = w.document.querySelector('nav')
    if (!nav) return null
    return [...nav.querySelectorAll('button')].find((b) => b.textContent.includes(TAB_ICON[name]))
  }
  const navButtons = () =>
    w.document.querySelector('nav') ? [...w.document.querySelector('nav').querySelectorAll('button')] : []

  const clickTab = async (name) => {
    navBtn(name)?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 150))
  }

  return { w, rootEl, navButtons, navBtn, allButtons, clickTab, errors, packHits }
}

/* ------------------------- 1. 基本启动与页面渲染 ------------------------- */

const app = await boot({ settings: { apiKey: 'sk-test-fake', model: 'deepseek-chat' } })
const { w, rootEl, navButtons, navBtn, allButtons, clickTab, errors, packHits } = app

if (!rootEl || rootEl.textContent.trim().length < 5) {
  fail('页面是空的（白屏）')
  console.log('root 内容：' + JSON.stringify((rootEl?.textContent || '').slice(0, 200)))
  process.exit(1)
}
ok(`React 已挂载，首页渲染出 ${rootEl.textContent.length} 个字符`)

const tabs0 = navButtons()
if (tabs0.length !== 5) fail(`底部导航应有 5 个 tab，实际 ${tabs0.length} 个`)
else ok('底部导航 5 个 tab 都在')

const expectations = [
  { tab: '分析', expect: ['分析这道题', '申论批改', '示例分析', '方法流派'] },
  { tab: '记录', expect: ['记录', '最近分析', '还没有任何记录'] },
  { tab: '弱点', expect: ['弱点报告', '还没有数据可以分析'] },
  { tab: '技巧', expect: ['解题技巧库', '截位直除', '特征数字法'] },
  { tab: '设置', expect: ['API Key', '导出备份', '复制文字版错题本', 'huyuhan@aust.edu.cn'] },
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

/* ------------------- 1.5 方法流派（技能包）系统 ------------------- */

await clickTab('分析')
{
  // 资料分析模块默认应出现流派选择器
  const text = rootEl.textContent
  const need = ['方法流派', '通用', '通用速算法']
  const missing = need.filter((k) => !text.includes(k))
  if (missing.length) fail('分析页的方法流派选择器缺少：' + missing.join('、'))
  else ok('分析页出现方法流派选择器（资料分析模块有「通用速算法」）')

  // 选中通用速算法 → 应触发技能包 fetch
  const packBtn = allButtons().find((b) => b.textContent.trim() === '通用速算法')
  if (!packBtn) {
    fail('找不到「通用速算法」流派按钮')
  } else {
    packBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 200))
    const t2 = rootEl.textContent
    if (!t2.includes('资料分析通用速算体系')) {
      fail('选中流派后没有显示该流派的说明')
    } else {
      ok('选中流派后显示来源与许可信息')
    }
  }

  // 切到没有流派包的模块，应给出说明而不是空白
  const logicBtn = allButtons().find((b) => b.textContent.trim() === '判断推理')
  if (logicBtn) {
    logicBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 200))
    if (!rootEl.textContent.includes('暂时没有方法流派包')) {
      fail('切到无流派模块时没有给出说明')
    } else {
      ok('无流派模块显示「暂时没有方法流派包」说明（不做无用 UI）')
    }
  }
}

/* ---------- 1.6 拍题：不能强制进系统相册（用户反馈的痛点） ---------- */

{
  await clickTab('分析')
  // 切回资料分析，保证在拍题模式
  const dataBtn = allButtons().find((b) => b.textContent.trim() === '资料分析')
  dataBtn?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 150))

  const fileInputs = [...rootEl.querySelectorAll('input[type="file"]')]
  if (!fileInputs.length) {
    fail('分析页找不到文件选择框')
  } else {
    // 关键：带 capture 属性会强制调起相机并把照片存进系统相册，
    // 而网页无权删除相册照片 —— 会把用户相册搞乱。
    const withCapture = fileInputs.filter((i) => i.hasAttribute('capture'))
    if (withCapture.length) {
      fail(
        `文件选择框带 capture 属性（${withCapture.length} 个）—— 会导致照片被塞进系统相册`,
      )
    } else {
      ok('文件选择框没有强制调相机（照片不会自动进系统相册）')
    }

    const acceptsImage = fileInputs.some((i) => (i.getAttribute('accept') || '').includes('image'))
    if (!acceptsImage) fail('文件选择框没有限定图片类型')
    else ok('文件选择框限定为图片')
  }

  const cropHint = rootEl.textContent
  if (!cropHint.includes('拍完会让你框出这道题')) {
    fail('拍题入口没有提示"拍完要裁剪"')
  } else {
    ok('拍题入口提示了裁剪步骤')
  }

  /* ---- 走一遍完整裁剪流程 ---- */

  const input = fileInputs[0]
  const fakeFile = { name: 'q.jpg', type: 'image/jpeg', size: 123456 }
  Object.defineProperty(input, 'files', { value: [fakeFile], configurable: true })
  input.dispatchEvent(new w.Event('change', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 250))

  let t = rootEl.textContent
  if (!t.includes('框出你要分析的那道题')) {
    fail('选图后没有进入裁剪界面')
  } else {
    ok('选图后进入裁剪界面')

    // 给裁剪容器一个固定的显示区域，才能换算指针坐标。
    // 直接改 Element 原型 —— jsdom 默认返回全 0，
    // 若只改单个元素，某些情况下（元素被重渲染替换）会失效。
    const origRect = w.Element.prototype.getBoundingClientRect
    w.Element.prototype.getBoundingClientRect = function () {
      if (this.style && String(this.style.touchAction) === 'none') {
        return { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON() {} }
      }
      return origRect ? origRect.call(this) : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }
    }

    const cropBox = rootEl.querySelector('[style*="touch-action"]')
    if (!cropBox) {
      fail('裁剪界面里找不到可拖拽的图片容器')
    } else {
      const fireP = (type, x, y) => {
        let ev
        try {
          ev = new w.PointerEvent(type, { bubbles: true, clientX: x, clientY: y })
        } catch {
          ev = new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
        }
        cropBox.dispatchEvent(ev)
      }

      // 框选 50%×50%（从 0,0 拖到 100,100，容器 200×200）
      fireP('pointerdown', 0, 0)
      await new Promise((r) => setTimeout(r, 120))
      fireP('pointermove', 100, 100)
      await new Promise((r) => setTimeout(r, 120))
      fireP('pointerup', 100, 100)
      await new Promise((r) => setTimeout(r, 400))

      t = rootEl.textContent
      if (!t.includes('已选')) {
        fail('拖动后没有显示选框（裁剪交互没生效）')
        console.log('   [诊断] 拖动后页面文字前 220 字：' + JSON.stringify(t.slice(0, 220)))
        console.log(
          '   [诊断] 容器上绑定的事件类型：' +
            JSON.stringify(Object.keys(cropBox).filter((k) => k.startsWith('on'))).slice(0, 200),
        )
        console.log(
          '   [诊断] 容器 tagName/class：' +
            cropBox.tagName +
            ' / ' +
            (cropBox.className || '(无 class)'),
        )
      } else {
        ok('拖动可以框选（显示实时比例）')

        if (!t.includes('重新框选')) fail('框选后没有"重新框选"按钮')
        else ok('框选后出现「重新框选」按钮')

        const okBtn = allButtons().find((b) => b.textContent.includes('就用这块'))
        if (!okBtn) {
          fail('找不到"就用这块，开始分析"按钮')
        } else {
          okBtn.click()
          await new Promise((r) => setTimeout(r, 300))
          t = rootEl.textContent
          if (!t.includes('已裁剪')) {
            fail('确认裁剪后没有标记为「已裁剪」')
          } else {
            ok('确认裁剪后回到预览，并标记「✂️ 已裁剪」')
          }
          // 裁剪出来的应该不是原图（说明确实走了裁剪分支）
          const shownImg = rootEl.querySelector('img[alt="题目"]')
          const src = shownImg?.getAttribute('src') || ''
          if (!src.includes('CROPPED')) {
            fail('确认裁剪后展示的不是裁剪结果：' + src.slice(0, 40))
          } else {
            ok('展示的是裁剪后的图（不是原图）')
          }
        }
      }
    }
  }
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
  const need = [
    '比重变化两步法',
    '找部分增速',
    '抄进错题本',
    '出题人埋的坑',
    // 这轮新增的两层结构
    '先看什么',
    '这题在求',
    '为什么想到用这招',
    '这类题的通用骨架',
    '比重变化判断',
    '什么时候套它',
    '常见变体',
  ]
  const missing = need.filter((k) => !text.includes(k))
  if (missing.length) fail('示例分析渲染不完整，缺少：' + missing.join('、'))
  else ok('示例分析完整渲染（含新增的"为什么想到用这招"与"母题"两层）')
}

/* ---------- 2.5 字段缺失时不能崩（模型常漏字段） ---------- */

{
  // 直接往应用里塞一个"残缺"的分析结果，看界面会不会炸。
  // 这是真实风险：模型偶尔不返回 reading / thinking_path / pattern。
  const rich = {
    id: 'partial1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'wrong',
    saved: true,
    module: 'data',
    topic: '增长率比较',
    questionText: '残缺测试题',
    // 故意不提供 reading / thinking_path / pattern
    analysis: {
      module: 'data',
      topic: '增长率比较',
      error_types: ['stem_misread'],
      error_summary: '测试缺字段',
      fast_solution: { name: '测试快解', steps: ['一步'] },
    },
  }

  const appP = await boot({ settings: { apiKey: 'sk-test-fake' }, records: [rich] })
  await appP.clickTab('记录')
  const card = appP.allButtons().find((b) => b.textContent.includes('测试缺字段'))
  if (!card) {
    fail('找不到残缺记录卡片')
  } else {
    card.dispatchEvent(new appP.w.MouseEvent('click', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 300))
    const t = appP.rootEl.textContent
    if (t.includes('页面出错了')) {
      fail('缺少 reading/thinking_path/pattern 时详情页崩了（模型真会漏字段）')
      console.log('   [诊断] ' + JSON.stringify(t.slice(0, 200)))
    } else if (!t.includes('测试快解')) {
      fail('残缺记录详情页没有正常渲染出已有内容')
    } else {
      ok('分析结果缺少新字段时不崩（缺什么就不显示什么）')
    }
  }
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
    const req = app2.w.indexedDB.open('gongkao_coach', 2)
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

/* -------------- 6.5 技能包缓存真的落盘到 IndexedDB -------------- */

{
  const cached = await new Promise((resolve) => {
    const req = app2.w.indexedDB.open('gongkao_coach', 2)
    req.onsuccess = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('skills')) return resolve(null)
      const t = db.transaction('skills', 'readonly')
      const all = t.objectStore('skills').getAllKeys()
      all.onsuccess = () => resolve(all.result)
      all.onerror = () => resolve(null)
    }
    req.onerror = () => resolve(null)
  })
  // 技能包是"选中流派并分析"时才加载的；这里没跑真实分析，
  // 所以只验证 store 建出来了（加载路径由 6.6 的申论页覆盖）
  if (cached === null) fail('IndexedDB 里没有 skills store（v2 升级没生效）')
  else ok('IndexedDB 的 skills store 已建好（可缓存方法流派包）')
}

/* -------------- 6.6 申论批改页（干净实例，排除前面步骤干扰） -------------- */

{
  // 为什么单开实例：前面几步操作过详情页/记录页，复用会分不清
  // "点不开"是应用问题还是残留状态问题。
  const app3 = await boot({ settings: { apiKey: 'sk-test-fake' } })
  // boot 时已把 key 写进 IndexedDB；这里主动切到分析页，
  // 不受「没配 Key 时自动跳设置页」的影响
  await app3.clickTab('分析')
  const cands = app3.allButtons().filter((b) => b.textContent.includes('申论'))
  const btn = cands.find((b) => b.textContent.trim() === '申论批改') || cands[0]
  if (!btn) {
    fail('干净实例里找不到「申论批改」入口')
  } else {
    btn.click()
    await new Promise((r) => setTimeout(r, 350))

    const t = app3.rootEl.textContent
    const need = ['题目类型', '本题满分', '白鹭申论', '国考评分标准']
    const missing = need.filter((k) => !t.includes(k))
    if (missing.length) {
      fail('申论批改页缺少：' + missing.join('、'))
      console.log('   [诊断] 干净实例点击后内容前 250 字：' + JSON.stringify(t.slice(0, 250)))
      console.log('   [诊断] select 数量：' + app3.rootEl.querySelectorAll('select').length)
    } else {
      ok('申论批改页渲染正常（题型 / 满分 / 流派 / 评分标尺）')
    }

    const sels = [...app3.rootEl.querySelectorAll('select')]
    if (sels.length < 2) {
      fail(`申论页应有 2 个下拉框（题型、满分），实际 ${sels.length} 个`)
    } else {
      sels[0].value = '归纳概括'
      sels[0].dispatchEvent(new app3.w.Event('change', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 250))
      const sels2 = [...app3.rootEl.querySelectorAll('select')]
      if (sels2[1] && sels2[1].value !== '20') {
        fail(`切到归纳概括后满分应自动变为 20，实际 ${sels2[1].value}`)
      } else {
        ok('切题型时满分默认值自动跟随（大作文 40 / 小题 20）')
      }
      // 大作文满分选项里必须有 35 和 40 —— 国考常见分值
      sels2[0].value = '大作文'
      sels2[0].dispatchEvent(new app3.w.Event('change', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 250))
      const opts = [...([...app3.rootEl.querySelectorAll('select')][1]?.options || [])].map(
        (o) => o.value,
      )
      if (!opts.includes('40') || !opts.includes('35')) {
        fail('大作文满分选项里缺少 35 / 40：' + opts.join(','))
      } else {
        ok('满分选项包含国考大作文常见分值（35 / 40）')
      }
    }
  }
}

/* -------- 6.8 题图清理规则：已收藏永久保留，未收藏只留最近 100 张 -------- */

{
  // pruneUnsavedImages 是函数声明，eval 后可在全局取到
  if (typeof app2.w.pruneUnsavedImages !== 'function') {
    fail('取不到 pruneUnsavedImages（可能被改成了 const/let）')
  } else {
    const mkRec = (i, savedFlag) => ({
      id: 'img' + i,
      createdAt: 1000 + i, // 递增，i 越大越新
      saved: savedFlag,
      module: 'data',
      image: 'data:image/jpeg;base64,AAAA',
      analysis: { module: 'data', error_types: [] },
    })

    // 105 条未收藏 + 3 条已收藏。未收藏里最旧的是 img0..img4
    const recs = []
    for (let i = 0; i < 105; i++) recs.push(mkRec(i, false))
    recs.push(mkRec(1001, true))
    recs.push(mkRec(1002, true))
    recs.push(mkRec(1003, true))

    const dropped = await app2.w.pruneUnsavedImages(recs, 100)

    if (dropped !== 5) fail(`应清掉 5 张未收藏的题图，实际 ${dropped} 张`)
    else ok('未收藏的题图按"只留最近 100 张"清理（清掉 5 张）')

    // 已收藏的三条必须一张都没被清
    const savedStillHasImage = recs.filter((r) => r.saved).every((r) => Boolean(r.image))
    if (!savedStillHasImage) fail('已收藏的题图被清掉了 —— 违反"收藏后永久保留"规则')
    else ok('已收藏的题图完全没被清理（符合你定的规则）')

    // 留下的是最新那批：img5..img104 应该有图，img0..img4 应该被清
    const oldestCleared = [0, 1, 2, 3, 4].every((i) => recs[i].image === null)
    const newestKept = [5, 104].every((i) => Boolean(recs[i].image))
    if (!oldestCleared) fail('最旧的未收藏题图没有被清理（清理顺序不对）')
    else if (!newestKept) fail('最新的未收藏题图被误清')
    else ok('清理顺序正确：清最旧的，留最新的')
  }
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
