/**
 * 技能包 → 提示词注入的检查工具。
 *
 * 为什么要单独做这个：packToPromptText 里有 2800 字的截断。
 * 如果关键判定规则被截掉，包写得再好也白搭 —— 而渲染测试完全覆盖不到这点。
 * 这里把真正会注入给 AI 的文本打出来，并检查有没有被截断、关键规则在不在。
 *
 * 注意：这个脚本复刻了 app.jsx 里 packToPromptText 的调用方式，
 * 函数本身是从编译产物 app.js 里取的（保证和应用用同一份实现）。
 *
 * 用法：node scripts/inspect-prompts.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(join(root, f), 'utf8')

// ---- 起一个最小环境，只为了把 app.js 里的函数取出来 ----
const dom = new JSDOM(read('index.html').replace(/<script>[\s\S]*?<\/script>/g, ''), {
  url: 'http://localhost:5173/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})
const w = dom.window
w.indexedDB = new IDBFactory()
w.IDBKeyRange = IDBKeyRange
w.fetch = async () => {
  throw new Error('本检查不需要联网')
}
w.eval(read('vendor/react.production.min.js'))
w.eval(read('vendor/react-dom.production.min.js'))
w.eval(read('app.js'))
await new Promise((r) => setTimeout(r, 250))

if (typeof w.packToPromptText !== 'function') {
  console.error('✗ 取不到 packToPromptText —— 它可能被改成了 const/let（那就无法从这里检查了）')
  process.exit(1)
}

const CASES = [
  {
    file: 'general-data.json',
    label: '资料分析 · 通用速算法',
    expect: [
      '截位直除',
      '分母截 2 位',
      '分母截 3 位',
      '415',
      '假设分配',
      '比重变化',
      '平均数',
      '判定',
    ],
  },
  {
    file: 'bailu-shenlun.json',
    label: '申论 · 白鹭',
    expect: ['题干四要素', '信号词', '前置提炼', '总括句', '采分点', '未经证实', '禁止自创'],
    // 反过来查：这些顶层字段如果有内容，就**必须**出现在提示词里。
    // 写了却没被压缩逻辑带上，等于白写 —— 这种"静默丢失"最难发现。
    sections: {
      promptFragment: '本流派的批改要求',
      evidenceDiscipline: '证据分级纪律',
      shenTiSiYaoSu: '审题：题干四要素',
      keywordReading: '读材料：8 类信号词',
      logicReading: '逻辑阅读',
      qianZhiTiLian: '前置提炼',
      answerIronRules: '作答铁律',
      structuralRules: '总括句规则',
      scoring: '判分方法',
      unverifiedWarnings: '不得用作扣分理由',
    },
  },
  {
    file: 'gk-rubric.json',
    label: '申论 · 国考评分标准',
    expect: ['一类文', '二类文', '三类文', '四类文', '致命', '官方'],
    sections: {
      promptFragment: '本流派的批改要求',
      honestyNote: '关于标准的性质',
      bigEssay: '大作文分档',
      smallQuestions: '小题评分',
      expressionAndPaper: '卷面与表达',
    },
  },
]

let bad = 0

for (const c of CASES) {
  const pack = JSON.parse(read(join('skills', 'packs', c.file)))
  const text = w.packToPromptText(pack)

  console.log('\n' + '='.repeat(70))
  console.log(`【${c.label}】  注入长度 ${text.length} 字`)
  console.log('='.repeat(70))

  if (text.includes('已截断')) {
    console.log('⚠️  提示词被截断！末尾的规则会被丢弃，需要调整压缩或提高 maxChars。')
    bad++
  } else {
    console.log('✓ 未被截断，包内容完整注入')
  }

  // 空行密度检查：大量空行说明排版有问题、白烧 token
  const blankLines = (text.match(/\n\s*\n/g) || []).length
  const lineCount = text.split('\n').length
  console.log(`  行数 ${lineCount}，空行 ${blankLines}`)
  if (blankLines > lineCount * 0.45) {
    console.log('✗ 空行过多（超过 45%）—— 排版有问题，浪费 token 且结构松散')
    bad++
  }

  const missing = c.expect.filter((k) => !text.includes(k))
  if (missing.length) {
    console.log('✗ 缺少关键内容：' + missing.join('、'))
    bad++
  } else {
    console.log('✓ 关键内容都在：' + c.expect.join('、'))
  }

  // 别扭的拼接（如 "10 及以下 分"）会显得提示词粗糙，检查一下
  const awkward = ['及以下 分', '以下 分', ' 分：', '  ：', '： ——']
  const hit = awkward.filter((s) => text.includes(s))
  if (hit.length) {
    console.log('✗ 发现拼接不通顺的地方：' + hit.join(' / '))
    bad++
  } else {
    console.log('✓ 没有明显的拼接问题')
  }

  // 反向检查：包里写了内容的字段，是不是都被注入进提示词了
  if (c.sections) {
    const lost = []
    for (const [field, marker] of Object.entries(c.sections)) {
      const v = pack[field]
      if (v === undefined || v === null) continue
      // 空对象/空数组视为没写
      if (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0) continue
      if (!text.includes(marker)) lost.push(field)
    }
    if (lost.length) {
      console.log('✗ 包里有内容但没被注入（压缩逻辑漏了）：' + lost.join('、'))
      bad++
    } else {
      console.log('✓ 包里写的字段全部被注入（没有静默丢失）')
    }
  }

  console.log('\n---------- 实际注入的提示词 ----------')
  console.log(text)
}

console.log('\n' + '='.repeat(70))
if (bad) {
  console.error(`检查未通过：${bad} 个包缺关键内容`)
  process.exit(1)
}
console.log('提示词注入检查通过 ✅')
