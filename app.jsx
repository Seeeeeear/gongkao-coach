/* ============================================================================
 * 考公做题分析器 —— 免构建单文件应用
 *
 * 为什么是一个大文件？因为它不经过打包器，浏览器用 Babel 直接编译 JSX。
 * 多文件 + ES import 在 Babel standalone 下会重复执行模块（React 实例会分裂），
 * 所以这里刻意做成单文件、零 import。
 *
 * 结构（用注释分段，Ctrl+F 搜索这些标题可跳转）：
 *   §1 错因体系       §2 解题技巧库     §3 本地存储
 *   §4 AI 调用        §5 通用组件       §6 分析页
 *   §7 记录页         §8 详情页         §9 弱点报告
 *   §10 技巧页        §11 设置页        §12 应用外壳
 * ==========================================================================*/

const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } = React

/* ==========================================================================
 * §1 错因体系 —— 产品的核心资产
 * 每条错因都必须「可行动」：不只贴标签，还给出下次怎么防。
 * ========================================================================*/

const ERROR_TYPES = {
  stem_misread: {
    name: '题干看错',
    short: '看错问法',
    desc: '问"不正确"看成"正确"、问"同比"看成"环比"、问"多多少"看成"是多少"。',
    typical: '问"以下哪项不能推出"，选了能推出的。',
    fix: '圈出题干最后一句的问法再动笔算，做完回读一遍问法。',
  },
  unit_trap: {
    name: '单位/量级没换',
    short: '单位量级',
    desc: '亿元与万元混用、百分号与千分号、万人与人的换算。',
    typical: '材料给"亿元"，选项问"万元"，答案差 10000 倍。',
    fix: '算完先看量级；选项之间差 10 倍以上的，先怀疑单位。',
  },
  data_mislocate: {
    name: '找错数据',
    short: '找错数据',
    desc: '材料里指标名近似，或行列看串了，取了相近的另一个数。',
    typical: '把"限额以上"看成"限额以下"，或取了邻行的数。',
    fix: '用笔尖点住数字再读，指标名一个字一个字对。',
  },
  concept_gap: {
    name: '概念不清',
    short: '概念不清',
    desc: '公式或定义记混：增长率与增长量、比重与比例、平均数的增长率…',
    typical: '把"比重的变化"当成"比重"来算。',
    fix: '进技巧库把该概念的定义与公式重抄一遍，配 3 道同类题。',
  },
  formula_wrong: {
    name: '公式用错',
    short: '公式用错',
    desc: '概念其实懂，但选错公式或套错场景。',
    typical: '求平均数增长率时用了比重变化公式。',
    fix: '按"已知什么 → 求什么"两栏列出来，先去技巧库对公式再算。',
  },
  calc_error: {
    name: '计算失误',
    short: '计算失误',
    desc: '方法对、思路对，纯算错：退位、进位、除法粗心。',
    typical: '截位方向搞反，或加减时没对齐数位。',
    fix: '强制截位直除 + 量级校验（结果的数量级是否合理）。',
  },
  method_slow: {
    name: '方法笨/超时',
    short: '方法超时',
    desc: '硬算能做对，但耗时远超该题型应有时间，性价比崩了。',
    typical: '资料分析一题算了 3 分钟，挤掉后面 5 道题。',
    fix: '查技巧库该题型的速算套路，练成固定动作（如先看选项差距）。',
  },
  logic_flaw: {
    name: '推理/论证漏洞',
    short: '推理漏洞',
    desc: '偷换概念、以偏概全、因果倒置、样本不具代表性等没识别出来。',
    typical: '把"相关"当"因果"，同类坑又踩一次。',
    fix: '背会 8 类论证漏洞的识别特征，做题先找结论再找论据。',
  },
  option_trap: {
    name: '掉进选项陷阱',
    short: '选项陷阱',
    desc: '绝对化表述、无中生有、偷换主体、答非所问等选项设计。',
    typical: '选项把"部分"改成"全部"，没注意就选了。',
    fix: '每个选项回原文找依据，找不到依据的直接排除。',
  },
  careless: {
    name: '粗心手快',
    short: '粗心',
    desc: '涂错卡、抄错数、漏看条件。不是不会，是太快。',
    typical: '草稿纸上算的是 B，涂卡涂成 C。',
    fix: '每 10 题停 5 秒回看涂卡；草稿纸按题号分段写。',
  },
  time_panic: {
    name: '时间恐慌瞎选',
    short: '时间恐慌',
    desc: '最后几分钟来不及，连蒙带猜，正确率断崖下跌。',
    typical: '最后 10 题全蒙 C。',
    fix: '给每个模块设硬性时间上限，超时立即跳走，绝不拖到最后。',
  },
  skipped: {
    name: '不会/放弃',
    short: '不会',
    desc: '知识点确实空白，不是失误。',
    typical: '没见过这个考点。',
    fix: '归入知识点补漏清单，安排专项突破，别算成"粗心"。',
  },
  other: { name: '其他原因', short: '其他', desc: '上面都不符合，自己在备注里补充。', typical: '', fix: '' },
}

const ERROR_GROUPS = [
  { title: '读题层（最该先治）', keys: ['stem_misread', 'unit_trap', 'data_mislocate'] },
  { title: '知识层', keys: ['concept_gap', 'formula_wrong', 'skipped'] },
  { title: '计算与效率层', keys: ['calc_error', 'method_slow'] },
  { title: '判断层', keys: ['logic_flaw', 'option_trap'] },
  { title: '心态与习惯层', keys: ['careless', 'time_panic'] },
  { title: '其他', keys: ['other'] },
]

const MODULES = [
  { key: 'data', name: '资料分析', chip: 'text-blue-700 bg-blue-50 border-blue-200', bar: 'bg-blue-500' },
  { key: 'math', name: '数量关系', chip: 'text-purple-700 bg-purple-50 border-purple-200', bar: 'bg-purple-500' },
  { key: 'logic', name: '判断推理', chip: 'text-emerald-700 bg-emerald-50 border-emerald-200', bar: 'bg-emerald-500' },
  { key: 'verbal', name: '言语理解', chip: 'text-amber-700 bg-amber-50 border-amber-200', bar: 'bg-amber-500' },
  { key: 'common', name: '常识判断', chip: 'text-rose-700 bg-rose-50 border-rose-200', bar: 'bg-rose-500' },
  { key: 'essay', name: '申论', chip: 'text-cyan-700 bg-cyan-50 border-cyan-200', bar: 'bg-cyan-500' },
  { key: 'other', name: '其他', chip: 'text-slate-700 bg-slate-100 border-slate-200', bar: 'bg-slate-400' },
]

const errorName = (k) => ERROR_TYPES[k]?.name || '未归类'
const moduleOf = (k) => MODULES.find((m) => m.key === k) || MODULES[6]

/* ==========================================================================
 * §2 解题技巧库（出厂预置，用户可增删）
 * 组织方式：什么时候用 → 怎么做 → 注意什么
 * ========================================================================*/

const BUILTIN_TIPS = [
  {
    id: 't_jiewei',
    module: 'data',
    title: '截位直除（资料分析第一基本功）',
    when: '所有除法型计算：增长率、比重、平均数、倍数',
    how: [
      '看选项差距决定截几位：选项首位不同→分母截 2 位；前两位不同→截 3 位；差距 <2%→老实算',
      '分子不动或只简单取整，只截分母',
      '截分母统一方向：都截小或都截大，避免误差叠加',
    ],
    caution: '选项之间只差 1% 时不要截位，改用量级估算或直接精算。',
  },
  {
    id: 't_tezheng',
    module: 'data',
    title: '特征数字法（把百分数变成好算的分数）',
    when: '出现 12.5%、16.7%、33.3%、6.25% 这类"眼熟"的百分数',
    how: [
      '12.5%=1/8，16.7%≈1/6，33.3%≈1/3，6.25%=1/16，14.3%≈1/7，11.1%≈1/9',
      '替换成分数后，乘除立刻变成整数运算',
      '例：6400×12.5% = 6400÷8 = 800',
    ],
    caution: '改分数会有误差，选项接近时慎用。',
  },
  {
    id: 't_zengzhangliang',
    module: 'data',
    title: '增长量比较：先看现期量，再看增长率',
    when: '"增长最多/最少的是"这类比较题',
    how: [
      '增长量 = 现期量 ÷ (1+增长率) × 增长率',
      '两项增长率接近时，直接比现期量大小（倍数悬殊时最快）',
      '增长率相差大（如 5% vs 40%）时，改用"现期量×增长率"粗比',
    ],
    caution: '不要拿基期量去比，材料给什么用什么。',
  },
  {
    id: 't_bizhongbi',
    module: 'data',
    title: '比重变化：先判升降，再定范围',
    when: '"比重比上年上升/下降几个百分点"',
    how: [
      '升降看增速：部分增速 a > 整体增速 b → 比重上升；a < b → 下降',
      '变化幅度一定小于 |a − b|',
      '结合选项直接排除，多数题不用精算',
    ],
    caution: '比重变化要用"百分点"表述，不能和"%"混。',
  },
  {
    id: 't_pingjunshu',
    module: 'data',
    title: '平均数的增长率',
    when: '"人均收入同比增长了百分之几"',
    how: [
      '平均数增长率 = (1+总量增速) ÷ (1+份数增速) − 1',
      '两者增速都很小（<10%）时，近似等于 总量增速 − 份数增速',
      '分子分母别搞反：总量在上、份数在下',
    ],
    caution: '两个增速都很大（>20%）时不能用近似，必须精算。',
  },
  {
    id: 't_ziliao_order',
    module: 'data',
    title: '资料分析做题顺序（省时间的关键）',
    when: '整套资料分析',
    how: [
      '先用 20 秒扫材料结构（时间、指标、单位），不读数字',
      '先做"直接读数"和"简单比较"的题，难的最后做',
      '每题设 90 秒上限，超时先标记跳过',
      '先看选项再算：差距大就估算，差距小才精算',
    ],
    caution: '不要从头到尾按顺序硬做，也不要读完材料才开始答题。',
  },
  {
    id: 't_weishu',
    module: 'math',
    title: '尾数法 / 末两位法',
    when: '加减法精确求值，且选项末位不同',
    how: ['只算最后一位（或两位）', '直接与选项末位比对，唯一即答案'],
    caution: '有进位/借位时要连着后两位一起算。',
  },
  {
    id: 't_tezhifa',
    module: 'math',
    title: '特值法（赋值法）',
    when: '题目全是比例、百分数、倍数关系，没有具体数值',
    how: [
      '给总量赋一个方便的值（常取 100、12、最小公倍数）',
      '按条件算出所求，再看选项是否为定值',
      '工程问题取"时间的最小公倍数"当总工程量，效率立刻变整数',
    ],
    caution: '题目若给了真实具体量，就不能随便赋特值。',
  },
  {
    id: 't_daipai',
    module: 'math',
    title: '代入排除法',
    when: '多位数问题、年龄问题、不定方程、选项信息完整',
    how: [
      '从最"好算"的选项开始代，不必从 A 开始',
      '能一步排除多个选项的条件优先用',
      '问"最大/最小"时从边界项开始代',
    ],
    caution: '必须代全部条件，不能只满足一个就选。',
  },
  {
    id: 't_lunzheng',
    module: 'logic',
    title: '论证题三步走',
    when: '加强 / 削弱型逻辑判断',
    how: [
      '找结论：通常在"因此/可见/说明"之后',
      '找论据与结论之间的"跳跃概念"',
      '答案一定在建立或切断这个跳跃，其余都是无关项',
    ],
    caution: '"加强"选最直接的，不要选"间接支持""部分支持"。',
  },
  {
    id: 't_zhuti',
    module: 'verbal',
    title: '片段阅读：主题词 + 行文脉络',
    when: '主旨概括、意图判断',
    how: [
      '先扫高频名词确定主题词，选项没有主题词直接排除',
      '看结构：总-分（重点在总）、分-总（重点在尾句）、转折（重点在转折后）',
      '两个选项都对时选更全面、更贴主旨的，不选只覆盖局部的',
    ],
    caution: '不要用常识去补原文没说的内容。',
  },
  {
    id: 't_tika',
    module: 'other',
    title: '考场时间分配（通用）',
    when: '整套行测模考',
    how: [
      '资料分析放在体力最好的阶段做，不要留到最后',
      '数量关系只做最容易的 3-5 题，其余统一蒙同一个选项',
      '每模块设硬上限，到点立刻换模块，绝不恋战',
      '留 5 分钟专门涂卡和检查涂错',
    ],
    caution: '顺序要按自己的模考数据定，别照搬别人的时间表。',
  },
]

/* ==========================================================================
 * §3 本地存储 —— 全部存在浏览器，不上云
 * ========================================================================*/

const K_SETTINGS = 'gk_settings_v1'
const K_RECORDS = 'gk_records_v1'
const K_TIPS = 'gk_tips_v1'

const DEFAULT_SETTINGS = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  proxyUrl: '',
  defaultModule: 'data',
  // 读图的模型单独配置：DeepSeek 目前不支持图片输入，
  // 想用「拍照识题」就得另外接一家支持视觉的模型（文字分析仍走上面那家）。
  visionApiKey: '',
  visionBaseUrl: '',
  visionModel: '',
}

/** 常见支持读图的模型预设，点一下就把地址和模型名填好，省得自己查文档 */
const VISION_PRESETS = [
  { name: '通义千问 VL（阿里云百炼）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', model: 'qwen-vl-max' },
  { name: '智谱 GLM-4V', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-flash' },
  { name: '月之暗面 Kimi（moonshot-v1-8k-vision-preview）', baseUrl: 'https://api.moonshot.cn', model: 'moonshot-v1-8k-vision-preview' },
  { name: 'OpenAI GPT-4o mini', baseUrl: 'https://api.openai.com', model: 'gpt-4o-mini' },
  { name: '就用 DeepSeek（注意：不支持读图）', baseUrl: '', model: '' },
]

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('本地存储写入失败（可能已满）', e)
  }
}

function computeStats(records) {
  const total = records.length
  const byError = {}
  const byModule = {}
  const byTopic = {}

  // 重做做对的题算「已掌握」：仍然留在错题本里可以复查，
  // 但不再计入错因统计 —— 否则治好的病会一直挂在弱点报告上，看着永远没进步。
  const active = records.filter((r) => r.status !== 'correct')
  const mastered = total - active.length
  const activeCount = active.length

  active.forEach((r) => {
    const m = r.module || 'other'
    byModule[m] = (byModule[m] || 0) + 1
    const a = r.analysis
    if (!a) return
    const list = Array.isArray(a.error_types) ? a.error_types : []
    list.forEach((t) => {
      byError[t] = (byError[t] || 0) + 1
    })
    const topic = a.topic || r.topic
    if (topic && topic !== '无') byTopic[topic] = (byTopic[topic] || 0) + 1
  })

  const errorRanking = Object.entries(byError)
    .map(([key, count]) => ({ key, count, pct: activeCount ? Math.round((count / activeCount) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)

  const topicRanking = Object.entries(byTopic)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const start = d.getTime()
    days.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: records.filter((r) => r.createdAt >= start && r.createdAt < start + 86400000).length,
    })
  }

  return {
    total,
    activeCount,
    mastered,
    masteredPct: total ? Math.round((mastered / total) * 100) : 0,
    byModule,
    errorRanking,
    topicRanking,
    days,
  }
}

function statsToText(stats) {
  const errLines = stats.errorRanking
    .slice(0, 10)
    .map((e) => `- ${errorName(e.key)}：${e.count} 次（占全部错题 ${e.pct}%）`)
    .join('\n')
  const topics = stats.topicRanking
    .slice(0, 12)
    .map((t) => `${t.key}(${t.count})`)
    .join('、')
  const mods = Object.entries(stats.byModule)
    .map(([k, v]) => `${moduleOf(k).name}(${v})`)
    .join('、')
  return `累计录入 ${stats.total} 题，其中已掌握 ${stats.mastered} 题，待攻克 ${stats.activeCount} 题。\n模块分布（仅统计未掌握的）：${mods || '无'}\n错因统计（仅统计未掌握的）：\n${errLines || '（暂无）'}\n高频考点：${topics || '（暂无）'}`
}

/* ==========================================================================
 * §4 AI 调用
 * ========================================================================*/

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function endpoint(settings) {
  if (settings.proxyUrl) return settings.proxyUrl.replace(/\/$/, '') + '/v1/chat/completions'
  return (settings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '') + '/v1/chat/completions'
}

function parseModelJson(text) {
  let t = String(text).trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s >= 0 && e > s) t = t.slice(s, e + 1)
  try {
    return JSON.parse(t)
  } catch {
    throw new Error('AI 返回的不是有效格式，点「重试」通常就好了')
  }
}

async function callChat(settings, messages, opts = {}) {
  const { model, temperature = 0.2, maxTokens = 2500, json = true, retries = 2 } = opts

  // 允许整段覆盖「地址 + Key + 模型」：读图的模型往往是另一家的
  const target = opts.target || {}
  const eff = {
    proxyUrl: target.proxyUrl ?? settings.proxyUrl,
    baseUrl: target.baseUrl || settings.baseUrl,
    apiKey: target.apiKey ?? settings.apiKey,
    model: model || target.model || settings.model || 'deepseek-chat',
  }
  const useProxy = Boolean(eff.proxyUrl)
  if (!useProxy && !eff.apiKey) throw new Error('还没填 API Key，去「设置」里填一下')

  const body = {
    model: eff.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }
  if (json) body.response_format = { type: 'json_object' }

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 120000)
    try {
      const res = await fetch(endpoint(eff), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useProxy ? {} : { Authorization: 'Bearer ' + eff.apiKey }),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        if (res.status === 401) throw new Error('API Key 无效或已过期，请到「设置」重新填写')
        if (res.status === 402) throw new Error('账户余额不足，请去 DeepSeek 充值')
        if (res.status === 404) throw new Error('接口地址或模型名不对，检查「设置」里的 Base URL 和模型名')
        if (res.status === 400) {
          const low = txt.toLowerCase()
          if (low.includes('image') || low.includes('vision') || low.includes('图片')) {
            throw new Error(
              '当前模型不支持读图。请到「设置」把「看图模型」换成支持视觉的模型，或改用「粘贴文字」模式。',
            )
          }
          throw new Error(`请求被拒绝（400）：${txt.slice(0, 180)}`)
        }
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`服务繁忙（${res.status}），已自动重试`)
          await sleep(1200 * (attempt + 1))
          continue
        }
        throw new Error(`请求失败 ${res.status}：${txt.slice(0, 180)}`)
      }

      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      if (!content) throw new Error('模型没有返回内容')
      return content
    } catch (e) {
      clearTimeout(timer)
      if (e.name === 'AbortError') {
        lastErr = new Error('请求超时，检查网络后重试')
        continue
      }
      if (/API Key|余额|接口地址/.test(e.message || '')) throw e
      lastErr = e
      await sleep(800 * (attempt + 1))
    }
  }
  throw lastErr || new Error('请求失败')
}

const ERROR_MENU = Object.entries(ERROR_TYPES)
  .map(([k, v]) => `- ${k}（${v.name}）：${v.desc}`)
  .join('\n')

const QUESTION_SYSTEM = `你是一位带过 10 年公考行测的名师，擅长两件事：一是把题讲得比答案书更快，二是精准指出学生的错误到底属于哪一类。

【最高原则】
1. 讲"怎么最快做出来"，而不是把标准答案复述一遍。
2. 严格区分错误类型：是读题问题、方法问题、计算问题，还是根本不会。不要把"概念不清"说成"粗心"。
3. 说人话，短句，能直接抄进笔记本。禁止"要认真审题""加强练习"这类空话。

【可选的错因标签】（只能从下面挑，可多选，key 必须原样返回）
${ERROR_MENU}

【判断错因的方法】
- 学生选项与正确答案接近、或选了形近干扰项 → 优先 stem_misread / data_mislocate / option_trap
- 选项之间差 10 倍、100 倍量级 → 优先 unit_trap
- 思路对但数字错 → calc_error
- 做对了但方法很笨 → method_slow
- 完全没有相关知识 → concept_gap 或 skipped
- 做得又对又快 → error_types 返回空数组

【输出格式】只返回一个 JSON 对象，不要任何解释文字：
{
  "module": "data|math|logic|verbal|common|other",
  "topic": "考点名，如 增长率比较 / 图形推理-数量类",
  "question_text": "整理后的完整题干（可读、保留必要数字与选项）",
  "options": ["A. ...", "B. ..."],
  "correct_answer": "A",
  "user_answer": "B（题干没给就填 null）",
  "is_correct": false,
  "error_types": ["stem_misread"],
  "error_summary": "一句话说清这道题为什么错（不超过 30 字）",
  "fast_solution": {
    "name": "快解方法名，如 截位直除 / 特征数字法",
    "why_fast": "为什么这个方法快（一句话）",
    "steps": ["第一步", "第二步", "第三步"],
    "seconds": 40
  },
  "normal_solution": { "steps": ["常规解法的关键步骤"], "seconds": 120 },
  "key_points": ["这道题真正考的能力点"],
  "traps": ["出题人埋的坑 / 干扰项设计"],
  "similar_tip": "下次遇到同类题的固定动作（必须可执行）",
  "note_card": "可以抄进错题本的一句话总结"
}

注意：图片可能含多道题或无关内容，只分析最主要那一题；图片不清晰时在 question_text 里说明并尽量还原。`

const ESSAY_SYSTEM = `你是资深公考申论阅卷人兼作文批改老师。点评要像真阅卷人：先给分，再说哪里丢分，最后给能直接用的改法。

【评分纪律】
- 小题看：要点是否齐全、是否踩到采分点、表述是否简洁规范。
- 大作文看：立意是否准确、结构是否完整、论证是否有力、语言是否规范。
- 分数必须给依据，不要凭空给高分或安慰分。多数考生大作文在二类下到三类上，这是正常的，不要动不动给 40+。

【输出格式】只返回 JSON：
{
  "essay_type": "归纳概括|综合分析|提出对策|贯彻执行|大作文",
  "score": 18,
  "score_full": 20,
  "grade": "一类文|二类文|三类文|四类文（大作文）；小题可用 优/良/中/差",
  "dimension_scores": [
    { "name": "立意与观点", "score": 12, "full": 15, "comment": "一句话" },
    { "name": "结构与逻辑", "score": 10, "full": 15, "comment": "一句话" },
    { "name": "论证与素材", "score": 8, "full": 15, "comment": "一句话" },
    { "name": "语言与规范", "score": 9, "full": 15, "comment": "一句话" }
  ],
  "missing_points": ["该写但你没写的采分点"],
  "point_hits": ["你已经踩到的采分点"],
  "line_comments": [ { "quote": "你原答案里的一句话", "problem": "问题在哪", "better": "改成什么（给出改写后的句子）" } ],
  "structure_advice": "整体结构怎么调（可执行）",
  "top_fixes": ["最该先改的 3 件事，按优先级排"],
  "rewrite_sample": "挑一段（开头或一个分论点）示范改写，200 字左右",
  "note_card": "这道题的方法论总结，一句话"
}

line_comments 至少 3 条且必须引用学生原话；原文太短就给到能给的条数。`

/**
 * 读图请求的配置。
 * 如果用户单独配了看图模型（常见于 DeepSeek 用户 —— DeepSeek 不能读图），
 * 就用那一家的地址和 Key；没配则退回主模型配置。
 */
function visionTarget(settings) {
  if (!settings.visionModel && !settings.visionBaseUrl) return null
  return {
    baseUrl: settings.visionBaseUrl || settings.baseUrl,
    apiKey: settings.visionApiKey || settings.apiKey,
    model: settings.visionModel || '',
  }
}

async function aiAnalyzeQuestion(settings, { image, questionText, module, userAnswer, correctAnswer, userNote }) {
  const hints = []
  if (module) hints.push(`学生自认为属于模块：${moduleOf(module).name}`)
  if (userAnswer) hints.push(`学生选的答案：${userAnswer}`)
  if (correctAnswer) hints.push(`正确答案：${correctAnswer}`)
  if (userNote) hints.push(`学生的自我描述：${userNote}`)

  let userContent
  if (image) {
    userContent = [
      { type: 'image_url', image_url: { url: image } },
      { type: 'text', text: `请分析照片里这道题。${hints.length ? '\n' + hints.join('\n') : ''}` },
    ]
  } else {
    userContent = `请分析下面这道题。\n\n${hints.length ? hints.join('\n') + '\n\n' : ''}【题目】\n${questionText}`
  }

  const content = await callChat(
    settings,
    [
      { role: 'system', content: QUESTION_SYSTEM },
      { role: 'user', content: userContent },
    ],
    {
      model: image ? settings.visionModel || settings.model : settings.model,
      target: image ? visionTarget(settings) : null,
      maxTokens: 2600,
    },
  )
  const data = parseModelJson(content)
  data.error_types = Array.isArray(data.error_types) ? data.error_types.filter((k) => ERROR_TYPES[k]) : []
  if (!data.fast_solution) data.fast_solution = { name: '', why_fast: '', steps: [], seconds: 0 }
  if (!Array.isArray(data.fast_solution.steps)) data.fast_solution.steps = []
  return data
}

async function aiAnalyzeEssay(settings, { image, question, answer, reference }) {
  const parts = []
  if (question) parts.push(`【题目要求】\n${question}`)
  if (reference) parts.push(`【参考答案/评分标准】\n${reference}`)
  if (answer) parts.push(`【我的作答】\n${answer}`)

  let userContent
  if (image) {
    userContent = [
      { type: 'image_url', image_url: { url: image } },
      { type: 'text', text: `请批改我上传的申论作答（图片）。${parts.length ? '\n' + parts.join('\n\n') : ''}` },
    ]
  } else {
    userContent = `请批改下面的申论作答。\n\n${parts.join('\n\n')}`
  }

  const content = await callChat(
    settings,
    [
      { role: 'system', content: ESSAY_SYSTEM },
      { role: 'user', content: userContent },
    ],
    {
      model: image ? settings.visionModel || settings.model : settings.model,
      target: image ? visionTarget(settings) : null,
      maxTokens: 3200,
    },
  )
  return parseModelJson(content)
}

async function aiWeaknessReport(settings, { statsText, goal }) {
  const content = await callChat(
    settings,
    [
      {
        role: 'system',
        content: `你是公考行测提分教练。基于学生的错题统计给出冷静、具体、可执行的阶段诊断。只返回 JSON：
{
  "headline": "一句话结论，指出最致命的那个问题",
  "main_problems": [
    { "problem": "问题描述", "evidence": "用统计数字支撑", "impact": "对分数的影响", "action": "接下来 3 天的具体动作" }
  ],
  "priority_order": ["先治什么，再治什么，说明理由"],
  "time_allocation": [{ "module": "模块名", "percent": 40, "reason": "为什么" }],
  "warnings": ["需要警惕的提分陷阱"],
  "this_week_plan": ["周一…","周二…","周三…","周四…","周五…","周六…","周日…"],
  "encouragement": "基于数据的一句真实评价，不要空泛打鸡血"
}
main_problems 最多 3 条，每条必须引用统计数字。this_week_plan 必须给满 7 条。`,
      },
      { role: 'user', content: `【错题统计】\n${statsText}\n\n【我的目标】${goal || '未填写'}` },
    ],
    { maxTokens: 2400, temperature: 0.4 },
  )
  return parseModelJson(content)
}

/** 追问：带上下文继续问老师 */
async function aiAsk(settings, { analysis, questionText, history, question }) {
  const ctx = `【题目】\n${questionText || analysis?.question_text || ''}\n\n【已给出的分析】\n${
    analysis?.fast_solution?.steps?.join(' → ') || ''
  }\n正确答案：${analysis?.correct_answer || '未知'}\n考点：${analysis?.topic || ''}`
  const msgs = [
    {
      role: 'system',
      content:
        '你是公考行测答疑老师。回答要短、要具体、直接给结论和步骤，不要客套。如果学生问的是同类题技巧，给出可套用的固定动作。用中文。',
    },
    { role: 'user', content: ctx },
    ...(history || []).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: question },
  ]
  return callChat(settings, msgs, { json: false, maxTokens: 1200, temperature: 0.3 })
}

/** 手机原图动辄 4-8MB，压到长边 1600px / JPEG 0.82，题干依然清晰 */
function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/* ==========================================================================
 * §5 示例数据 —— 不配 API Key 也能看到分析长什么样
 * 用途：① 新用户先看效果，决定值不值得用 ② 开发者调界面时不用烧 token
 * ========================================================================*/

const DEMO_ANALYSIS = {
  module: 'data',
  topic: '增长率比较',
  question_text:
    '2019 年某市高新技术产业产值为 1250 亿元，同比增长 8.2%；规模以上工业总产值为 8600 亿元，同比增长 5.6%。问：高新技术产业产值占规模以上工业总产值的比重，与上年相比约：',
  options: ['A. 上升 0.4 个百分点', 'B. 上升 4 个百分点', 'C. 下降 0.4 个百分点', 'D. 下降 3 个百分点'],
  correct_answer: 'A',
  user_answer: 'D',
  is_correct: false,
  error_types: ['concept_gap', 'method_slow'],
  error_summary: '凭感觉判断比重升降，没有用"部分增速与整体增速比大小"这个固定动作',
  fast_solution: {
    name: '比重变化两步法（先判升降，再定范围）',
    why_fast: '不用算比重，比一个大小、卡一个范围就能选出来',
    steps: [
      '找部分增速 a = 8.2%（高新技术产业），整体增速 b = 5.6%（规模以上工业）',
      'a > b → 比重上升，直接排除 C、D 两个"下降"选项',
      '变化幅度一定小于 |a − b| = 2.6 个百分点，排除 B（4 个百分点）',
      '只剩 A，选它',
    ],
    seconds: 30,
  },
  normal_solution: {
    steps: [
      '算今年比重：1250 ÷ 8600 ≈ 14.53%',
      '算去年产值：1250 ÷ 1.082 ≈ 1155.3，8600 ÷ 1.056 ≈ 8144.0',
      '算去年比重：1155.3 ÷ 8144.0 ≈ 14.19%',
      '两者相减：14.53% − 14.19% ≈ 0.34 个百分点',
    ],
    seconds: 150,
  },
  key_points: ['比重变化的判断逻辑（部分增速 vs 整体增速）', '变化幅度小于增速之差的边界意识', '"百分点"与"%"的区别'],
  traps: [
    '选项里同时放"上升"和"下降"，考你有没有先判方向',
    'B 选项（4 个百分点）是给"直接拿两个增速相减 8.2−5.6=2.6"又算错的人准备的',
    'D 选项猜你会把方向搞反',
  ],
  similar_tip:
    '以后看到"比重比上年上升/下降几个百分点"，固定三步：① 找部分增速 a 和整体增速 b ② 比大小定方向 ③ 答案一定小于 |a−b|，用选项直接卡。全程不用算比重。',
  note_card: '比重变化：先比增速定方向，幅度必小于增速之差 —— 两步出答案，永远不要真去算两个比重。',
}

/** 铺一些示例记录，让「弱点报告」和「错题本」一打开就有东西看 */
const DEMO_RECORDS = [
  { module: 'data', topic: '增长率比较', types: ['concept_gap'], summary: '凭感觉判断比重升降，没用固定动作' },
  { module: 'data', topic: '单位换算', types: ['unit_trap'], summary: '材料给亿元，选项问万元，差了一万倍' },
  { module: 'data', topic: '平均数增长率', types: ['formula_wrong'], summary: '用成了比重变化公式，分子分母也反了' },
  { module: 'data', topic: '增长量比较', types: ['method_slow'], summary: '每题都硬算，一道题花了三分钟' },
  { module: 'math', topic: '工程问题', types: ['formula_wrong'], summary: '没赋特值，直接设未知数硬解，算错了' },
  { module: 'math', topic: '排列组合', types: ['skipped'], summary: '知识点空白，直接放弃了' },
  { module: 'logic', topic: '加强削弱', types: ['logic_flaw'], summary: '把"间接支持"当成了最强加强项' },
  { module: 'logic', topic: '图形推理', types: ['method_slow'], summary: '一个个数线条，其实看对称性两秒就出' },
  { module: 'verbal', topic: '主旨概括', types: ['option_trap'], summary: '选了只覆盖局部的选项，没抓主题词' },
  { module: 'verbal', topic: '逻辑填空', types: ['stem_misread'], summary: '没看后面的转折词，语感选错了' },
  { module: 'data', topic: '比重变化', types: ['calc_error'], summary: '方法对，截位时方向搞反了' },
  { module: 'data', topic: '同比环比', types: ['stem_misread'], summary: '问的是环比，我按同比算了' },
  { module: 'common', topic: '时政常识', types: ['skipped'], summary: '完全没见过，蒙的' },
  { module: 'math', topic: '行程问题', types: ['time_panic'], summary: '最后两分钟来不及，全蒙了 C' },
  { module: 'data', topic: '指数', types: ['concept_gap'], summary: '不知道指数怎么换算成增长率' },
  { module: 'verbal', topic: '语句排序', types: ['careless'], summary: '排好序了，涂卡涂错一位' },
  { module: 'logic', topic: '定义判断', types: ['option_trap'], summary: '选项偷换了主体，没发现' },
  { module: 'data', topic: '年均增长率', types: ['method_slow'], summary: '开五次方手算，其实用估算就够' },
]

function buildDemoRecords(create) {
  const now = Date.now()
  // 倒序生成，让时间分布自然一点（也顺带让 7 天趋势图有数据）
  return DEMO_RECORDS.map((d, i) => {
    const analysis = {
      module: d.module,
      topic: d.topic,
      question_text: `【示例题目】${d.topic} · 用于演示弱点报告统计`,
      is_correct: false,
      error_types: d.types,
      error_summary: d.summary,
      fast_solution: { name: '示例快解', why_fast: '', steps: ['这是示例数据，不是真实分析'], seconds: 40 },
      key_points: [],
      traps: [],
      similar_tip: '',
      note_card: '',
    }
    return create({
      module: d.module,
      topic: d.topic,
      questionText: analysis.question_text,
      status: 'wrong',
      analysis,
      source: 'demo',
      // 均匀铺在最近 6 天内
      createdAt: now - Math.floor((i / DEMO_RECORDS.length) * 6 * 86400000) - i * 60000,
    })
  })
}

/* ==========================================================================
 * §6 通用组件（原 §5）
 * ========================================================================*/

function Card({ children, className = '' }) {
  return <div className={'bg-white rounded-2xl border border-slate-200/80 shadow-sm ' + className}>{children}</div>
}

function Chip({ children, className = '' }) {
  return (
    <span className={'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ' + className}>
      {children}
    </span>
  )
}

function ModuleChip({ module }) {
  const m = moduleOf(module)
  return <Chip className={m.chip}>{m.name}</Chip>
}

function ErrorChip({ errKey }) {
  return <Chip className="text-rose-700 bg-rose-50 border-rose-200">{errorName(errKey)}</Chip>
}

function SectionTitle({ children, extra }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-500">{children}</h2>
      {extra}
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled, className = '', loading }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={
        'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white transition active:scale-[0.99] disabled:opacity-50 ' +
        className
      }
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {children}
    </button>
  )
}

function ErrorBox({ message, onRetry }) {
  if (!message) return null
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      <div className="flex items-start gap-2">
        <span>⚠️</span>
        <div className="flex-1">
          <div>{message}</div>
          {onRetry && (
            <button onClick={onRetry} className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white">
              重试
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Empty({ icon = '📭', title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="mt-3 font-medium text-slate-700">{title}</div>
      {desc && <div className="mt-1 max-w-xs text-sm text-slate-500">{desc}</div>}
      {action}
    </div>
  )
}

/** 纯 div 画的条形图，避免引入图表库 */
function BarRow({ label, count, max, total, color = 'bg-brand-500', suffix }) {
  const pct = max ? Math.max(4, Math.round((count / max) * 100)) : 0
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">
          {count}
          {suffix ?? (total ? ` · ${Math.round((count / total) * 100)}%` : '')}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={'h-full rounded-full ' + color} style={{ width: pct + '%' }} />
      </div>
    </div>
  )
}

function LineBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="flex h-24 items-end gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="text-[10px] tabular-nums text-slate-400">{d.count || ''}</div>
          <div
            className={'w-full rounded-t ' + (d.count ? 'bg-brand-400' : 'bg-slate-100')}
            style={{ height: Math.max(3, (d.count / max) * 60) + 'px' }}
          />
          <div className="text-[10px] text-slate-400">{d.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ==========================================================================
 * §7 分析页（拍照 / 粘贴 → 分析结果）
 * ========================================================================*/

function SolutionBlock({ analysis }) {
  const fast = analysis.fast_solution || {}
  const normal = analysis.normal_solution || {}
  return (
    <div className="space-y-3">
      {fast.name && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-brand-700">⚡ 快解：{fast.name}</span>
            {fast.seconds ? <span className="text-xs text-brand-600">约 {fast.seconds} 秒</span> : null}
          </div>
          {fast.why_fast && <div className="mt-1 text-sm text-brand-700/80">{fast.why_fast}</div>}
          {fast.steps?.length > 0 && (
            <ol className="mt-2 space-y-1.5">
              {fast.steps.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {normal.steps?.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            常规解法{normal.seconds ? `（约 ${normal.seconds} 秒）` : ''}
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            {normal.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )
}

function AnalysisResult({ analysis, onSave, saving, saved, showErrorFixes = true }) {
  const [showQuestion, setShowQuestion] = useState(false)
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ModuleChip module={analysis.module} />
          {analysis.topic && <Chip className="border-slate-200 bg-slate-50 text-slate-600">{analysis.topic}</Chip>}
          {analysis.is_correct ? (
            <Chip className="border-emerald-200 bg-emerald-50 text-emerald-700">✓ 做对了</Chip>
          ) : (
            <Chip className="border-rose-200 bg-rose-50 text-rose-700">✗ 做错了</Chip>
          )}
          {saved && (
            <Chip className="border-slate-200 bg-slate-50 text-slate-500">
              {saved === 'mastered' ? '🎓 已掌握' : '📌 待攻克'}
            </Chip>
          )}
          {analysis.error_types?.map((k) => (
            <ErrorChip key={k} errKey={k} />
          ))}
        </div>

        {analysis.error_summary && (
          <div className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">
            {analysis.error_summary}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4 text-sm">
          {analysis.user_answer && (
            <span className="text-slate-500">
              你选 <b className="text-slate-800">{analysis.user_answer}</b>
            </span>
          )}
          {analysis.correct_answer && (
            <span className="text-slate-500">
              正确 <b className="text-emerald-600">{analysis.correct_answer}</b>
            </span>
          )}
          <button onClick={() => setShowQuestion((v) => !v)} className="ml-auto text-xs text-brand-600">
            {showQuestion ? '收起题目' : '查看题目原文'}
          </button>
        </div>

        {showQuestion && (
          <div className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            {analysis.question_text}
            {analysis.options?.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {analysis.options.map((o, i) => (
                  <div key={i}>{o}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle>怎么最快做出来</SectionTitle>
        <SolutionBlock analysis={analysis} />
      </Card>

      {analysis.key_points?.length > 0 && (
        <Card className="p-4">
          <SectionTitle>这道题在考什么</SectionTitle>
          <ul className="space-y-1 text-sm text-slate-700">
            {analysis.key_points.map((k, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-brand-500">•</span>
                <span>{k}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {analysis.traps?.length > 0 && (
        <Card className="p-4">
          <SectionTitle>出题人埋的坑</SectionTitle>
          <ul className="space-y-1 text-sm text-amber-800">
            {analysis.traps.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span>🕳</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {analysis.similar_tip && (
        <Card className="border-emerald-200 bg-emerald-50 p-4">
          <SectionTitle>下次遇到同类题，固定这么做</SectionTitle>
          <div className="text-sm font-medium text-emerald-800">{analysis.similar_tip}</div>
        </Card>
      )}

      {analysis.note_card && (
        <Card className="border-amber-200 bg-amber-50 p-4">
          <SectionTitle>抄进错题本的一句话</SectionTitle>
          <div className="text-sm text-amber-900">{analysis.note_card}</div>
        </Card>
      )}

      {showErrorFixes && analysis.error_types?.length > 0 && (
        <Card className="p-4">
          <SectionTitle>这个错因，下次怎么防</SectionTitle>
          <div className="space-y-2">
            {analysis.error_types.map((k) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-700">{errorName(k)}</div>
                {ERROR_TYPES[k]?.fix && <div className="mt-1 text-slate-600">👉 {ERROR_TYPES[k].fix}</div>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!saved ? (
        <PrimaryButton onClick={onSave} loading={saving}>
          存入错题本
        </PrimaryButton>
      ) : (
        <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-700">
          ✓ 已存入错题本
        </div>
      )}
    </div>
  )
}

function CapturePage({ onOpenDetail, gotoEssay }) {
  const { settings, create } = useApp()
  const [mode, setMode] = useState('photo')
  const [image, setImage] = useState(null)
  const [questionText, setQuestionText] = useState('')
  const [userAnswer, setUserAnswer] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('')
  const [userNote, setUserNote] = useState('')
  const [module, setModule] = useState(settings.defaultModule || 'data')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const fileRef = useRef(null)

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr('')
    try {
      const dataUrl = await compressImage(file)
      setImage(dataUrl)
      setAnalysis(null)
      setSavedId(null)
    } catch (e2) {
      setErr(e2.message)
    }
  }

  const run = useCallback(async () => {
    setLoading(true)
    setErr('')
    setAnalysis(null)
    setSavedId(null)
    try {
      const a = await aiAnalyzeQuestion(settings, {
        image: mode === 'photo' ? image : null,
        questionText,
        module,
        userAnswer,
        correctAnswer,
        userNote,
      })
      if (!a.module) a.module = module
      setAnalysis(a)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [settings, mode, image, questionText, module, userAnswer, correctAnswer, userNote])

  const save = () => {
    if (!analysis) return
    const rec = create({
      module: analysis.module || module,
      topic: analysis.topic || '',
      questionText: analysis.question_text || questionText,
      userAnswer: analysis.user_answer || userAnswer,
      correctAnswer: analysis.correct_answer || correctAnswer,
      status: analysis.is_correct ? 'correct' : 'wrong',
      analysis,
      source: mode === 'photo' ? 'photo' : 'text',
      userNote,
    })
    setSavedId(rec.id)
  }

  const reset = () => {
    setImage(null)
    setQuestionText('')
    setUserAnswer('')
    setCorrectAnswer('')
    setUserNote('')
    setAnalysis(null)
    setSavedId(null)
    setErr('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const canRun = mode === 'photo' ? Boolean(image) : questionText.trim().length > 4

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">分析这道题</h1>
          <p className="mt-0.5 text-sm text-slate-500">做错的、拿不准的、想学快解的，都可以丢进来</p>
        </div>
        <button onClick={gotoEssay} className="rounded-xl border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700">
          申论批改
        </button>
      </div>

      {/* 输入方式 */}
      <div className="flex rounded-xl bg-slate-100 p-1">
        {[
          { k: 'photo', label: '📷 拍照' },
          { k: 'text', label: '✍️ 粘贴文字' },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setMode(t.k)}
            className={
              'flex-1 rounded-lg py-2 text-sm font-medium transition ' +
              (mode === t.k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'photo' ? (
        <Card className="p-4">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPickFile} className="hidden" />
          {image ? (
            <div className="space-y-3">
              <img src={image} alt="题目" className="max-h-72 w-full rounded-xl object-contain bg-slate-50" />
              <div className="flex gap-2">
                <button onClick={() => fileRef.current?.click()} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700">
                  重新拍照
                </button>
                <button onClick={() => setImage(null)} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700">
                  删除
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-12 text-slate-500 transition active:bg-slate-50"
            >
              <span className="text-3xl">📷</span>
              <span className="font-medium">拍照 / 从相册选择</span>
              <span className="text-xs text-slate-400">一次拍一道题，拍清楚题干和选项</span>
            </button>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-600">粘贴题目（含选项更好）</label>
          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            rows={7}
            placeholder="把题目和选项粘进来，格式乱一点没关系…"
            className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </Card>
      )}

      {/* 补充信息 */}
      <Card className="p-4">
        <SectionTitle>补充信息（不填也能分析）</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MODULES.filter((m) => m.key !== 'essay').map((m) => (
            <button
              key={m.key}
              onClick={() => setModule(m.key)}
              className={
                'rounded-full border px-3 py-1.5 text-xs font-medium transition ' +
                (module === m.key ? m.chip : 'border-slate-200 bg-white text-slate-500')
              }
            >
              {m.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">我选的答案</label>
            <input value={userAnswer} onChange={(e) => setUserAnswer(e.target.value)} placeholder="如 B" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="label">正确答案</label>
            <input value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="不知道可不填" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          </div>
        </div>
        <div className="mt-3">
          <label className="label">我是怎么错的（选填，写了分析更准）</label>
          <input value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="如：算到一半时间不够了 / 看成了环比" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>
      </Card>

      <ErrorBox message={err} onRetry={canRun ? run : null} />

      <PrimaryButton onClick={run} disabled={!canRun} loading={loading}>
        {loading ? '老师正在看这道题…' : '开始分析'}
      </PrimaryButton>

      <button
        onClick={() => {
          setErr('')
          setSavedId(null)
          setAnalysis(DEMO_ANALYSIS)
        }}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500"
      >
        还没配 API Key？先看一份示例分析 →
      </button>

      {loading && (
        <div className="text-center text-xs text-slate-400">
          拍照识别通常 5-15 秒，请稍等
        </div>
      )}

      {analysis && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">分析结果</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          {analysis === DEMO_ANALYSIS && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              🧪 这是<b>内置示例</b>，用来看清分析包含哪些内容，不是 AI 真实输出。
              配好 API Key 后拍一道真题试试。
            </div>
          )}
          <AnalysisResult analysis={analysis} onSave={save} saving={false} saved={Boolean(savedId)} />
          {savedId ? (
            <div className="flex gap-2">
              <button onClick={() => onOpenDetail(savedId)} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700">
                查看记录
              </button>
              <button onClick={reset} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white">
                再分析一题
              </button>
            </div>
          ) : (
            analysis === DEMO_ANALYSIS && (
              <button onClick={reset} className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600">
                收起示例
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
 * §8 记录页
 * ========================================================================*/

function RecordsPage({ onOpenDetail }) {
  const { records, remove } = useApp()
  const [filter, setFilter] = useState('all')
  const [kw, setKw] = useState('')

  const list = useMemo(() => {
    let l = records
    if (filter !== 'all') l = l.filter((r) => r.module === filter)
    if (kw.trim()) {
      const k = kw.trim()
      l = l.filter(
        (r) =>
          (r.questionText || '').includes(k) ||
          (r.topic || '').includes(k) ||
          (r.analysis?.error_summary || '').includes(k),
      )
    }
    return l
  }, [records, filter, kw])

  if (!records.length) {
    return (
      <Empty
        icon="📋"
        title="错题本还是空的"
        desc="去「分析」页拍一道做错的题，它就会出现在这里，并且自动统计错因。"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-slate-800">错题本</h1>
        <p className="mt-0.5 text-sm text-slate-500">共 {records.length} 条记录</p>
      </div>

      <input
        value={kw}
        onChange={(e) => setKw(e.target.value)}
        placeholder="搜索题干、考点、错因…"
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
      />

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button
          onClick={() => setFilter('all')}
          className={'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === 'all' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500')}
        >
          全部
        </button>
        {MODULES.filter((m) => records.some((r) => r.module === m.key)).map((m) => (
          <button
            key={m.key}
            onClick={() => setFilter(m.key)}
            className={'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === m.key ? m.chip : 'border-slate-200 bg-white text-slate-500')}
          >
            {m.name}
          </button>
        ))}
      </div>

      {list.length === 0 && <Empty icon="🔍" title="没有匹配的记录" />}

      <div className="space-y-2">
        {list.map((r) => (
          <Card key={r.id} className="p-3.5">
            <button onClick={() => onOpenDetail(r.id)} className="w-full text-left">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <ModuleChip module={r.module} />
                {r.topic && <Chip className="border-slate-200 bg-slate-50 text-slate-600">{r.topic}</Chip>}
                <span className="ml-auto text-[11px] text-slate-400">
                  {new Date(r.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                </span>
              </div>
              <div className="line-clamp-2 text-sm text-slate-700">
                {r.analysis?.error_summary || r.questionText?.slice(0, 60) || '（无题干）'}
              </div>
              {r.analysis?.error_types?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.analysis.error_types.slice(0, 3).map((k) => (
                    <ErrorChip key={k} errKey={k} />
                  ))}
                </div>
              )}
            </button>
            <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
              <button
                onClick={() => {
                  if (confirm('确定删除这条记录？')) remove(r.id)
                }}
                className="text-xs text-slate-400 hover:text-rose-600"
              >
                删除
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ==========================================================================
 * §9 详情页（含错因修正、"问老师"追问、重做）
 * ========================================================================*/

/**
 * 错因修正器。
 * 为什么必须让用户能改：AI 归因一定会判错，而错因直接决定弱点报告，
 * 一处判错会污染整个统计。让用户一键纠正，比让 AI 更准更划算。
 */
function ErrorEditor({ value = [], onChange }) {
  const [open, setOpen] = useState(false)

  const toggle = (key) => {
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-500">错因归因</span>
        <button onClick={() => setOpen((v) => !v)} className="text-xs text-brand-600">
          {open ? '收起' : 'AI 判错了？点这里改'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 && (
          <span className="text-sm text-slate-400">（没有归因到具体错因，可手动补充）</span>
        )}
        {value.map((k) => (
          <ErrorChip key={k} errKey={k} />
        ))}
      </div>

      {open && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {ERROR_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-xs font-medium text-slate-500">{g.title}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.keys.map((k) => {
                  const on = value.includes(k)
                  return (
                    <button
                      key={k}
                      onClick={() => toggle(k)}
                      className={
                        'rounded-full border px-2.5 py-1 text-xs transition ' +
                        (on
                          ? 'border-brand-300 bg-brand-600 font-medium text-white'
                          : 'border-slate-200 bg-white text-slate-600')
                      }
                    >
                      {on ? '✓ ' : ''}
                      {ERROR_TYPES[k]?.name || k}
                    </button>
                  )
                })}
              </div>
              {value.some((k) => g.keys.includes(k)) && (
                <div className="mt-1.5 space-y-1">
                  {value
                    .filter((k) => g.keys.includes(k) && ERROR_TYPES[k]?.fix)
                    .map((k) => (
                      <div key={k} className="text-xs text-slate-500">
                        👉 {ERROR_TYPES[k].fix}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
          <div className="text-xs text-slate-400">
            改完立刻生效，弱点报告的统计会跟着更新。
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 重做这道题。
 * 隔几天回来重做做错的题，是最有效的复习方式。
 * 这里刻意先只显示题干（不给答案），你选完再揭晓。
 */
function RedoBlock({ analysis, onRedo }) {
  const [picked, setPicked] = useState(null)

  const opts = analysis.options || []
  const correct = (analysis.correct_answer || '').trim().toUpperCase()
  const letter = (o) => (String(o).trim()[0] || '').toUpperCase()

  const hasAnswer = Boolean(correct)

  return (
    <div className="space-y-3">
      {opts.length > 0 ? (
        <div className="space-y-1.5">
          {opts.map((o, i) => {
            const L = letter(o)
            const isPicked = picked === L
            const isRight = hasAnswer && L === correct
            let cls = 'border-slate-200 bg-white text-slate-700'
            if (picked) {
              if (isRight) cls = 'border-emerald-300 bg-emerald-50 text-emerald-800'
              else if (isPicked) cls = 'border-rose-300 bg-rose-50 text-rose-800'
              else cls = 'border-slate-200 bg-white text-slate-400'
            }
            return (
              <button
                key={i}
                disabled={Boolean(picked)}
                onClick={() => setPicked(L)}
                className={'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ' + cls}
              >
                {o}
                {picked && isRight && <span className="ml-2 text-xs">← 正确答案</span>}
                {picked && isPicked && !isRight && <span className="ml-2 text-xs">← 你选的</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
          这道题没有存下选项，直接看下面的答案自评吧。
        </div>
      )}

      {picked && (
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="text-sm text-slate-700">
            正确答案：<b className="text-emerald-600">{correct || '未记录'}</b>
            {picked === correct ? (
              <span className="ml-2 font-medium text-emerald-600">✓ 这次对了</span>
            ) : (
              <span className="ml-2 font-medium text-rose-600">✗ 还是错了</span>
            )}
          </div>
          <button
            onClick={() => onRedo(picked === correct)}
            className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white"
          >
            记录这次结果
          </button>
        </div>
      )}
    </div>
  )
}

function DetailPage({ id, onBack }) {
  const { records, settings, patch } = useApp()
  const rec = records.find((r) => r.id === id)
  const [thread, setThread] = useState(rec?.chat || [])
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(false)
  const [err, setErr] = useState('')
  const [redoOpen, setRedoOpen] = useState(false)
  const [redoMsg, setRedoMsg] = useState('')

  if (!rec) {
    return (
      <div>
        <button onClick={onBack} className="mb-4 text-sm text-brand-600">← 返回</button>
        <Empty title="记录不存在" desc="可能已被删除" />
      </div>
    )
  }

  const analysis = rec.analysis || {}

  /** 改错因：同时更新记录本身和 analysis 里的数组，保证统计口径一致 */
  const setErrorTypes = (types) => {
    patch(rec.id, {
      analysis: { ...analysis, error_types: types },
      errorTypes: types,
    })
  }

  /** 重做结果：对了就把这条标记为已掌握，错了则记一笔重做失败 */
  const onRedo = (isCorrect) => {
    const history = Array.isArray(rec.redoHistory) ? rec.redoHistory : []
    patch(rec.id, {
      redoHistory: [...history, { at: Date.now(), correct: isCorrect }],
      status: isCorrect ? 'correct' : 'wrong',
    })
    setRedoMsg(isCorrect ? '✓ 已标记为掌握，弱点报告里会算作已解决' : '✗ 已记录，这道题还会留在你的错题本里')
    setRedoOpen(false)
  }

  const redoCount = rec.redoHistory?.length || 0
  const redoRight = rec.redoHistory?.filter((h) => h.correct).length || 0

  const ask = async (text) => {
    const question = (text ?? q).trim()
    if (!question) return
    setAsking(true)
    setErr('')
    const next = [...thread, { role: 'user', content: question }]
    setThread(next)
    setQ('')
    try {
      const answer = await aiAsk(settings, {
        analysis: rec.analysis,
        questionText: rec.questionText,
        history: thread,
        question,
      })
      const full = [...next, { role: 'assistant', content: answer }]
      setThread(full)
      patch(rec.id, { chat: full })
    } catch (e) {
      setErr(e.message)
      setThread(thread)
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">← 返回</button>
        <span className="text-sm text-slate-400">
          {new Date(rec.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {rec.analysis ? (
        <AnalysisResult
          analysis={rec.analysis}
          saved={rec.status === 'correct' ? 'mastered' : 'pending'}
          showErrorFixes={false}
        />
      ) : (
        <Card className="p-4">
          <div className="whitespace-pre-wrap text-sm text-slate-700">{rec.questionText}</div>
        </Card>
      )}

      {/* 错因可修正：AI 判错会污染弱点报告统计 */}
      {rec.analysis && (
        <Card className="p-4">
          <ErrorEditor value={analysis.error_types || []} onChange={setErrorTypes} />
        </Card>
      )}

      {/* 重做：隔几天回来做一遍，是最有效的复习 */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <SectionTitle>重做一遍</SectionTitle>
          {redoCount > 0 && (
            <span className="text-xs text-slate-400">
              已重做 {redoCount} 次，对了 {redoRight} 次
            </span>
          )}
        </div>
        {redoMsg && (
          <div className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
            {redoMsg}
          </div>
        )}
        {redoOpen ? (
          <>
            <div className="mb-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {analysis.question_text || rec.questionText}
            </div>
            <RedoBlock analysis={analysis} onRedo={onRedo} />
            <button
              onClick={() => setRedoOpen(false)}
              className="mt-2 w-full rounded-xl bg-slate-100 py-2.5 text-sm text-slate-600"
            >
              取消
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setRedoMsg('')
              setRedoOpen(true)
            }}
            className="w-full rounded-xl border border-brand-200 bg-white py-2.5 text-sm font-medium text-brand-700"
          >
            遮住答案，重做这道题
          </button>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle>问老师</SectionTitle>
        {thread.length === 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {['为什么这么快？', '换个更笨但更稳的解法', '这类题有什么通用套路？', '我错在哪一步？'].map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {thread.map((m, i) => (
            <div
              key={i}
              className={
                'rounded-xl p-3 text-sm leading-relaxed ' +
                (m.role === 'user' ? 'ml-6 bg-brand-50 text-brand-900' : 'mr-2 bg-slate-50 text-slate-700')
              }
            >
              {m.content}
            </div>
          ))}
          {asking && <div className="text-xs text-slate-400">老师正在思考…</div>}
        </div>
        <ErrorBox message={err} />
        <div className="mt-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder="继续追问…"
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
          />
          <button onClick={() => ask()} disabled={asking || !q.trim()} className="rounded-xl bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50">
            发送
          </button>
        </div>
      </Card>
    </div>
  )
}

/* ==========================================================================
 * §10 弱点报告
 * ========================================================================*/

function WeaknessPage() {
  const { records, stats, settings, create } = useApp()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [goal, setGoal] = useState(() => localStorage.getItem('gk_goal') || '')

  useEffect(() => {
    localStorage.setItem('gk_goal', goal)
  }, [goal])

  const run = async () => {
    setLoading(true)
    setErr('')
    try {
      const r = await aiWeaknessReport(settings, { statsText: statsToText(stats), goal })
      setReport(r)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 空状态也要保留页面标题和说明，否则用户进来不知道这是哪个页面
  if (!records.length) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">弱点报告</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            攒够错题后，这里会自动统计你的错因分布，并让 AI 给出阶段诊断
          </p>
        </div>
        <Empty
          icon="📊"
          title="还没有数据可以分析"
          desc="先录几道错题，这里会自动统计你的错因分布，并让 AI 给出阶段诊断。"
        />
        <button
          onClick={() => buildDemoRecords(create)}
          className="mx-auto block rounded-xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-medium text-brand-700"
        >
          先用示例数据看看长什么样
        </button>
      </div>
    )
  }

  const maxErr = Math.max(1, ...stats.errorRanking.map((e) => e.count))
  const maxMod = Math.max(1, ...Object.values(stats.byModule))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">弱点报告</h1>
        <p className="mt-0.5 text-sm text-slate-500">基于你录入的 {stats.total} 道题自动统计</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '累计题目', value: stats.total },
          { label: '待攻克', value: stats.activeCount },
          { label: '已掌握', value: stats.mastered },
          { label: '错因种类', value: stats.errorRanking.length },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <div className="text-xl font-bold tabular-nums text-brand-600">{s.value}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {stats.mastered > 0 && (
        <Card className="border-emerald-200 bg-emerald-50 p-3">
          <div className="text-sm text-emerald-800">
            🎓 已掌握 <b>{stats.mastered}</b> 题（占 {stats.masteredPct}%）——
            这些题不再计入下面的错因统计，治好的毛病不会一直挂在报告上。
          </div>
        </Card>
      )}

      <Card className="p-4">
        <SectionTitle>近 7 天录入量</SectionTitle>
        <LineBars data={stats.days} />
      </Card>

      <Card className="p-4">
        <SectionTitle extra={<span className="text-xs text-slate-400">仅统计未掌握的题</span>}>
          错因分布（你的病根）
        </SectionTitle>
        {stats.errorRanking.length === 0 ? (
          <div className="text-sm text-slate-500">还没有可统计的错因</div>
        ) : (
          stats.errorRanking.map((e) => (
            <BarRow key={e.key} label={errorName(e.key)} count={e.count} max={maxErr} total={stats.total} color="bg-rose-400" />
          ))
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle extra={<span className="text-xs text-slate-400">仅统计未掌握的题</span>}>
          模块分布
        </SectionTitle>
        {Object.entries(stats.byModule).map(([k, v]) => (
          <BarRow key={k} label={moduleOf(k).name} count={v} max={maxMod} total={stats.total} color={moduleOf(k).bar} />
        ))}
      </Card>

      {stats.topicRanking.length > 0 && (
        <Card className="p-4">
          <SectionTitle>高频考点 Top 10</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {stats.topicRanking.slice(0, 10).map((t) => (
              <Chip key={t.key} className="border-slate-200 bg-slate-50 text-slate-600">
                {t.key} · {t.count}
              </Chip>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <SectionTitle>AI 阶段诊断</SectionTitle>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="我的目标，如：省考行测 75 分 / 资料分析 30 分钟做完"
          className="mb-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        />
        <ErrorBox message={err} onRetry={run} />
        <PrimaryButton onClick={run} loading={loading} className={err ? 'mt-3' : ''}>
          {loading ? '教练正在分析你的数据…' : report ? '重新生成诊断' : '生成阶段诊断'}
        </PrimaryButton>

        {report && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-brand-50 p-3 font-semibold text-brand-800">{report.headline}</div>

            {(report.main_problems || []).map((p, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3">
                <div className="font-medium text-slate-800">
                  {i + 1}. {p.problem}
                </div>
                {p.evidence && <div className="mt-1 text-sm text-slate-500">📈 {p.evidence}</div>}
                {p.impact && <div className="mt-1 text-sm text-rose-600">🎯 {p.impact}</div>}
                {p.action && <div className="mt-1 text-sm text-emerald-700">✅ {p.action}</div>}
              </div>
            ))}

            {report.priority_order?.length > 0 && (
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-600">治疗顺序</div>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                  {report.priority_order.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ol>
              </div>
            )}

            {report.time_allocation?.length > 0 && (
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-600">时间分配建议</div>
                {report.time_allocation.map((t, i) => (
                  <BarRow key={i} label={`${t.module} · ${t.reason || ''}`} count={t.percent} max={100} suffix="%" color="bg-brand-500" />
                ))}
              </div>
            )}

            {report.this_week_plan?.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="mb-1.5 text-sm font-semibold text-slate-700">这一周怎么练</div>
                <ul className="space-y-1 text-sm text-slate-700">
                  {report.this_week_plan.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {report.warnings?.length > 0 && (
              <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <div className="mb-1 font-semibold">⚠️ 要警惕</div>
                <ul className="list-disc space-y-1 pl-5">
                  {report.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {report.encouragement && <div className="text-sm italic text-slate-500">{report.encouragement}</div>}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ==========================================================================
 * §11 技巧库
 * ========================================================================*/

function TipsPage() {
  const { tips, addTip, removeTip } = useApp()
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ module: 'data', title: '', when: '', how: '', caution: '' })

  const list = filter === 'all' ? tips : tips.filter((t) => t.module === filter)
  const modsWithTips = MODULES.filter((m) => tips.some((t) => t.module === m.key))

  const submit = () => {
    if (!draft.title.trim()) return
    addTip({
      module: draft.module,
      title: draft.title.trim(),
      when: draft.when.trim(),
      how: draft.how.split('\n').map((s) => s.trim()).filter(Boolean),
      caution: draft.caution.trim(),
    })
    setDraft({ module: 'data', title: '', when: '', how: '', caution: '' })
    setAdding(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">解题技巧库</h1>
          <p className="mt-0.5 text-sm text-slate-500">快解方法速查，考前翻一遍</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="rounded-xl border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700">
          {adding ? '取消' : '+ 新增'}
        </button>
      </div>

      {adding && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            {MODULES.map((m) => (
              <button
                key={m.key}
                onClick={() => setDraft({ ...draft, module: m.key })}
                className={'rounded-full border px-3 py-1.5 text-xs font-medium ' + (draft.module === m.key ? m.chip : 'border-slate-200 text-slate-500')}
              >
                {m.name}
              </button>
            ))}
          </div>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="方法名，如 差分法比较分数大小" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          <input value={draft.when} onChange={(e) => setDraft({ ...draft, when: e.target.value })} placeholder="什么时候用" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          <textarea value={draft.how} onChange={(e) => setDraft({ ...draft, how: e.target.value })} rows={4} placeholder="怎么做（一行一步）" className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500" />
          <input value={draft.caution} onChange={(e) => setDraft({ ...draft, caution: e.target.value })} placeholder="注意什么" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          <PrimaryButton onClick={submit} disabled={!draft.title.trim()}>保存技巧</PrimaryButton>
        </Card>
      )}

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button onClick={() => setFilter('all')} className={'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === 'all' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500')}>
          全部 {tips.length}
        </button>
        {modsWithTips.map((m) => (
          <button key={m.key} onClick={() => setFilter(m.key)} className={'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === m.key ? m.chip : 'border-slate-200 bg-white text-slate-500')}>
            {m.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {list.map((t) => {
          const isOpen = open === t.id
          return (
            <Card key={t.id} className="overflow-hidden">
              <button onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full items-center gap-2 p-3.5 text-left">
                <span className="text-lg">{isOpen ? '▾' : '▸'}</span>
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{t.title}</div>
                  {t.when && <div className="mt-0.5 text-xs text-slate-500">{t.when}</div>}
                </div>
                <ModuleChip module={t.module} />
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/60 p-3.5">
                  {t.how?.length > 0 && (
                    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                      {t.how.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ol>
                  )}
                  {t.caution && <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">⚠️ {t.caution}</div>}
                  {t.custom && (
                    <button onClick={() => removeTip(t.id)} className="mt-2 text-xs text-slate-400 hover:text-rose-600">
                      删除这条
                    </button>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ==========================================================================
 * §12 申论批改
 * ========================================================================*/

function EssayPage({ onBack }) {
  const { settings, create } = useApp()
  const [mode, setMode] = useState('text')
  const [image, setImage] = useState(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const onPick = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErr('')
    try {
      setImage(await compressImage(f, 1800, 0.85))
      setResult(null)
    } catch (e2) {
      setErr(e2.message)
    }
  }

  const run = async () => {
    setLoading(true)
    setErr('')
    try {
      const r = await aiAnalyzeEssay(settings, {
        image: mode === 'photo' ? image : null,
        question,
        answer,
        reference,
      })
      setResult(r)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  const canRun = mode === 'photo' ? Boolean(image) : answer.trim().length > 20

  const save = () => {
    if (!result) return
    create({
      module: 'essay',
      topic: result.essay_type || '申论',
      questionText: question || '（申论练习）',
      status: result.score >= (result.score_full || 100) * 0.7 ? 'correct' : 'wrong',
      analysis: {
        module: 'essay',
        topic: result.essay_type,
        question_text: question,
        is_correct: false,
        error_types: (result.top_fixes || []).length ? ['concept_gap'] : [],
        error_summary: result.headline || result.note_card || '',
        note_card: result.note_card,
        essay: result,
      },
      source: 'essay',
    })
    onBack?.()
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">← 返回</button>
        <h1 className="text-lg font-bold text-slate-800">申论批改</h1>
      </div>

      <div className="flex rounded-xl bg-slate-100 p-1">
        {[
          { k: 'text', label: '✍️ 粘贴作答' },
          { k: 'photo', label: '📷 拍手写稿' },
        ].map((t) => (
          <button key={t.k} onClick={() => setMode(t.k)} className={'flex-1 rounded-lg py-2 text-sm font-medium transition ' + (mode === t.k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500')}>
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'photo' && (
        <Card className="p-4">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
          {image ? (
            <div className="space-y-3">
              <img src={image} alt="作答" className="max-h-80 w-full rounded-xl object-contain bg-slate-50" />
              <button onClick={() => fileRef.current?.click()} className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700">
                重新拍照
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-slate-500">
              <span className="text-3xl">📷</span>
              <span className="font-medium">拍手写答案</span>
              <span className="text-xs text-slate-400">字迹清晰、光线均匀，识别更准</span>
            </button>
          )}
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <div>
          <label className="label">题目要求</label>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder="如：根据给定资料，概括…（不超过 300 字）" className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500" />
        </div>
        {mode === 'text' && (
          <div>
            <label className="label">我的作答</label>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={10} placeholder="把写好的答案粘进来…" className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500" />
          </div>
        )}
        <div>
          <label className="label">参考答案 / 评分标准（选填，填了批改更准）</label>
          <textarea value={reference} onChange={(e) => setReference(e.target.value)} rows={3} placeholder="有参考答案就贴上，老师会告诉你差在哪" className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500" />
        </div>
      </Card>

      <ErrorBox message={err} onRetry={canRun ? run : null} />
      <PrimaryButton onClick={run} disabled={!canRun} loading={loading}>
        {loading ? '阅卷人正在批改…' : '开始批改'}
      </PrimaryButton>

      {result && (
        <div className="space-y-3 pt-2">
          <Card className="p-4 text-center">
            <div className="text-sm text-slate-500">{result.essay_type}</div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-brand-600">
              {result.score}
              <span className="text-lg text-slate-400"> / {result.score_full}</span>
            </div>
            {result.grade && <div className="mt-1"><Chip className="border-brand-200 bg-brand-50 text-brand-700">{result.grade}</Chip></div>}
          </Card>

          {result.dimension_scores?.length > 0 && (
            <Card className="p-4">
              <SectionTitle>分项得分</SectionTitle>
              {result.dimension_scores.map((d, i) => (
                <div key={i} className="border-b border-slate-100 py-2 last:border-0">
                  <BarRow label={d.name} count={d.score} max={d.full} suffix={`${d.score}/${d.full}`} color="bg-brand-500" />
                  {d.comment && <div className="text-xs text-slate-500">{d.comment}</div>}
                </div>
              ))}
            </Card>
          )}

          {result.missing_points?.length > 0 && (
            <Card className="border-rose-200 bg-rose-50 p-4">
              <SectionTitle>漏掉的采分点（最致命）</SectionTitle>
              <ul className="space-y-1 text-sm text-rose-800">
                {result.missing_points.map((p, i) => (
                  <li key={i} className="flex gap-2"><span>✗</span><span>{p}</span></li>
                ))}
              </ul>
            </Card>
          )}

          {result.line_comments?.length > 0 && (
            <Card className="p-4">
              <SectionTitle>逐句点评</SectionTitle>
              <div className="space-y-3">
                {result.line_comments.map((c, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3">
                    <div className="text-sm italic text-slate-500">「{c.quote}」</div>
                    {c.problem && <div className="mt-1.5 text-sm text-rose-600">✗ {c.problem}</div>}
                    {c.better && <div className="mt-1 text-sm text-emerald-700">✓ {c.better}</div>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {result.structure_advice && (
            <Card className="p-4">
              <SectionTitle>结构怎么调</SectionTitle>
              <div className="whitespace-pre-wrap text-sm text-slate-700">{result.structure_advice}</div>
            </Card>
          )}

          {result.top_fixes?.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50 p-4">
              <SectionTitle>最该先改的 3 件事</SectionTitle>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-emerald-900">
                {result.top_fixes.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ol>
            </Card>
          )}

          {result.rewrite_sample && (
            <Card className="p-4">
              <SectionTitle>示范改写</SectionTitle>
              <div className="whitespace-pre-wrap text-sm text-slate-700">{result.rewrite_sample}</div>
            </Card>
          )}

          {result.note_card && (
            <Card className="border-amber-200 bg-amber-50 p-4">
              <SectionTitle>这道题的方法论</SectionTitle>
              <div className="text-sm text-amber-900">{result.note_card}</div>
            </Card>
          )}

          <button onClick={save} className="w-full rounded-xl bg-slate-100 py-3 text-sm font-medium text-slate-700">
            存入记录
          </button>
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
 * §13 设置页（API Key、备份、部署说明）
 * ========================================================================*/

function SettingsPage() {
  const { settings, updateSettings, records, reload, stats } = useApp()
  const [draft, setDraft] = useState(settings)
  const [msg, setMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [testingVision, setTestingVision] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => setDraft(settings), [settings])

  const save = () => {
    updateSettings(draft)
    setMsg('已保存')
    setTimeout(() => setMsg(''), 2000)
  }

  const test = async () => {
    setTesting(true)
    setMsg('')
    try {
      const content = await callChat(
        { ...draft },
        [{ role: 'user', content: '只回复两个字：可以' }],
        { json: false, maxTokens: 20, retries: 0 },
      )
      setMsg('✓ 连接成功，模型回复：' + content.trim().slice(0, 20))
    } catch (e) {
      setMsg('✗ ' + e.message)
    } finally {
      setTesting(false)
    }
  }

  /**
   * 专门测「能不能读图」。
   * 用一张内嵌的小图，让模型只回复两个字 —— 能返回就说明读图链路通了。
   * 比只测文字更能说明问题：很多模型文字能用，一给图片就报 400。
   */
  const testVision = async () => {
    setTestingVision(true)
    setMsg('')
    try {
      const probe =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAWklEQVR4nO3RMQ0AMAwDMLP/pks/' +
        'vBJA0i3JAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbQFP8QAB' +
        'lKvBoQAAAABJRU5ErkJggg=='
      const content = await callChat(
        { ...draft },
        [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: probe } },
              { type: 'text', text: '这张图是什么颜色？只回复两个字。' },
            ],
          },
        ],
        {
          json: false,
          maxTokens: 20,
          retries: 0,
          model: draft.visionModel,
          target: visionTarget(draft),
        },
      )
      setMsg('✓ 读图成功，模型看到：' + content.trim().slice(0, 20))
    } catch (e) {
      setMsg('✗ 读图失败：' + e.message)
    } finally {
      setTestingVision(false)
    }
  }

  const doExport = () => {
    const data = {
      app: 'gongkao-coach',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { ...settings, apiKey: '' },
      records,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `考公错题备份_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMsg('已导出备份文件，建议存到网盘或微信收藏')
  }

  /**
   * 生成纯文字版错题报告。
   * 为什么需要：JSON 备份是给程序用的，人看不了。手机上想复习、
   * 想复制到备忘录或发给研友，纯文本最方便。
   */
  const buildTextReport = () => {
    const lines = []
    lines.push(`考公错题本 · ${new Date().toLocaleDateString('zh-CN')}`)
    lines.push(`共 ${stats.total} 题，待攻克 ${stats.activeCount} 题，已掌握 ${stats.mastered} 题`)
    if (stats.errorRanking.length) {
      lines.push('')
      lines.push('【错因排行】')
      stats.errorRanking.forEach((e, i) => {
        lines.push(`${i + 1}. ${errorName(e.key)} —— ${e.count} 次（${e.pct}%）`)
        const fix = ERROR_TYPES[e.key]?.fix
        if (fix) lines.push(`   → ${fix}`)
      })
    }
    const active = records.filter((r) => r.status !== 'correct')
    if (active.length) {
      lines.push('')
      lines.push('【待攻克题目】')
      active.forEach((r, i) => {
        const a = r.analysis || {}
        lines.push('')
        lines.push(`${i + 1}. [${moduleOf(r.module).name}] ${a.topic || r.topic || ''}`)
        if (a.error_summary) lines.push(`   错因：${a.error_summary}`)
        if (a.fast_solution?.name) lines.push(`   快解：${a.fast_solution.name}`)
        if (a.note_card) lines.push(`   记住：${a.note_card}`)
      })
    }
    return lines.join('\n')
  }

  const copyReport = async () => {
    const text = buildTextReport()
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setMsg(`✓ 已复制 ${text.length} 字到剪贴板，去备忘录粘一下`)
      } else {
        // 鸿蒙/旧浏览器可能没有 clipboard API，退回到 textarea 方案
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setMsg(`✓ 已复制 ${text.length} 字到剪贴板`)
      }
    } catch (e) {
      setMsg('✗ 复制失败：' + e.message + '（可以改用「导出备份」）')
    }
  }

  const doImport = (e) => {    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        const incoming = Array.isArray(data) ? data : data.records
        if (!Array.isArray(incoming)) throw new Error('格式不对')
        const existing = records
        const ids = new Set(existing.map((r) => r.id))
        const merged = [...existing, ...incoming.filter((r) => r?.id && !ids.has(r.id))]
        localStorage.setItem(K_RECORDS, JSON.stringify(merged))
        reload()
        setMsg(`导入成功，新增 ${merged.length - existing.length} 条`)
      } catch (err) {
        setMsg('✗ 导入失败：' + err.message)
      }
    }
    reader.readAsText(f)
  }

  return (
    <div className="space-y-4 pb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">设置</h1>
        <p className="mt-0.5 text-sm text-slate-500">Key 只存在这台设备上，不会上传到任何服务器</p>
      </div>

      {msg && <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{msg}</div>}

      <Card className="space-y-3 p-4">
        <SectionTitle>AI 模型</SectionTitle>
        <div>
          <label className="label">API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-..."
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <button onClick={() => setShowKey((v) => !v)} className="rounded-xl bg-slate-100 px-3 text-sm text-slate-600">
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            去 platform.deepseek.com 注册 → API Keys → 创建一个，充 10 块钱能用很久。
          </p>
        </div>
        <div>
          <label className="label">接口地址（一般不用改）</label>
          <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>
        <div>
          <label className="label">文字模型（用来分析和批改）</label>
          <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
        </div>

        <div className="border-t border-slate-100 pt-3">
          <label className="label">📷 看图模型（拍照识题用，可选）</label>
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            <b>DeepSeek 目前不支持读图</b>，所以「拍照识题」要另外接一家能看图的模型。
            不配也能用 —— 改用「粘贴文字」模式即可（粉笔 App 里的题可以直接复制）。
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VISION_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => setDraft({ ...draft, visionBaseUrl: p.baseUrl, visionModel: p.model })}
                className={
                  'rounded-full border px-2.5 py-1.5 text-xs ' +
                  (draft.visionModel === p.model && draft.visionBaseUrl === p.baseUrl
                    ? 'border-brand-300 bg-brand-50 font-medium text-brand-700'
                    : 'border-slate-200 bg-white text-slate-500')
                }
              >
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            <input
              value={draft.visionBaseUrl}
              onChange={(e) => setDraft({ ...draft, visionBaseUrl: e.target.value })}
              placeholder="看图模型的接口地址，如 https://dashscope.aliyuncs.com/compatible-mode"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <input
              value={draft.visionModel}
              onChange={(e) => setDraft({ ...draft, visionModel: e.target.value })}
              placeholder="看图模型名，如 qwen-vl-max"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <input
              type={showKey ? 'text' : 'password'}
              value={draft.visionApiKey}
              onChange={(e) => setDraft({ ...draft, visionApiKey: e.target.value })}
              placeholder="看图模型的 API Key（和上面是同一家就不用填）"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            <button
              onClick={testVision}
              disabled={testingVision || !draft.visionModel}
              className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              {testingVision ? '正在让模型看图…' : '测试能否读图'}
            </button>
          </div>
        </div>

        <div>
          <label className="label">代理地址（可选，进阶）</label>
          <input value={draft.proxyUrl} onChange={(e) => setDraft({ ...draft, proxyUrl: e.target.value })} placeholder="https://xxx.workers.dev" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500" />
          <p className="mt-1.5 text-xs text-slate-500">
            填了之后 Key 交给代理保管，前端不再存 Key。部署给别人用时建议配上。
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">保存</button>          <button onClick={test} disabled={testing} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">
            {testing ? '测试中…' : '测试连接'}
          </button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionTitle>数据与备份</SectionTitle>
        <p className="text-sm text-slate-600">
          数据全部存在这台设备的浏览器里，<b>不会上传</b>。所以清缓存、换手机、换浏览器都会丢，
          请定期导出备份。
        </p>
        <div className="flex gap-2">
          <button onClick={doExport} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">
            导出备份
          </button>
          <label className="flex-1 cursor-pointer rounded-xl bg-slate-100 py-2.5 text-center text-sm font-medium text-slate-700">
            导入备份
            <input type="file" accept="application/json" onChange={doImport} className="hidden" />
          </label>
        </div>
        <button
          onClick={copyReport}
          disabled={!records.length}
          className="w-full rounded-xl border border-brand-200 bg-white py-2.5 text-sm font-medium text-brand-700 disabled:opacity-50"
        >
          复制文字版错题本（方便粘到备忘录）
        </button>
        <div className="text-xs text-slate-500">当前共 {records.length} 条记录</div>

        <div className="rounded-xl bg-slate-50 p-3">
          <div className="text-sm font-medium text-slate-700">想先看看「弱点报告」长什么样？</div>
          <p className="mt-1 text-xs text-slate-500">
            载入 18 条示例错题，可以立刻看到错因分布、模块统计和 7 天趋势。看完可以一键清空。
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                buildDemoRecords(create)
                setMsg('已载入示例数据，去「弱点」页看看')
                setTimeout(() => setMsg(''), 3000)
              }}
              className="flex-1 rounded-xl border border-brand-200 bg-white py-2 text-sm font-medium text-brand-700"
            >
              载入示例数据
            </button>
            <button
              onClick={() => {
                if (!confirm('确定清空所有记录？此操作不可撤销，建议先导出备份。')) return
                setRecords([])
                setMsg('已清空')
                setTimeout(() => setMsg(''), 2000)
              }}
              className="flex-1 rounded-xl border border-rose-200 bg-white py-2 text-sm font-medium text-rose-600"
            >
              清空所有记录
            </button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>在手机上使用</SectionTitle>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>把这个项目部署到 Cloudflare Pages 或 GitHub Pages（推代码即可，不需要构建）。</li>
          <li>手机浏览器打开网址，用浏览器菜单里的「添加到桌面」，图标就像 App 一样。</li>
          <li>鸿蒙自带浏览器上，桌面图标可能会带地址栏，属于系统限制，功能不受影响。</li>
        </ol>
      </Card>

      <div className="pb-4 text-center text-xs text-slate-400">
        考公做题分析器 · 数据本地优先 · 愿你上岸
      </div>
    </div>
  )
}

/* ==========================================================================
 * §14 全局状态 + 应用外壳
 * ========================================================================*/

const AppContext = createContext(null)
const useApp = () => useContext(AppContext)

function AppProvider({ children }) {
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...lsGet(K_SETTINGS, {}) }))
  const [records, setRecords] = useState(() => lsGet(K_RECORDS, []))
  const [customTips, setCustomTips] = useState(() => lsGet(K_TIPS, []))

  useEffect(() => lsSet(K_SETTINGS, settings), [settings])
  useEffect(() => lsSet(K_RECORDS, records), [records])
  useEffect(() => lsSet(K_TIPS, customTips), [customTips])

  const updateSettings = useCallback((p) => setSettings((s) => ({ ...s, ...p })), [])

  const create = useCallback((rec) => {
    const full = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      status: 'wrong',
      ...rec,
    }
    // createdAt 允许被显式指定（示例数据要铺在最近几天，好让趋势图有内容）
    setRecords((rs) => [full, ...rs])
    return full
  }, [])

  const patch = useCallback((id, p) => {
    setRecords((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  }, [])

  const remove = useCallback((id) => setRecords((rs) => rs.filter((r) => r.id !== id)), [])
  const reload = useCallback(() => setRecords(lsGet(K_RECORDS, [])), [])

  const addTip = useCallback((tip) => {
    const full = { ...tip, id: `t_custom_${Date.now()}`, custom: true }
    setCustomTips((t) => [...t, full])
    return full
  }, [])

  const removeTip = useCallback((id) => setCustomTips((t) => t.filter((x) => x.id !== id)), [])

  const tips = useMemo(() => [...BUILTIN_TIPS, ...customTips], [customTips])
  const stats = useMemo(() => computeStats(records), [records])

  const value = {
    settings,
    updateSettings,
    records,
    setRecords,
    create,
    patch,
    remove,
    reload,
    stats,
    tips,
    addTip,
    removeTip,
  }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

const TABS = [
  { key: 'capture', label: '分析', icon: '📷' },
  { key: 'records', label: '错题', icon: '📋' },
  { key: 'weakness', label: '弱点', icon: '📊' },
  { key: 'tips', label: '技巧', icon: '📚' },
  { key: 'settings', label: '设置', icon: '⚙️' },
]

function Shell() {
  const { settings } = useApp()
  const [tab, setTab] = useState('capture')
  const [detailId, setDetailId] = useState(null)
  const [essayOpen, setEssayOpen] = useState(false)

  useEffect(() => {
    if (!settings.apiKey && !settings.proxyUrl) setTab('settings')
  }, [settings.apiKey, settings.proxyUrl])

  let body
  if (essayOpen) {
    body = <EssayPage onBack={() => setEssayOpen(false)} />
  } else if (detailId) {
    body = <DetailPage id={detailId} onBack={() => setDetailId(null)} />
  } else if (tab === 'capture') {
    body = <CapturePage onOpenDetail={setDetailId} gotoEssay={() => setEssayOpen(true)} />
  } else if (tab === 'records') {
    body = <RecordsPage onOpenDetail={setDetailId} />
  } else if (tab === 'weakness') {
    body = <WeaknessPage />
  } else if (tab === 'tips') {
    body = <TipsPage />
  } else {
    body = <SettingsPage />
  }

  const hideNav = essayOpen || Boolean(detailId)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 pb-28 pt-4">{body}</div>      {!hideNav && (
        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl pb-[env(safe-area-inset-bottom)]">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition ' +
                  (tab === t.key ? 'font-semibold text-brand-600' : 'text-slate-400')
                }
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}

/**
 * 错误边界。
 * 万一某个页面渲染时报错，不至于整个 App 白屏 —— 至少还能看到原因、
 * 有一键导出备份的入口（数据比界面重要）。
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('页面渲染出错：', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-lg font-bold text-rose-800">页面出错了</div>
          <p className="mt-1 text-sm text-rose-700">
            你的数据还在，没有被破坏。可以先导出备份，再刷新页面重试。
          </p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-xs text-rose-700">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                try {
                  const raw = localStorage.getItem('gk_records_v1') || '[]'
                  const blob = new Blob([raw], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `考公错题备份_${new Date().toISOString().slice(0, 10)}.json`
                  a.click()
                  URL.revokeObjectURL(url)
                } catch (e) {
                  alert('导出失败：' + e.message)
                }
              }}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white"
            >
              导出备份
            </button>
            <button
              onClick={() => location.reload()}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-rose-700"
            >
              刷新重试
            </button>
          </div>
        </div>
      </div>
    )
  }
}

function Root() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />)
