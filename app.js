/* 本文件由 scripts/build.mjs 从 app.jsx 自动生成，请勿直接修改。
 * 改代码请改 app.jsx，然后运行：node scripts/build.mjs
 * 生成时间：2026/9/17 23:46:18
 */
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

const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  createContext,
  useContext
} = React;

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
    fix: '圈出题干最后一句的问法再动笔算，做完回读一遍问法。'
  },
  unit_trap: {
    name: '单位/量级没换',
    short: '单位量级',
    desc: '亿元与万元混用、百分号与千分号、万人与人的换算。',
    typical: '材料给"亿元"，选项问"万元"，答案差 10000 倍。',
    fix: '算完先看量级；选项之间差 10 倍以上的，先怀疑单位。'
  },
  data_mislocate: {
    name: '找错数据',
    short: '找错数据',
    desc: '材料里指标名近似，或行列看串了，取了相近的另一个数。',
    typical: '把"限额以上"看成"限额以下"，或取了邻行的数。',
    fix: '用笔尖点住数字再读，指标名一个字一个字对。'
  },
  concept_gap: {
    name: '概念不清',
    short: '概念不清',
    desc: '公式或定义记混：增长率与增长量、比重与比例、平均数的增长率…',
    typical: '把"比重的变化"当成"比重"来算。',
    fix: '进技巧库把该概念的定义与公式重抄一遍，配 3 道同类题。'
  },
  formula_wrong: {
    name: '公式用错',
    short: '公式用错',
    desc: '概念其实懂，但选错公式或套错场景。',
    typical: '求平均数增长率时用了比重变化公式。',
    fix: '按"已知什么 → 求什么"两栏列出来，先去技巧库对公式再算。'
  },
  calc_error: {
    name: '计算失误',
    short: '计算失误',
    desc: '方法对、思路对，纯算错：退位、进位、除法粗心。',
    typical: '截位方向搞反，或加减时没对齐数位。',
    fix: '强制截位直除 + 量级校验（结果的数量级是否合理）。'
  },
  method_slow: {
    name: '方法笨/超时',
    short: '方法超时',
    desc: '硬算能做对，但耗时远超该题型应有时间，性价比崩了。',
    typical: '资料分析一题算了 3 分钟，挤掉后面 5 道题。',
    fix: '查技巧库该题型的速算套路，练成固定动作（如先看选项差距）。'
  },
  logic_flaw: {
    name: '推理/论证漏洞',
    short: '推理漏洞',
    desc: '偷换概念、以偏概全、因果倒置、样本不具代表性等没识别出来。',
    typical: '把"相关"当"因果"，同类坑又踩一次。',
    fix: '背会 8 类论证漏洞的识别特征，做题先找结论再找论据。'
  },
  option_trap: {
    name: '掉进选项陷阱',
    short: '选项陷阱',
    desc: '绝对化表述、无中生有、偷换主体、答非所问等选项设计。',
    typical: '选项把"部分"改成"全部"，没注意就选了。',
    fix: '每个选项回原文找依据，找不到依据的直接排除。'
  },
  careless: {
    name: '粗心手快',
    short: '粗心',
    desc: '涂错卡、抄错数、漏看条件。不是不会，是太快。',
    typical: '草稿纸上算的是 B，涂卡涂成 C。',
    fix: '每 10 题停 5 秒回看涂卡；草稿纸按题号分段写。'
  },
  time_panic: {
    name: '时间恐慌瞎选',
    short: '时间恐慌',
    desc: '最后几分钟来不及，连蒙带猜，正确率断崖下跌。',
    typical: '最后 10 题全蒙 C。',
    fix: '给每个模块设硬性时间上限，超时立即跳走，绝不拖到最后。'
  },
  skipped: {
    name: '不会/放弃',
    short: '不会',
    desc: '知识点确实空白，不是失误。',
    typical: '没见过这个考点。',
    fix: '归入知识点补漏清单，安排专项突破，别算成"粗心"。'
  },
  other: {
    name: '其他原因',
    short: '其他',
    desc: '上面都不符合，自己在备注里补充。',
    typical: '',
    fix: ''
  }
};
const ERROR_GROUPS = [{
  title: '读题层（最该先治）',
  keys: ['stem_misread', 'unit_trap', 'data_mislocate']
}, {
  title: '知识层',
  keys: ['concept_gap', 'formula_wrong', 'skipped']
}, {
  title: '计算与效率层',
  keys: ['calc_error', 'method_slow']
}, {
  title: '判断层',
  keys: ['logic_flaw', 'option_trap']
}, {
  title: '心态与习惯层',
  keys: ['careless', 'time_panic']
}, {
  title: '其他',
  keys: ['other']
}];
const MODULES = [{
  key: 'data',
  name: '资料分析',
  chip: 'text-blue-700 bg-blue-50 border-blue-200',
  bar: 'bg-blue-500'
}, {
  key: 'math',
  name: '数量关系',
  chip: 'text-purple-700 bg-purple-50 border-purple-200',
  bar: 'bg-purple-500'
}, {
  key: 'logic',
  name: '判断推理',
  chip: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  bar: 'bg-emerald-500'
}, {
  key: 'verbal',
  name: '言语理解',
  chip: 'text-amber-700 bg-amber-50 border-amber-200',
  bar: 'bg-amber-500'
}, {
  key: 'common',
  name: '常识判断',
  chip: 'text-rose-700 bg-rose-50 border-rose-200',
  bar: 'bg-rose-500'
}, {
  key: 'essay',
  name: '申论',
  chip: 'text-cyan-700 bg-cyan-50 border-cyan-200',
  bar: 'bg-cyan-500'
}, {
  key: 'other',
  name: '其他',
  chip: 'text-slate-700 bg-slate-100 border-slate-200',
  bar: 'bg-slate-400'
}];
const errorName = k => ERROR_TYPES[k]?.name || '未归类';
const moduleOf = k => MODULES.find(m => m.key === k) || MODULES[6];

/* ==========================================================================
 * §2 解题技巧库（出厂预置，用户可增删）
 * 组织方式：什么时候用 → 怎么做 → 注意什么
 * ========================================================================*/

const BUILTIN_TIPS = [{
  id: 't_jiewei',
  module: 'data',
  title: '截位直除（资料分析第一基本功）',
  when: '所有除法型计算：增长率、比重、平均数、倍数',
  how: ['看选项差距决定截几位：选项首位不同→分母截 2 位；前两位不同→截 3 位；差距 <2%→老实算', '分子不动或只简单取整，只截分母', '截分母统一方向：都截小或都截大，避免误差叠加'],
  caution: '选项之间只差 1% 时不要截位，改用量级估算或直接精算。'
}, {
  id: 't_tezheng',
  module: 'data',
  title: '特征数字法（把百分数变成好算的分数）',
  when: '出现 12.5%、16.7%、33.3%、6.25% 这类"眼熟"的百分数',
  how: ['12.5%=1/8，16.7%≈1/6，33.3%≈1/3，6.25%=1/16，14.3%≈1/7，11.1%≈1/9', '替换成分数后，乘除立刻变成整数运算', '例：6400×12.5% = 6400÷8 = 800'],
  caution: '改分数会有误差，选项接近时慎用。'
}, {
  id: 't_zengzhangliang',
  module: 'data',
  title: '增长量比较：先看现期量，再看增长率',
  when: '"增长最多/最少的是"这类比较题',
  how: ['增长量 = 现期量 ÷ (1+增长率) × 增长率', '两项增长率接近时，直接比现期量大小（倍数悬殊时最快）', '增长率相差大（如 5% vs 40%）时，改用"现期量×增长率"粗比'],
  caution: '不要拿基期量去比，材料给什么用什么。'
}, {
  id: 't_bizhongbi',
  module: 'data',
  title: '比重变化：先判升降，再定范围',
  when: '"比重比上年上升/下降几个百分点"',
  how: ['升降看增速：部分增速 a > 整体增速 b → 比重上升；a < b → 下降', '变化幅度一定小于 |a − b|', '结合选项直接排除，多数题不用精算'],
  caution: '比重变化要用"百分点"表述，不能和"%"混。'
}, {
  id: 't_pingjunshu',
  module: 'data',
  title: '平均数的增长率',
  when: '"人均收入同比增长了百分之几"',
  how: ['平均数增长率 = (1+总量增速) ÷ (1+份数增速) − 1', '两者增速都很小（<10%）时，近似等于 总量增速 − 份数增速', '分子分母别搞反：总量在上、份数在下'],
  caution: '两个增速都很大（>20%）时不能用近似，必须精算。'
}, {
  id: 't_ziliao_order',
  module: 'data',
  title: '资料分析做题顺序（省时间的关键）',
  when: '整套资料分析',
  how: ['先用 20 秒扫材料结构（时间、指标、单位），不读数字', '先做"直接读数"和"简单比较"的题，难的最后做', '每题设 90 秒上限，超时先标记跳过', '先看选项再算：差距大就估算，差距小才精算'],
  caution: '不要从头到尾按顺序硬做，也不要读完材料才开始答题。'
}, {
  id: 't_weishu',
  module: 'math',
  title: '尾数法 / 末两位法',
  when: '加减法精确求值，且选项末位不同',
  how: ['只算最后一位（或两位）', '直接与选项末位比对，唯一即答案'],
  caution: '有进位/借位时要连着后两位一起算。'
}, {
  id: 't_tezhifa',
  module: 'math',
  title: '特值法（赋值法）',
  when: '题目全是比例、百分数、倍数关系，没有具体数值',
  how: ['给总量赋一个方便的值（常取 100、12、最小公倍数）', '按条件算出所求，再看选项是否为定值', '工程问题取"时间的最小公倍数"当总工程量，效率立刻变整数'],
  caution: '题目若给了真实具体量，就不能随便赋特值。'
}, {
  id: 't_daipai',
  module: 'math',
  title: '代入排除法',
  when: '多位数问题、年龄问题、不定方程、选项信息完整',
  how: ['从最"好算"的选项开始代，不必从 A 开始', '能一步排除多个选项的条件优先用', '问"最大/最小"时从边界项开始代'],
  caution: '必须代全部条件，不能只满足一个就选。'
}, {
  id: 't_lunzheng',
  module: 'logic',
  title: '论证题三步走',
  when: '加强 / 削弱型逻辑判断',
  how: ['找结论：通常在"因此/可见/说明"之后', '找论据与结论之间的"跳跃概念"', '答案一定在建立或切断这个跳跃，其余都是无关项'],
  caution: '"加强"选最直接的，不要选"间接支持""部分支持"。'
}, {
  id: 't_zhuti',
  module: 'verbal',
  title: '片段阅读：主题词 + 行文脉络',
  when: '主旨概括、意图判断',
  how: ['先扫高频名词确定主题词，选项没有主题词直接排除', '看结构：总-分（重点在总）、分-总（重点在尾句）、转折（重点在转折后）', '两个选项都对时选更全面、更贴主旨的，不选只覆盖局部的'],
  caution: '不要用常识去补原文没说的内容。'
}, {
  id: 't_tika',
  module: 'other',
  title: '考场时间分配（通用）',
  when: '整套行测模考',
  how: ['资料分析放在体力最好的阶段做，不要留到最后', '数量关系只做最容易的 3-5 题，其余统一蒙同一个选项', '每模块设硬上限，到点立刻换模块，绝不恋战', '留 5 分钟专门涂卡和检查涂错'],
  caution: '顺序要按自己的模考数据定，别照搬别人的时间表。'
}];

/* ==========================================================================
 * §3 存储层 —— IndexedDB
 *
 * 为什么用 IndexedDB 而不是 localStorage：
 *   1. localStorage 只有 5MB，且是同步 API，写的时候会卡住界面
 *   2. 现在每分析一道题都会留一条记录（哪怕没加入错题本），数据量上去了
 *   3. IndexedDB 异步、手机端配额通常几百 MB，容量焦虑彻底消失
 *
 * 两个 store：
 *   settings → 一条记录装全部设置 + 自定义技巧
 *   records  → 每条分析一条
 * ========================================================================*/

const DB_NAME = 'gongkao_coach';
const DB_VERSION = 2;
const STORE_SETTINGS = 'settings';
const STORE_RECORDS = 'records';
// 技能包缓存（方法流派的 JSON），v2 新增
const STORE_SKILLS = 'skills';

// 旧版 localStorage 的键，仅用于一次性迁移
const K_OLD_SETTINGS = 'gk_settings_v1';
const K_OLD_RECORDS = 'gk_records_v1';
const K_OLD_TIPS = 'gk_tips_v1';
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
  visionModel: ''
};

/** 常见支持读图的模型预设，点一下就把地址和模型名填好，省得自己查文档 */
const VISION_PRESETS = [{
  name: '通义千问 VL（阿里云百炼）',
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
  model: 'qwen-vl-max'
}, {
  name: '智谱 GLM-4V',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  model: 'glm-4v-flash'
}, {
  name: '月之暗面 Kimi（moonshot-v1-8k-vision-preview）',
  baseUrl: 'https://api.moonshot.cn',
  model: 'moonshot-v1-8k-vision-preview'
}, {
  name: 'OpenAI GPT-4o mini',
  baseUrl: 'https://api.openai.com',
  model: 'gpt-4o-mini'
}, {
  name: '就用 DeepSeek（注意：不支持读图）',
  baseUrl: '',
  model: ''
}];
let dbPromise = null;
function openDB() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('这个浏览器不支持 IndexedDB'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const store = db.createObjectStore(STORE_RECORDS, {
          keyPath: 'id'
        });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('saved', 'saved');
      }
      // v2：技能包缓存。老用户升级时这里会自动补建，不会丢数据
      if (!db.objectStoreNames.contains(STORE_SKILLS)) {
        db.createObjectStore(STORE_SKILLS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('打开数据库失败'));
  });
  return dbPromise;
}

/** 统一的事务包装：run(store) 的返回值里若带 __req，就等请求结果 */
function tx(storeName, mode, run) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    try {
      result = run(store);
    } catch (e) {
      reject(e);
      return;
    }
    t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
    t.onerror = () => reject(t.error || new Error('数据库操作失败'));
    t.onabort = () => reject(t.error || new Error('数据库操作被中断'));
  }));
}
const dbGetSettings = () => tx(STORE_SETTINGS, 'readonly', s => {
  const req = s.get('app');
  return {
    __req: req
  };
}).catch(() => null);
const dbSaveSettings = settings => tx(STORE_SETTINGS, 'readwrite', s => s.put(settings, 'app')).catch(e => console.warn('保存设置失败', e));
const dbGetCustomTips = () => tx(STORE_SETTINGS, 'readonly', s => {
  const req = s.get('customTips');
  return {
    __req: req
  };
}).catch(() => []);
const dbSaveCustomTips = tips => tx(STORE_SETTINGS, 'readwrite', s => s.put(tips, 'customTips')).catch(e => console.warn('保存自定义技巧失败', e));
const dbGetRecords = () => tx(STORE_RECORDS, 'readonly', s => {
  const req = s.getAll();
  return {
    __req: req
  };
}).catch(() => []);
const dbPutRecord = record => tx(STORE_RECORDS, 'readwrite', s => s.put(record));
const dbPutRecords = records => tx(STORE_RECORDS, 'readwrite', s => {
  records.forEach(r => s.put(r));
  return records.length;
});
const dbDeleteRecord = id => tx(STORE_RECORDS, 'readwrite', s => s.delete(id));
const dbClearRecords = () => tx(STORE_RECORDS, 'readwrite', s => s.clear());

/**
 * 把旧版 localStorage 里的数据搬进 IndexedDB，只跑一次，搬完清掉旧键。
 * 老记录没有 saved 字段，一律当作「已加入错题本」。
 */
async function migrateFromLocalStorage() {
  if (typeof localStorage === 'undefined') return 0;
  const readOld = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const oldRecords = readOld(K_OLD_RECORDS, []);
  const oldSettings = readOld(K_OLD_SETTINGS, null);
  const oldTips = readOld(K_OLD_TIPS, []);
  let migrated = 0;
  if (Array.isArray(oldRecords) && oldRecords.length) {
    const normalized = oldRecords.map(r => ({
      saved: true,
      source: r.source || 'migrated',
      createdAt: r.createdAt || Date.now(),
      updatedAt: r.createdAt || Date.now(),
      ...r
    }));
    await dbPutRecords(normalized);
    migrated = normalized.length;
  }
  if (oldSettings) await dbSaveSettings(oldSettings);
  if (Array.isArray(oldTips) && oldTips.length) await dbSaveCustomTips(oldTips);
  try {
    localStorage.removeItem(K_OLD_RECORDS);
    localStorage.removeItem(K_OLD_SETTINGS);
    localStorage.removeItem(K_OLD_TIPS);
  } catch {
    // 清不掉也不影响使用
  }
  return migrated;
}
function computeStats(records) {
  const total = records.length;
  const byError = {};
  const byModule = {};
  const byTopic = {};

  // 重做做对的题算「已掌握」：仍然留在错题本里可以复查，
  // 但不再计入错因统计 —— 否则治好的病会一直挂在弱点报告上，看着永远没进步。
  const active = records.filter(r => r.status !== 'correct');
  const mastered = total - active.length;
  const activeCount = active.length;
  active.forEach(r => {
    const m = r.module || 'other';
    byModule[m] = (byModule[m] || 0) + 1;
    const a = r.analysis;
    if (!a) return;
    const list = Array.isArray(a.error_types) ? a.error_types : [];
    list.forEach(t => {
      byError[t] = (byError[t] || 0) + 1;
    });
    const topic = a.topic || r.topic;
    if (topic && topic !== '无') byTopic[topic] = (byTopic[topic] || 0) + 1;
  });
  const errorRanking = Object.entries(byError).map(([key, count]) => ({
    key,
    count,
    pct: activeCount ? Math.round(count / activeCount * 100) : 0
  })).sort((a, b) => b.count - a.count);
  const topicRanking = Object.entries(byTopic).map(([key, count]) => ({
    key,
    count
  })).sort((a, b) => b.count - a.count);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    days.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: records.filter(r => r.createdAt >= start && r.createdAt < start + 86400000).length
    });
  }
  return {
    total,
    activeCount,
    mastered,
    masteredPct: total ? Math.round(mastered / total * 100) : 0,
    byModule,
    errorRanking,
    topicRanking,
    days
  };
}
function statsToText(stats) {
  const errLines = stats.errorRanking.slice(0, 10).map(e => `- ${errorName(e.key)}：${e.count} 次（占全部错题 ${e.pct}%）`).join('\n');
  const topics = stats.topicRanking.slice(0, 12).map(t => `${t.key}(${t.count})`).join('、');
  const mods = Object.entries(stats.byModule).map(([k, v]) => `${moduleOf(k).name}(${v})`).join('、');
  return `累计录入 ${stats.total} 题，其中已掌握 ${stats.mastered} 题，待攻克 ${stats.activeCount} 题。\n模块分布（仅统计未掌握的）：${mods || '无'}\n错因统计（仅统计未掌握的）：\n${errLines || '（暂无）'}\n高频考点：${topics || '（暂无）'}`;
}

/* ==========================================================================
 * §4 方法流派（技能包）
 *
 * 解决什么问题：同一个模块，不同老师的方法体系不一样（截位怎么截、要不要写
 * 总括句）。如果 AI 今天用 A 的讲法、明天用 B 的讲法，你练的时候动作就乱了。
 * 选定一个流派后，AI 会用那一套流程和术语来讲，保持一致。
 *
 * 加载策略（重要，别改坏）：
 *   - 索引很小（约 2KB），直接内联进 app.js，随应用一起加载
 *   - 各流派的详细内容 8-12KB，按需 fetch('./skills/packs/xxx.json')
 *   - 抓到后缓存在 IndexedDB，之后离线也能用
 *   - 这样手机首屏不会因为技能包变大而变慢
 * ========================================================================*/

const SKILLS_INDEX = {
  version: 1,
  packs: [{
    id: 'general-data',
    name: '通用速算法',
    author: '公开方法论整理',
    subject: 'data',
    license: 'self',
    file: 'packs/general-data.json',
    builtin: true,
    summary: '资料分析通用速算体系：截位、415 系数、假设分配、比重变化'
  }, {
    id: 'bailu-shenlun',
    name: '白鹭申论',
    author: '白鹭（半月谈）',
    subject: 'essay',
    license: 'MIT',
    source: 'https://github.com/coffe-d/Shenlun.skill',
    file: 'packs/bailu-shenlun.json',
    builtin: true,
    summary: '题干四要素审题 + 8 类信号词阅读 + 前置提炼 + 采分点覆盖判分'
  }, {
    id: 'gk-shenlun-rubric',
    name: '国考申论评分标准',
    author: '公开资料整理',
    subject: 'essay',
    license: 'self',
    file: 'packs/gk-rubric.json',
    builtin: true,
    summary: '大作文四类文分档 + 五维权重 + 致命扣分点 + 卷面分规则'
  }, {
    id: 'huasheng13-data',
    name: '花生十三 · 资料分析',
    author: '花生十三',
    subject: 'data',
    license: 'none',
    licenseNote: '该 skill 仓库未声明许可（默认保留所有权利），且自述基于课程资料整理。此处仅作占位，不复刻其内容；如需使用请自行准备内容。',
    source: 'https://github.com/WangJunqing-coder/huasheng13-skill',
    file: null,
    builtin: false,
    disabled: true,
    summary: '（未启用）该来源无开源许可，不随项目分发'
  }]
};

/** 技能包缓存也放 IndexedDB，按 packId 存原始 JSON */
const dbGetPackCache = id => tx(STORE_SKILLS, 'readonly', s => {
  const req = s.get(id);
  return {
    __req: req
  };
}).catch(() => null);
const dbPutPackCache = (id, payload) => tx(STORE_SKILLS, 'readwrite', s => s.put(payload, id)).catch(() => null);

/**
 * 取一个技能包的内容。三层：内存 → IndexedDB → 网络。
 * 网络失败但本地有缓存时用缓存；都没有就返回 null（调用方退回通用提示词）。
 */
const packMemory = {};
async function loadPack(id) {
  if (!id) return null;
  if (packMemory[id]) return packMemory[id];
  const meta = SKILLS_INDEX.packs.find(p => p.id === id);
  if (!meta || meta.disabled || !meta.file) return null;
  const cached = await dbGetPackCache(id);
  if (cached && cached.version === meta.version && cached.data) {
    packMemory[id] = cached.data;
    return cached.data;
  }
  try {
    const res = await fetch(`./skills/${meta.file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await dbPutPackCache(id, {
      version: meta.version,
      data,
      cachedAt: Date.now()
    });
    packMemory[id] = data;
    return data;
  } catch (e) {
    // 网络挂了但有旧缓存 → 用旧的，总比没有好
    if (cached && cached.data) {
      console.warn(`技能包 ${id} 拉取失败，使用本地缓存`, e);
      packMemory[id] = cached.data;
      return cached.data;
    }
    console.warn(`技能包 ${id} 加载失败`, e);
    return null;
  }
}

/** 列出某个模块可选的方法流派 */
function packsForSubject(subject) {
  return SKILLS_INDEX.packs.filter(p => p.subject === subject && !p.disabled);
}

/**
 * 把技能包压成一段能塞进 system prompt 的文本。
 *
 * 为什么要压：完整包 8-12KB，全塞进去每次分析都多花不少 token，还可能干扰模型。
 * 这里只取「指令 + 骨干方法」，示例和长篇说明留给人工查阅。
 */
function packToPromptText(pack, opts = {}) {
  if (!pack) return '';
  const {
    maxChars = 2800
  } = opts;
  const lines = [];
  if (pack.promptFragment) lines.push('【本流派的批改要求】\n' + pack.promptFragment);
  if (pack.honestyNote?.text) lines.push('【关于标准的性质，必须如实转述】\n' + pack.honestyNote.text);
  if (pack.evidenceDiscipline?.rule) lines.push('【证据分级纪律】\n' + pack.evidenceDiscipline.rule);
  if (Array.isArray(pack.methods)) {
    lines.push('【本流派的方法清单与判定规则】');
    pack.methods.forEach(m => {
      const parts = [`▸ ${m.name}（${m.when || ''}）`];
      if (m.principle) parts.push('原理：' + m.principle);
      if (m.formula) parts.push('公式：' + m.formula);
      if (Array.isArray(m.decisionRules)) {
        m.decisionRules.forEach(r => {
          parts.push(`  · 当${r.when} → ${r.action}${r.example ? '（例：' + r.example + '）' : ''}`);
        });
      }
      if (Array.isArray(m.steps)) parts.push('步骤：' + m.steps.join(' → '));
      if (Array.isArray(m.traps)) parts.push('易错：' + m.traps.join('；'));
      lines.push(parts.join('\n'));
    });
  }
  if (pack.shenTiSiYaoSu?.elements) {
    lines.push('【审题：题干四要素】');
    pack.shenTiSiYaoSu.elements.forEach(el => {
      if (Array.isArray(el.rules)) {
        el.rules.forEach(r => {
          if (r.verbs) lines.push(`· ${r.verbs.join('/')} → ${r.type}`);else if (r.type && r.object) lines.push(`· ${r.type} → 作答对象是${r.object}`);else if (typeof r === 'string') lines.push('· ' + r);
        });
      }
      if (Array.isArray(el.regular)) el.regular.forEach(r => lines.push(`· ${r.word}：${r.meaning}`));
      if (Array.isArray(el.processing)) el.processing.forEach(r => lines.push(`· ${r.word}：${r.meaning}`));
    });
  }
  if (Array.isArray(pack.keywordReading?.signals)) {
    lines.push('【读材料：8 类信号词】');
    pack.keywordReading.signals.forEach(s => lines.push(`· ${s.type}（${s.markers}）→ ${s.use}`));
  }
  if (Array.isArray(pack.logicReading?.relations)) {
    lines.push('【逻辑阅读】');
    pack.logicReading.relations.forEach(r => lines.push(`· ${r.type}：${r.principle || r.note || ''}`));
  }
  if (Array.isArray(pack.qianZhiTiLian?.rules)) {
    lines.push('【前置提炼】\n' + pack.qianZhiTiLian.rules.slice(0, 5).map(r => '· ' + r).join('\n'));
  }
  if (Array.isArray(pack.answerIronRules?.rules)) {
    lines.push('【作答铁律】\n' + pack.answerIronRules.rules.map(r => `· ${r.name}：${r.detail}`).join('\n'));
  }
  if (Array.isArray(pack.structuralRules?.rules)) {
    lines.push('【总括句规则】\n' + pack.structuralRules.rules.map(r => '· ' + r).join('\n'));
  }
  if (Array.isArray(pack.scoring?.method)) {
    lines.push('【判分方法：采分点覆盖法】\n' + pack.scoring.method.map(s => '· ' + s).join('\n'));
  }
  if (pack.unverifiedWarnings?.rule) {
    lines.push('【不得用作扣分理由的说法】\n' + pack.unverifiedWarnings.rule);
    (pack.unverifiedWarnings.items || []).forEach(i => lines.push(`· 禁用：${i.claim}`));
  }
  if (pack.bigEssay?.grades) {
    lines.push('【大作文分档】');
    pack.bigEssay.grades.forEach(g => lines.push(`· ${g.grade} ${g.range} 分：${g.standard}`));
  }
  if (Array.isArray(pack.bigEssay?.dimensions)) {
    lines.push('【五维权重】');
    pack.bigEssay.dimensions.forEach(d => lines.push(`· ${d.name} ${d.weight}% —— ${d.note}`));
  }
  if (Array.isArray(pack.bigEssay?.fatalDeductions)) {
    lines.push('【致命失分项】');
    pack.bigEssay.fatalDeductions.forEach(f => lines.push(`· ${f.item}：${f.rule}`));
  }
  if (Array.isArray(pack.smallQuestions?.rules)) {
    lines.push('【小题评分】\n' + pack.smallQuestions.rules.map(r => `· ${r.item}：${r.detail}`).join('\n'));
  }
  if (Array.isArray(pack.expressionAndPaper?.rules)) {
    lines.push('【卷面与表达】\n' + pack.expressionAndPaper.rules.slice(0, 4).map(r => '· ' + r).join('\n'));
  }
  let text = lines.join('\n\n');
  if (text.length > maxChars) text = text.slice(0, maxChars) + '\n…（内容较长已截断）';
  return text;
}

/* ==========================================================================
 * §5 AI 调用
 * ========================================================================*/

const sleep = ms => new Promise(r => setTimeout(r, ms));
function endpoint(settings) {
  if (settings.proxyUrl) return settings.proxyUrl.replace(/\/$/, '') + '/v1/chat/completions';
  return (settings.baseUrl || 'https://api.deepseek.com').replace(/\/$/, '') + '/v1/chat/completions';
}
function parseModelJson(text) {
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try {
    return JSON.parse(t);
  } catch {
    throw new Error('AI 返回的不是有效格式，点「重试」通常就好了');
  }
}
async function callChat(settings, messages, opts = {}) {
  const {
    model,
    temperature = 0.2,
    maxTokens = 2500,
    json = true,
    retries = 2
  } = opts;

  // 允许整段覆盖「地址 + Key + 模型」：读图的模型往往是另一家的
  const target = opts.target || {};
  const eff = {
    proxyUrl: target.proxyUrl ?? settings.proxyUrl,
    baseUrl: target.baseUrl || settings.baseUrl,
    apiKey: target.apiKey ?? settings.apiKey,
    model: model || target.model || settings.model || 'deepseek-chat'
  };
  const useProxy = Boolean(eff.proxyUrl);
  if (!useProxy && !eff.apiKey) throw new Error('还没填 API Key，去「设置」里填一下');
  const body = {
    model: eff.model,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (json) body.response_format = {
    type: 'json_object'
  };
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const res = await fetch(endpoint(eff), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useProxy ? {} : {
            Authorization: 'Bearer ' + eff.apiKey
          })
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        if (res.status === 401) throw new Error('API Key 无效或已过期，请到「设置」重新填写');
        if (res.status === 402) throw new Error('账户余额不足，请去 DeepSeek 充值');
        if (res.status === 404) throw new Error('接口地址或模型名不对，检查「设置」里的 Base URL 和模型名');
        if (res.status === 400) {
          const low = txt.toLowerCase();
          if (low.includes('image') || low.includes('vision') || low.includes('图片')) {
            throw new Error('当前模型不支持读图。请到「设置」把「看图模型」换成支持视觉的模型，或改用「粘贴文字」模式。');
          }
          throw new Error(`请求被拒绝（400）：${txt.slice(0, 180)}`);
        }
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`服务繁忙（${res.status}），已自动重试`);
          await sleep(1200 * (attempt + 1));
          continue;
        }
        throw new Error(`请求失败 ${res.status}：${txt.slice(0, 180)}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('模型没有返回内容');
      return content;
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        lastErr = new Error('请求超时，检查网络后重试');
        continue;
      }
      if (/API Key|余额|接口地址/.test(e.message || '')) throw e;
      lastErr = e;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr || new Error('请求失败');
}
const ERROR_MENU = Object.entries(ERROR_TYPES).map(([k, v]) => `- ${k}（${v.name}）：${v.desc}`).join('\n');
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

注意：图片可能含多道题或无关内容，只分析最主要那一题；图片不清晰时在 question_text 里说明并尽量还原。`;
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

line_comments 至少 3 条且必须引用学生原话；原文太短就给到能给的条数。`;

/**
 * 读图请求的配置。
 * 如果用户单独配了看图模型（常见于 DeepSeek 用户 —— DeepSeek 不能读图），
 * 就用那一家的地址和 Key；没配则退回主模型配置。
 */
function visionTarget(settings) {
  if (!settings.visionModel && !settings.visionBaseUrl) return null;
  return {
    baseUrl: settings.visionBaseUrl || settings.baseUrl,
    apiKey: settings.visionApiKey || settings.apiKey,
    model: settings.visionModel || ''
  };
}
async function aiAnalyzeQuestion(settings, {
  image,
  questionText,
  module,
  userAnswer,
  correctAnswer,
  userNote,
  packPrompt,
  packName
}) {
  const hints = [];
  if (module) hints.push(`学生自认为属于模块：${moduleOf(module).name}`);
  if (userAnswer) hints.push(`学生选的答案：${userAnswer}`);
  if (correctAnswer) hints.push(`正确答案：${correctAnswer}`);
  if (userNote) hints.push(`学生的自我描述：${userNote}`);

  // 方法流派注入：选中流派时，用那一套流程和术语来讲
  const system = QUESTION_SYSTEM + (packPrompt ? `\n\n────────────────\n学生选定了【${packName || '某'}】这套方法体系。你必须**严格按下面的方法和判定规则讲解**，术语和步骤都要跟它一致，不要混入其他流派的讲法：\n\n${packPrompt}\n────────────────` : '');
  let userContent;
  if (image) {
    userContent = [{
      type: 'image_url',
      image_url: {
        url: image
      }
    }, {
      type: 'text',
      text: `请分析照片里这道题。${hints.length ? '\n' + hints.join('\n') : ''}`
    }];
  } else {
    userContent = `请分析下面这道题。\n\n${hints.length ? hints.join('\n') + '\n\n' : ''}【题目】\n${questionText}`;
  }
  const content = await callChat(settings, [{
    role: 'system',
    content: system
  }, {
    role: 'user',
    content: userContent
  }], {
    model: image ? settings.visionModel || settings.model : settings.model,
    target: image ? visionTarget(settings) : null,
    maxTokens: 2600
  });
  const data = parseModelJson(content);
  data.error_types = Array.isArray(data.error_types) ? data.error_types.filter(k => ERROR_TYPES[k]) : [];
  if (!data.fast_solution) data.fast_solution = {
    name: '',
    why_fast: '',
    steps: [],
    seconds: 0
  };
  if (!Array.isArray(data.fast_solution.steps)) data.fast_solution.steps = [];
  return data;
}
async function aiAnalyzeEssay(settings, {
  image,
  question,
  answer,
  reference,
  essayType,
  scoreFull,
  packPrompt,
  packName,
  rubricPrompt
}) {
  const parts = [];
  if (question) parts.push(`【题目要求】\n${question}`);
  if (reference) parts.push(`【参考答案/评分标准】\n${reference}`);
  if (answer) parts.push(`【我的作答】\n${answer}`);

  // 把题型和分值明确告诉模型 —— 否则它会用百分制或猜一个满分，
  // 你就没法对照真实考试成绩（国考大作文通常 35 或 40 分）
  const meta = [];
  if (essayType) meta.push(`题目类型：${essayType}`);
  meta.push(scoreFull ? `本题满分：${scoreFull} 分。评分必须按这个满分来给，不要用百分制。` : '题目没说满分。默认按 40 分制评分，并在结果里注明「如实际为 35 分请告知，我按比例重算」。');
  let userContent;
  if (image) {
    userContent = [{
      type: 'image_url',
      image_url: {
        url: image
      }
    }, {
      type: 'text',
      text: `请批改我上传的申论作答（图片）。${parts.length ? '\n' + parts.join('\n\n') : ''}`
    }];
  } else {
    userContent = `请批改下面的申论作答。\n\n${parts.join('\n\n')}`;
  }
  const system = ESSAY_SYSTEM + `\n\n────────────────\n【本题信息】\n${meta.join('\n')}\n────────────────` + (packPrompt ? `\n\n学生选定了【${packName || '某'}】这套方法体系。按它的流程和判分口径批改：\n\n${packPrompt}` : '') + (rubricPrompt ? `\n\n【评分标尺】\n${rubricPrompt}` : '');
  const content = await callChat(settings, [{
    role: 'system',
    content: system
  }, {
    role: 'user',
    content: userContent
  }], {
    model: image ? settings.visionModel || settings.model : settings.model,
    target: image ? visionTarget(settings) : null,
    maxTokens: 3200
  });
  return parseModelJson(content);
}
async function aiWeaknessReport(settings, {
  statsText,
  goal
}) {
  const content = await callChat(settings, [{
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
main_problems 最多 3 条，每条必须引用统计数字。this_week_plan 必须给满 7 条。`
  }, {
    role: 'user',
    content: `【错题统计】\n${statsText}\n\n【我的目标】${goal || '未填写'}`
  }], {
    maxTokens: 2400,
    temperature: 0.4
  });
  return parseModelJson(content);
}

/** 追问：带上下文继续问老师 */
async function aiAsk(settings, {
  analysis,
  questionText,
  history,
  question
}) {
  const ctx = `【题目】\n${questionText || analysis?.question_text || ''}\n\n【已给出的分析】\n${analysis?.fast_solution?.steps?.join(' → ') || ''}\n正确答案：${analysis?.correct_answer || '未知'}\n考点：${analysis?.topic || ''}`;
  const msgs = [{
    role: 'system',
    content: '你是公考行测答疑老师。回答要短、要具体、直接给结论和步骤，不要客套。如果学生问的是同类题技巧，给出可套用的固定动作。用中文。'
  }, {
    role: 'user',
    content: ctx
  }, ...(history || []).map(h => ({
    role: h.role,
    content: h.content
  })), {
    role: 'user',
    content: question
  }];
  return callChat(settings, msgs, {
    json: false,
    maxTokens: 1200,
    temperature: 0.3
  });
}

/** 手机原图动辄 4-8MB，压到长边 1600px / JPEG 0.82，题干依然清晰 */
function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ==========================================================================
 * §5 示例数据 —— 不配 API Key 也能看到分析长什么样
 * 用途：① 新用户先看效果，决定值不值得用 ② 开发者调界面时不用烧 token
 * ========================================================================*/

const DEMO_ANALYSIS = {
  module: 'data',
  topic: '增长率比较',
  question_text: '2019 年某市高新技术产业产值为 1250 亿元，同比增长 8.2%；规模以上工业总产值为 8600 亿元，同比增长 5.6%。问：高新技术产业产值占规模以上工业总产值的比重，与上年相比约：',
  options: ['A. 上升 0.4 个百分点', 'B. 上升 4 个百分点', 'C. 下降 0.4 个百分点', 'D. 下降 3 个百分点'],
  correct_answer: 'A',
  user_answer: 'D',
  is_correct: false,
  error_types: ['concept_gap', 'method_slow'],
  error_summary: '凭感觉判断比重升降，没有用"部分增速与整体增速比大小"这个固定动作',
  fast_solution: {
    name: '比重变化两步法（先判升降，再定范围）',
    why_fast: '不用算比重，比一个大小、卡一个范围就能选出来',
    steps: ['找部分增速 a = 8.2%（高新技术产业），整体增速 b = 5.6%（规模以上工业）', 'a > b → 比重上升，直接排除 C、D 两个"下降"选项', '变化幅度一定小于 |a − b| = 2.6 个百分点，排除 B（4 个百分点）', '只剩 A，选它'],
    seconds: 30
  },
  normal_solution: {
    steps: ['算今年比重：1250 ÷ 8600 ≈ 14.53%', '算去年产值：1250 ÷ 1.082 ≈ 1155.3，8600 ÷ 1.056 ≈ 8144.0', '算去年比重：1155.3 ÷ 8144.0 ≈ 14.19%', '两者相减：14.53% − 14.19% ≈ 0.34 个百分点'],
    seconds: 150
  },
  key_points: ['比重变化的判断逻辑（部分增速 vs 整体增速）', '变化幅度小于增速之差的边界意识', '"百分点"与"%"的区别'],
  traps: ['选项里同时放"上升"和"下降"，考你有没有先判方向', 'B 选项（4 个百分点）是给"直接拿两个增速相减 8.2−5.6=2.6"又算错的人准备的', 'D 选项猜你会把方向搞反'],
  similar_tip: '以后看到"比重比上年上升/下降几个百分点"，固定三步：① 找部分增速 a 和整体增速 b ② 比大小定方向 ③ 答案一定小于 |a−b|，用选项直接卡。全程不用算比重。',
  note_card: '比重变化：先比增速定方向，幅度必小于增速之差 —— 两步出答案，永远不要真去算两个比重。'
};

/** 铺一些示例记录，让「弱点报告」和「错题本」一打开就有东西看 */
const DEMO_RECORDS = [{
  module: 'data',
  topic: '增长率比较',
  types: ['concept_gap'],
  summary: '凭感觉判断比重升降，没用固定动作'
}, {
  module: 'data',
  topic: '单位换算',
  types: ['unit_trap'],
  summary: '材料给亿元，选项问万元，差了一万倍'
}, {
  module: 'data',
  topic: '平均数增长率',
  types: ['formula_wrong'],
  summary: '用成了比重变化公式，分子分母也反了'
}, {
  module: 'data',
  topic: '增长量比较',
  types: ['method_slow'],
  summary: '每题都硬算，一道题花了三分钟'
}, {
  module: 'math',
  topic: '工程问题',
  types: ['formula_wrong'],
  summary: '没赋特值，直接设未知数硬解，算错了'
}, {
  module: 'math',
  topic: '排列组合',
  types: ['skipped'],
  summary: '知识点空白，直接放弃了'
}, {
  module: 'logic',
  topic: '加强削弱',
  types: ['logic_flaw'],
  summary: '把"间接支持"当成了最强加强项'
}, {
  module: 'logic',
  topic: '图形推理',
  types: ['method_slow'],
  summary: '一个个数线条，其实看对称性两秒就出'
}, {
  module: 'verbal',
  topic: '主旨概括',
  types: ['option_trap'],
  summary: '选了只覆盖局部的选项，没抓主题词'
}, {
  module: 'verbal',
  topic: '逻辑填空',
  types: ['stem_misread'],
  summary: '没看后面的转折词，语感选错了'
}, {
  module: 'data',
  topic: '比重变化',
  types: ['calc_error'],
  summary: '方法对，截位时方向搞反了'
}, {
  module: 'data',
  topic: '同比环比',
  types: ['stem_misread'],
  summary: '问的是环比，我按同比算了'
}, {
  module: 'common',
  topic: '时政常识',
  types: ['skipped'],
  summary: '完全没见过，蒙的'
}, {
  module: 'math',
  topic: '行程问题',
  types: ['time_panic'],
  summary: '最后两分钟来不及，全蒙了 C'
}, {
  module: 'data',
  topic: '指数',
  types: ['concept_gap'],
  summary: '不知道指数怎么换算成增长率'
}, {
  module: 'verbal',
  topic: '语句排序',
  types: ['careless'],
  summary: '排好序了，涂卡涂错一位'
}, {
  module: 'logic',
  topic: '定义判断',
  types: ['option_trap'],
  summary: '选项偷换了主体，没发现'
}, {
  module: 'data',
  topic: '年均增长率',
  types: ['method_slow'],
  summary: '开五次方手算，其实用估算就够'
}];
function buildDemoRecords(create) {
  const now = Date.now();
  // 倒序生成，让时间分布自然一点（也顺带让 7 天趋势图有数据）
  return DEMO_RECORDS.map((d, i) => {
    const analysis = {
      module: d.module,
      topic: d.topic,
      question_text: `【示例题目】${d.topic} · 用于演示弱点报告统计`,
      is_correct: false,
      error_types: d.types,
      error_summary: d.summary,
      fast_solution: {
        name: '示例快解',
        why_fast: '',
        steps: ['这是示例数据，不是真实分析'],
        seconds: 40
      },
      key_points: [],
      traps: [],
      similar_tip: '',
      note_card: ''
    };
    return create({
      module: d.module,
      topic: d.topic,
      questionText: analysis.question_text,
      status: 'wrong',
      analysis,
      source: 'demo',
      // 均匀铺在最近 6 天内
      createdAt: now - Math.floor(i / DEMO_RECORDS.length * 6 * 86400000) - i * 60000
    });
  });
}

/* ==========================================================================
 * §6 通用组件（原 §5）
 * ========================================================================*/

/**
 * 方法流派选择器。
 *
 * 为什么要有它：不同老师的方法体系不一样（截位怎么截、要不要写总括句）。
 * 不选定流派时，AI 每次可能给你不同的讲法，你练的时候动作就乱了。
 * 选定后提示词里会注入那套方法的判定规则，讲法就稳定了。
 *
 * 没有可用流派的模块（言语、数量等）不显示选择器，只给一句说明 ——
 * 不做无用 UI。
 */
function MethodPicker({
  module,
  value,
  onChange,
  subject
}) {
  const subj = subject || module;
  const packs = packsForSubject(subj);
  if (!packs.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "mb-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-500"
    }, "\u8FD9\u4E2A\u6A21\u5757\u6682\u65F6\u6CA1\u6709\u65B9\u6CD5\u6D41\u6D3E\u5305\uFF0C\u7528\u7684\u662F\u901A\u7528\u8BB2\u6CD5\u3002");
  }
  const current = packs.find(p => p.id === value);
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-1.5 flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-medium text-slate-500"
  }, "\u65B9\u6CD5\u6D41\u6D3E"), /*#__PURE__*/React.createElement("span", {
    className: "text-[11px] text-slate-400"
  }, "\u9009\u5B9A\u540E AI \u4F1A\u7528\u8FD9\u4E00\u5957\u8BB2\u6CD5")), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(''),
    className: 'rounded-full border px-3 py-1.5 text-xs font-medium transition ' + (value === '' ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-200 bg-white text-slate-500')
  }, "\u901A\u7528"), packs.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    onClick: () => onChange(p.id),
    className: 'rounded-full border px-3 py-1.5 text-xs font-medium transition ' + (value === p.id ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500')
  }, p.name))), current && /*#__PURE__*/React.createElement("div", {
    className: "mt-2 rounded-xl border border-brand-100 bg-brand-50/60 p-2.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-brand-800"
  }, current.summary), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500"
  }, /*#__PURE__*/React.createElement("span", null, "\u6765\u6E90\uFF1A", current.author), /*#__PURE__*/React.createElement("span", null, "\u8BB8\u53EF\uFF1A", current.license === 'self' ? '自建' : current.license === 'MIT' ? 'MIT（可自由使用）' : current.license), current.source && /*#__PURE__*/React.createElement("a", {
    href: current.source,
    target: "_blank",
    rel: "noreferrer",
    className: "text-brand-600 underline"
  }, "\u539F\u59CB\u4ED3\u5E93"))));
}
function Card({
  children,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'bg-white rounded-2xl border border-slate-200/80 shadow-sm ' + className
  }, children);
}
function Chip({
  children,
  className = ''
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ' + className
  }, children);
}
function ModuleChip({
  module
}) {
  const m = moduleOf(module);
  return /*#__PURE__*/React.createElement(Chip, {
    className: m.chip
  }, m.name);
}
function ErrorChip({
  errKey
}) {
  return /*#__PURE__*/React.createElement(Chip, {
    className: "text-rose-700 bg-rose-50 border-rose-200"
  }, errorName(errKey));
}
function SectionTitle({
  children,
  extra
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-2 flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-sm font-semibold text-slate-500"
  }, children), extra);
}
function PrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
  loading,
  done,
  doneText
}) {
  // done：刚完成的操作，显示对勾给一个确定的收尾反馈
  if (done) {
    return /*#__PURE__*/React.createElement("div", {
      className: 'gk-pop inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-semibold text-emerald-700 ' + className
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-lg leading-none"
    }, "\u2713"), doneText || '已完成');
  }
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    disabled: disabled || loading,
    className: 'relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white transition disabled:bg-slate-300 disabled:text-slate-500 ' + className
  }, loading && /*#__PURE__*/React.createElement("span", {
    className: "h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
  }), children);
}
function ErrorBox({
  message,
  onRetry
}) {
  if (!message) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "\u26A0\uFE0F"), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("div", null, message), onRetry && /*#__PURE__*/React.createElement("button", {
    onClick: onRetry,
    className: "mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white"
  }, "\u91CD\u8BD5"))));
}
function Empty({
  icon = '📭',
  title,
  desc,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center justify-center py-14 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-4xl"
  }, icon), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 font-medium text-slate-700"
  }, title), desc && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 max-w-xs text-sm text-slate-500"
  }, desc), action);
}

/** 纯 div 画的条形图，避免引入图表库 */
function BarRow({
  label,
  count,
  max,
  total,
  color = 'bg-brand-500',
  suffix
}) {
  const pct = max ? Math.max(4, Math.round(count / max * 100)) : 0;
  return /*#__PURE__*/React.createElement("div", {
    className: "py-1.5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-1 flex items-baseline justify-between text-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-slate-700"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "tabular-nums text-slate-500"
  }, count, suffix ?? (total ? ` · ${Math.round(count / total * 100)}%` : ''))), /*#__PURE__*/React.createElement("div", {
    className: "h-2 w-full overflow-hidden rounded-full bg-slate-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: 'h-full rounded-full ' + color,
    style: {
      width: pct + '%'
    }
  })));
}
function LineBars({
  data
}) {
  const max = Math.max(1, ...data.map(d => d.count));
  return /*#__PURE__*/React.createElement("div", {
    className: "flex h-24 items-end gap-1.5"
  }, data.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.label,
    className: "flex flex-1 flex-col items-center gap-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] tabular-nums text-slate-400"
  }, d.count || ''), /*#__PURE__*/React.createElement("div", {
    className: 'w-full rounded-t ' + (d.count ? 'bg-brand-400' : 'bg-slate-100'),
    style: {
      height: Math.max(3, d.count / max * 60) + 'px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "text-[10px] text-slate-400"
  }, d.label))));
}

/* ==========================================================================
 * §7 分析页（拍照 / 粘贴 → 分析结果）
 * ========================================================================*/

function SolutionBlock({
  analysis
}) {
  const fast = analysis.fast_solution || {};
  const normal = analysis.normal_solution || {};
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, fast.name && /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl border border-brand-200 bg-brand-50 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-semibold text-brand-700"
  }, "\u26A1 \u5FEB\u89E3\uFF1A", fast.name), fast.seconds ? /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-brand-600"
  }, "\u7EA6 ", fast.seconds, " \u79D2") : null), fast.why_fast && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-sm text-brand-700/80"
  }, fast.why_fast), fast.steps?.length > 0 && /*#__PURE__*/React.createElement("ol", {
    className: "mt-2 space-y-1.5"
  }, fast.steps.map((s, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    className: "flex gap-2 text-sm text-slate-700"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white"
  }, i + 1), /*#__PURE__*/React.createElement("span", {
    className: "leading-relaxed"
  }, s))))), normal.steps?.length > 0 && /*#__PURE__*/React.createElement("details", {
    className: "rounded-xl border border-slate-200 bg-slate-50 p-3"
  }, /*#__PURE__*/React.createElement("summary", {
    className: "cursor-pointer text-sm font-medium text-slate-600"
  }, "\u5E38\u89C4\u89E3\u6CD5", normal.seconds ? `（约 ${normal.seconds} 秒）` : ''), /*#__PURE__*/React.createElement("ol", {
    className: "mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600"
  }, normal.steps.map((s, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, s)))));
}
function AnalysisResult({
  analysis,
  onSave,
  saving,
  saved,
  showErrorFixes = true
}) {
  const [showQuestion, setShowQuestion] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-2 flex flex-wrap items-center gap-2"
  }, /*#__PURE__*/React.createElement(ModuleChip, {
    module: analysis.module
  }), analysis.topic && /*#__PURE__*/React.createElement(Chip, {
    className: "border-slate-200 bg-slate-50 text-slate-600"
  }, analysis.topic), analysis.is_correct ? /*#__PURE__*/React.createElement(Chip, {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  }, "\u2713 \u505A\u5BF9\u4E86") : /*#__PURE__*/React.createElement(Chip, {
    className: "border-rose-200 bg-rose-50 text-rose-700"
  }, "\u2717 \u505A\u9519\u4E86"), saved && /*#__PURE__*/React.createElement(Chip, {
    className: "border-slate-200 bg-slate-50 text-slate-500"
  }, saved === 'mastered' ? '🎓 已掌握' : '📌 待攻克'), analysis.error_types?.map(k => /*#__PURE__*/React.createElement(ErrorChip, {
    key: k,
    errKey: k
  }))), analysis.error_summary && /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700"
  }, analysis.error_summary), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex items-center gap-4 text-sm"
  }, analysis.user_answer && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500"
  }, "\u4F60\u9009 ", /*#__PURE__*/React.createElement("b", {
    className: "text-slate-800"
  }, analysis.user_answer)), analysis.correct_answer && /*#__PURE__*/React.createElement("span", {
    className: "text-slate-500"
  }, "\u6B63\u786E ", /*#__PURE__*/React.createElement("b", {
    className: "text-emerald-600"
  }, analysis.correct_answer)), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowQuestion(v => !v),
    className: "ml-auto text-xs text-brand-600"
  }, showQuestion ? '收起题目' : '查看题目原文')), showQuestion && /*#__PURE__*/React.createElement("div", {
    className: "mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600"
  }, analysis.question_text, analysis.options?.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "mt-2 space-y-0.5"
  }, analysis.options.map((o, i) => /*#__PURE__*/React.createElement("div", {
    key: i
  }, o))))), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u600E\u4E48\u6700\u5FEB\u505A\u51FA\u6765"), /*#__PURE__*/React.createElement(SolutionBlock, {
    analysis: analysis
  })), analysis.key_points?.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u8FD9\u9053\u9898\u5728\u8003\u4EC0\u4E48"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-1 text-sm text-slate-700"
  }, analysis.key_points.map((k, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-brand-500"
  }, "\u2022"), /*#__PURE__*/React.createElement("span", null, k))))), analysis.traps?.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u51FA\u9898\u4EBA\u57CB\u7684\u5751"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-1 text-sm text-amber-800"
  }, analysis.traps.map((t, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "\uD83D\uDD73"), /*#__PURE__*/React.createElement("span", null, t))))), analysis.similar_tip && /*#__PURE__*/React.createElement(Card, {
    className: "border-emerald-200 bg-emerald-50 p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u4E0B\u6B21\u9047\u5230\u540C\u7C7B\u9898\uFF0C\u56FA\u5B9A\u8FD9\u4E48\u505A"), /*#__PURE__*/React.createElement("div", {
    className: "text-sm font-medium text-emerald-800"
  }, analysis.similar_tip)), analysis.note_card && /*#__PURE__*/React.createElement(Card, {
    className: "border-amber-200 bg-amber-50 p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u6284\u8FDB\u9519\u9898\u672C\u7684\u4E00\u53E5\u8BDD"), /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-amber-900"
  }, analysis.note_card)), showErrorFixes && analysis.error_types?.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u8FD9\u4E2A\u9519\u56E0\uFF0C\u4E0B\u6B21\u600E\u4E48\u9632"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, analysis.error_types.map(k => /*#__PURE__*/React.createElement("div", {
    key: k,
    className: "rounded-xl bg-slate-50 p-3 text-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-medium text-slate-700"
  }, errorName(k)), ERROR_TYPES[k]?.fix && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-slate-600"
  }, "\uD83D\uDC49 ", ERROR_TYPES[k].fix))))), !saved ? /*#__PURE__*/React.createElement(PrimaryButton, {
    onClick: onSave,
    loading: saving
  }, "\u5B58\u5165\u9519\u9898\u672C") : /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-700"
  }, "\u2713 \u5DF2\u5B58\u5165\u9519\u9898\u672C"));
}
function CapturePage({
  onOpenDetail,
  gotoEssay
}) {
  const {
    settings,
    create,
    patch,
    showToast
  } = useApp();
  const [mode, setMode] = useState('photo');
  const [image, setImage] = useState(null);
  const [questionText, setQuestionText] = useState('');
  const [userAnswer, setUserAnswer] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [userNote, setUserNote] = useState('');
  const [module, setModule] = useState(settings.defaultModule || 'data');
  // 方法流派：选 '' 表示用通用提示词，不加任何流派约束
  const [packId, setPackId] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [savedId, setSavedId] = useState(null);
  // 分析完自动留档产生的那条记录 id（加入错题本时复用它，避免重复入库）
  const [draftId, setDraftId] = useState(null);
  const fileRef = useRef(null);
  const onPickFile = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    try {
      const dataUrl = await compressImage(file);
      setImage(dataUrl);
      setAnalysis(null);
      setSavedId(null);
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const run = useCallback(async () => {
    setLoading(true);
    setErr('');
    setAnalysis(null);
    setSavedId(null);
    try {
      // 选了方法流派就先把它取出来（首次会 fetch，之后走 IndexedDB 缓存）
      let packPrompt = '';
      let packName = '';
      if (packId) {
        const pack = await loadPack(packId);
        if (pack) {
          packPrompt = packToPromptText(pack);
          packName = packsForSubject(module).find(p => p.id === packId)?.name || '';
        }
      }
      const a = await aiAnalyzeQuestion(settings, {
        image: mode === 'photo' ? image : null,
        questionText,
        module,
        userAnswer,
        correctAnswer,
        userNote,
        packPrompt,
        packName
      });
      if (!a.module) a.module = module;
      setAnalysis(a);

      // 分析完立刻留档（saved: false 表示「只是分析过，还没加入错题本」）。
      // 这样即使用户看完就走，历史里也有痕迹，不会什么都留不下。
      const archived = create({
        module: a.module || module,
        topic: a.topic || '',
        questionText: a.question_text || questionText,
        userAnswer: a.user_answer || userAnswer,
        correctAnswer: a.correct_answer || correctAnswer,
        status: a.is_correct ? 'correct' : 'wrong',
        analysis: a,
        source: mode === 'photo' ? 'photo' : 'text',
        userNote,
        saved: false,
        packId: packId || null
      });
      setDraftId(archived.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [settings, mode, image, questionText, module, userAnswer, correctAnswer, userNote, create, packId]);

  /** 加入错题本：把已经留档的那条改成 saved，而不是又插一条新的 */
  const save = () => {
    if (!analysis) return;
    if (draftId) {
      patch(draftId, {
        saved: true
      });
      setSavedId(draftId);
      showToast('已加入错题本，弱点报告会统计这道题');
    } else {
      // 兜底：万一留档失败（比如 IndexedDB 不可用），这里再补一条
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
        saved: true
      });
      setSavedId(rec.id);
      showToast('已加入错题本');
    }
  };
  const reset = () => {
    setImage(null);
    setQuestionText('');
    setUserAnswer('');
    setCorrectAnswer('');
    setUserNote('');
    setAnalysis(null);
    setSavedId(null);
    setDraftId(null);
    setErr('');
    if (fileRef.current) fileRef.current.value = '';
  };
  const canRun = mode === 'photo' ? Boolean(image) : questionText.trim().length > 4;
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-bold text-slate-800"
  }, "\u5206\u6790\u8FD9\u9053\u9898"), /*#__PURE__*/React.createElement("p", {
    className: "mt-0.5 text-sm text-slate-500"
  }, "\u505A\u9519\u7684\u3001\u62FF\u4E0D\u51C6\u7684\u3001\u60F3\u5B66\u5FEB\u89E3\u7684\uFF0C\u90FD\u53EF\u4EE5\u4E22\u8FDB\u6765")), /*#__PURE__*/React.createElement("button", {
    onClick: gotoEssay,
    className: "rounded-xl border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700"
  }, "\u7533\u8BBA\u6279\u6539")), /*#__PURE__*/React.createElement("div", {
    className: "flex rounded-xl bg-slate-100 p-1"
  }, [{
    k: 'photo',
    label: '📷 拍照'
  }, {
    k: 'text',
    label: '✍️ 粘贴文字'
  }].map(t => /*#__PURE__*/React.createElement("button", {
    key: t.k,
    onClick: () => setMode(t.k),
    className: 'flex-1 rounded-lg py-2 text-sm font-medium transition ' + (mode === t.k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500')
  }, t.label))), mode === 'photo' ? /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    onChange: onPickFile,
    className: "hidden"
  }), image ? /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: "\u9898\u76EE",
    className: "max-h-72 w-full rounded-xl object-contain bg-slate-50"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => fileRef.current?.click(),
    className: "flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700"
  }, "\u91CD\u65B0\u62CD\u7167"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setImage(null),
    className: "flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700"
  }, "\u5220\u9664"))) : /*#__PURE__*/React.createElement("button", {
    onClick: () => fileRef.current?.click(),
    className: "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-12 text-slate-500 transition active:bg-slate-50"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-3xl"
  }, "\uD83D\uDCF7"), /*#__PURE__*/React.createElement("span", {
    className: "font-medium"
  }, "\u62CD\u7167 / \u4ECE\u76F8\u518C\u9009\u62E9"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-400"
  }, "\u4E00\u6B21\u62CD\u4E00\u9053\u9898\uFF0C\u62CD\u6E05\u695A\u9898\u5E72\u548C\u9009\u9879"))) : /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("label", {
    className: "mb-1.5 block text-sm font-medium text-slate-600"
  }, "\u7C98\u8D34\u9898\u76EE\uFF08\u542B\u9009\u9879\u66F4\u597D\uFF09"), /*#__PURE__*/React.createElement("textarea", {
    value: questionText,
    onChange: e => setQuestionText(e.target.value),
    rows: 7,
    placeholder: "\u628A\u9898\u76EE\u548C\u9009\u9879\u7C98\u8FDB\u6765\uFF0C\u683C\u5F0F\u4E71\u4E00\u70B9\u6CA1\u5173\u7CFB\u2026",
    className: "w-full resize-y rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
  })), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u8865\u5145\u4FE1\u606F\uFF08\u4E0D\u586B\u4E5F\u80FD\u5206\u6790\uFF09"), /*#__PURE__*/React.createElement("div", {
    className: "mb-3 flex flex-wrap gap-1.5"
  }, MODULES.filter(m => m.key !== 'essay').map(m => /*#__PURE__*/React.createElement("button", {
    key: m.key,
    onClick: () => {
      setModule(m.key);
      // 换了模块就清掉流派，避免"资料分析的流派"用在逻辑题上
      setPackId('');
    },
    className: 'rounded-full border px-3 py-1.5 text-xs font-medium transition ' + (module === m.key ? m.chip : 'border-slate-200 bg-white text-slate-500')
  }, m.name))), /*#__PURE__*/React.createElement(MethodPicker, {
    module: module,
    value: packId,
    onChange: setPackId
  }), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u6211\u9009\u7684\u7B54\u6848"), /*#__PURE__*/React.createElement("input", {
    value: userAnswer,
    onChange: e => setUserAnswer(e.target.value),
    placeholder: "\u5982 B",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u6B63\u786E\u7B54\u6848"), /*#__PURE__*/React.createElement("input", {
    value: correctAnswer,
    onChange: e => setCorrectAnswer(e.target.value),
    placeholder: "\u4E0D\u77E5\u9053\u53EF\u4E0D\u586B",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mt-3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u6211\u662F\u600E\u4E48\u9519\u7684\uFF08\u9009\u586B\uFF0C\u5199\u4E86\u5206\u6790\u66F4\u51C6\uFF09"), /*#__PURE__*/React.createElement("input", {
    value: userNote,
    onChange: e => setUserNote(e.target.value),
    placeholder: "\u5982\uFF1A\u7B97\u5230\u4E00\u534A\u65F6\u95F4\u4E0D\u591F\u4E86 / \u770B\u6210\u4E86\u73AF\u6BD4",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }))), /*#__PURE__*/React.createElement(ErrorBox, {
    message: err,
    onRetry: canRun ? run : null
  }), /*#__PURE__*/React.createElement(PrimaryButton, {
    onClick: run,
    disabled: !canRun,
    loading: loading
  }, loading ? '老师正在看这道题…' : '开始分析'), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setErr('');
      setSavedId(null);
      setAnalysis(DEMO_ANALYSIS);
    },
    className: "w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-500"
  }, "\u8FD8\u6CA1\u914D API Key\uFF1F\u5148\u770B\u4E00\u4EFD\u793A\u4F8B\u5206\u6790 \u2192"), loading && /*#__PURE__*/React.createElement("div", {
    className: "text-center text-xs text-slate-400"
  }, "\u62CD\u7167\u8BC6\u522B\u901A\u5E38 5-15 \u79D2\uFF0C\u8BF7\u7A0D\u7B49"), !loading && draftId && !savedId && /*#__PURE__*/React.createElement("div", {
    className: "gk-fade-in rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
  }, "\u2713 \u5206\u6790\u5B8C\u6210\uFF0C", /*#__PURE__*/React.createElement("b", null, "\u5DF2\u81EA\u52A8\u7559\u6863\u5230\u300C\u6700\u8FD1\u5206\u6790\u300D"), "\u3002\u89C9\u5F97\u8FD9\u9898\u503C\u5F97\u53CD\u590D\u770B\uFF0C\u5C31\u70B9\u4E0B\u9762\u7684\u6309\u94AE\u52A0\u5165\u9519\u9898\u672C\u3002"), analysis && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 pt-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-px flex-1 bg-slate-200"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-xs font-medium text-slate-400"
  }, "\u5206\u6790\u7ED3\u679C"), /*#__PURE__*/React.createElement("div", {
    className: "h-px flex-1 bg-slate-200"
  })), analysis === DEMO_ANALYSIS && /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
  }, "\uD83E\uDDEA \u8FD9\u662F", /*#__PURE__*/React.createElement("b", null, "\u5185\u7F6E\u793A\u4F8B"), "\uFF0C\u7528\u6765\u770B\u6E05\u5206\u6790\u5305\u542B\u54EA\u4E9B\u5185\u5BB9\uFF0C\u4E0D\u662F AI \u771F\u5B9E\u8F93\u51FA\u3002 \u914D\u597D API Key \u540E\u62CD\u4E00\u9053\u771F\u9898\u8BD5\u8BD5\u3002"), /*#__PURE__*/React.createElement(AnalysisResult, {
    analysis: analysis,
    onSave: save,
    saving: false,
    saved: savedId ? 'pending' : undefined
  }), savedId ? /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onOpenDetail(savedId),
    className: "flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700"
  }, "\u67E5\u770B\u8BB0\u5F55"), /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    className: "flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white"
  }, "\u518D\u5206\u6790\u4E00\u9898")) : analysis === DEMO_ANALYSIS && /*#__PURE__*/React.createElement("button", {
    onClick: reset,
    className: "w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600"
  }, "\u6536\u8D77\u793A\u4F8B")), loading && /*#__PURE__*/React.createElement(LoadingOverlay, {
    text: "\u8001\u5E08\u6B63\u5728\u770B\u8FD9\u9053\u9898\u2026",
    hint: mode === 'photo' ? '识别图片通常 5-15 秒' : '通常 5-15 秒'
  }));
}

/** 全屏加载遮罩 —— 让用户明确知道「系统在干活」，而不是界面卡住了 */
function LoadingOverlay({
  text,
  hint
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "gk-fade-in fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 px-8 backdrop-blur-[2px]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600"
  }), /*#__PURE__*/React.createElement("div", {
    className: "gk-loading-text mt-4 font-semibold text-slate-800"
  }, text), hint && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-xs text-slate-400"
  }, hint)));
}

/* ==========================================================================
 * §8 记录页
 *
 * 两个视图：
 *   错题本   —— 你主动收藏、要反复看的题（saved: true）
 *   最近分析 —— 所有分析过的题，不管有没有收藏（自动留档）
 *
 * 为什么要有「最近分析」：分析本身就有价值。看完觉得「我会了，不用存」，
 * 过几天想回顾「上次我是怎么想的」，没有痕迹就找不回来了。
 * ========================================================================*/

function RecordsPage({
  onOpenDetail
}) {
  const {
    records,
    remove,
    patch,
    showToast
  } = useApp();
  const [view, setView] = useState('saved'); // saved | all
  const [filter, setFilter] = useState('all');
  const [kw, setKw] = useState('');
  const savedCount = records.filter(r => r.saved).length;
  const list = useMemo(() => {
    let l = view === 'saved' ? records.filter(r => r.saved) : records;
    if (filter !== 'all') l = l.filter(r => r.module === filter);
    if (kw.trim()) {
      const k = kw.trim();
      l = l.filter(r => (r.questionText || '').includes(k) || (r.topic || '').includes(k) || (r.analysis?.error_summary || '').includes(k));
    }
    return l;
  }, [records, view, filter, kw]);
  const moduleOptions = useMemo(() => MODULES.filter(m => records.some(r => r.module === m.key)), [records]);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-bold text-slate-800"
  }, "\u8BB0\u5F55"), /*#__PURE__*/React.createElement("p", {
    className: "mt-0.5 text-sm text-slate-500"
  }, "\u5206\u6790\u8FC7\u7684\u9898\u90FD\u4F1A\u7559\u6863\uFF0C\u5171 ", records.length, " \u6761")), /*#__PURE__*/React.createElement("div", {
    className: "flex rounded-xl bg-slate-100 p-1"
  }, [{
    k: 'saved',
    label: `错题本 ${savedCount}`
  }, {
    k: 'all',
    label: `最近分析 ${records.length}`
  }].map(t => /*#__PURE__*/React.createElement("button", {
    key: t.k,
    onClick: () => setView(t.k),
    className: 'flex-1 rounded-lg py-2 text-sm font-medium transition ' + (view === t.k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500')
  }, t.label))), records.length === 0 ? /*#__PURE__*/React.createElement(Empty, {
    icon: "\uD83D\uDCCB",
    title: "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u8BB0\u5F55",
    desc: "\u53BB\u300C\u5206\u6790\u300D\u9875\u62CD\u4E00\u9053\u9898\u6216\u7C98\u8D34\u4E00\u9053\u9898\uFF0C\u5206\u6790\u5B8C\u4F1A\u81EA\u52A8\u7559\u6863\u5728\u8FD9\u91CC\u3002"
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("input", {
    value: kw,
    onChange: e => setKw(e.target.value),
    placeholder: "\u641C\u7D22\u9898\u5E72\u3001\u8003\u70B9\u3001\u9519\u56E0\u2026",
    className: "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("div", {
    className: "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setFilter('all'),
    className: 'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === 'all' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500')
  }, "\u5168\u90E8"), moduleOptions.map(m => /*#__PURE__*/React.createElement("button", {
    key: m.key,
    onClick: () => setFilter(m.key),
    className: 'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === m.key ? m.chip : 'border-slate-200 bg-white text-slate-500')
  }, m.name))), list.length === 0 && /*#__PURE__*/React.createElement(Empty, {
    icon: "\uD83D\uDD0D",
    title: view === 'saved' ? '错题本还是空的' : '没有匹配的记录',
    desc: view === 'saved' ? '在「最近分析」里点开一条，就能把它加入错题本。' : undefined
  }), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, list.map(r => /*#__PURE__*/React.createElement(Card, {
    key: r.id,
    className: "p-3.5"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onOpenDetail(r.id),
    className: "press-flat w-full text-left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-1.5 flex flex-wrap items-center gap-1.5"
  }, /*#__PURE__*/React.createElement(ModuleChip, {
    module: r.module
  }), r.topic && /*#__PURE__*/React.createElement(Chip, {
    className: "border-slate-200 bg-slate-50 text-slate-600"
  }, r.topic), r.saved ? /*#__PURE__*/React.createElement(Chip, {
    className: "border-brand-200 bg-brand-50 text-brand-700"
  }, "\uD83D\uDCCC \u9519\u9898\u672C") : /*#__PURE__*/React.createElement(Chip, {
    className: "border-slate-200 bg-white text-slate-400"
  }, "\u672A\u6536\u85CF"), r.status === 'correct' && /*#__PURE__*/React.createElement(Chip, {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700"
  }, "\uD83C\uDF93 \u5DF2\u638C\u63E1"), /*#__PURE__*/React.createElement("span", {
    className: "ml-auto text-[11px] text-slate-400"
  }, new Date(r.createdAt).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric'
  }))), /*#__PURE__*/React.createElement("div", {
    className: "line-clamp-2 text-sm text-slate-700"
  }, r.analysis?.error_summary || r.questionText?.slice(0, 60) || '（无题干）'), r.analysis?.error_types?.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "mt-2 flex flex-wrap gap-1"
  }, r.analysis.error_types.slice(0, 3).map(k => /*#__PURE__*/React.createElement(ErrorChip, {
    key: k,
    errKey: k
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 flex items-center justify-end gap-3 border-t border-slate-100 pt-2"
  }, !r.saved && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      patch(r.id, {
        saved: true
      });
      showToast('已加入错题本');
    },
    className: "rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700"
  }, "+ \u52A0\u5165\u9519\u9898\u672C"), r.saved && /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      patch(r.id, {
        saved: false
      });
      showToast('已移出错题本，仍保留在最近分析里');
    },
    className: "text-xs text-slate-400"
  }, "\u79FB\u51FA\u9519\u9898\u672C"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (confirm('确定删除这条记录？删除后无法恢复。')) {
        remove(r.id);
        showToast('已删除');
      }
    },
    className: "text-xs text-slate-400"
  }, "\u5220\u9664")))))));
}

/* ==========================================================================
 * §9 详情页（含错因修正、"问老师"追问、重做）
 * ========================================================================*/

/**
 * 错因修正器。
 * 为什么必须让用户能改：AI 归因一定会判错，而错因直接决定弱点报告，
 * 一处判错会污染整个统计。让用户一键纠正，比让 AI 更准更划算。
 */
function ErrorEditor({
  value = [],
  onChange
}) {
  const [open, setOpen] = useState(false);
  const toggle = key => {
    onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-sm font-semibold text-slate-500"
  }, "\u9519\u56E0\u5F52\u56E0"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(v => !v),
    className: "text-xs text-brand-600"
  }, open ? '收起' : 'AI 判错了？点这里改')), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, value.length === 0 && /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-slate-400"
  }, "\uFF08\u6CA1\u6709\u5F52\u56E0\u5230\u5177\u4F53\u9519\u56E0\uFF0C\u53EF\u624B\u52A8\u8865\u5145\uFF09"), value.map(k => /*#__PURE__*/React.createElement(ErrorChip, {
    key: k,
    errKey: k
  }))), open && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
  }, ERROR_GROUPS.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.title
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-1 text-xs font-medium text-slate-500"
  }, g.title), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, g.keys.map(k => {
    const on = value.includes(k);
    return /*#__PURE__*/React.createElement("button", {
      key: k,
      onClick: () => toggle(k),
      className: 'rounded-full border px-2.5 py-1 text-xs transition ' + (on ? 'border-brand-300 bg-brand-600 font-medium text-white' : 'border-slate-200 bg-white text-slate-600')
    }, on ? '✓ ' : '', ERROR_TYPES[k]?.name || k);
  })), value.some(k => g.keys.includes(k)) && /*#__PURE__*/React.createElement("div", {
    className: "mt-1.5 space-y-1"
  }, value.filter(k => g.keys.includes(k) && ERROR_TYPES[k]?.fix).map(k => /*#__PURE__*/React.createElement("div", {
    key: k,
    className: "text-xs text-slate-500"
  }, "\uD83D\uDC49 ", ERROR_TYPES[k].fix))))), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-slate-400"
  }, "\u6539\u5B8C\u7ACB\u523B\u751F\u6548\uFF0C\u5F31\u70B9\u62A5\u544A\u7684\u7EDF\u8BA1\u4F1A\u8DDF\u7740\u66F4\u65B0\u3002")));
}

/**
 * 重做这道题。
 * 隔几天回来重做做错的题，是最有效的复习方式。
 * 这里刻意先只显示题干（不给答案），你选完再揭晓。
 */
function RedoBlock({
  analysis,
  onRedo
}) {
  const [picked, setPicked] = useState(null);
  const opts = analysis.options || [];
  const correct = (analysis.correct_answer || '').trim().toUpperCase();
  const letter = o => (String(o).trim()[0] || '').toUpperCase();
  const hasAnswer = Boolean(correct);
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, opts.length > 0 ? /*#__PURE__*/React.createElement("div", {
    className: "space-y-1.5"
  }, opts.map((o, i) => {
    const L = letter(o);
    const isPicked = picked === L;
    const isRight = hasAnswer && L === correct;
    let cls = 'border-slate-200 bg-white text-slate-700';
    if (picked) {
      if (isRight) cls = 'border-emerald-300 bg-emerald-50 text-emerald-800';else if (isPicked) cls = 'border-rose-300 bg-rose-50 text-rose-800';else cls = 'border-slate-200 bg-white text-slate-400';
    }
    return /*#__PURE__*/React.createElement("button", {
      key: i,
      disabled: Boolean(picked),
      onClick: () => setPicked(L),
      className: 'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ' + cls
    }, o, picked && isRight && /*#__PURE__*/React.createElement("span", {
      className: "ml-2 text-xs"
    }, "\u2190 \u6B63\u786E\u7B54\u6848"), picked && isPicked && !isRight && /*#__PURE__*/React.createElement("span", {
      className: "ml-2 text-xs"
    }, "\u2190 \u4F60\u9009\u7684"));
  })) : /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-slate-50 p-3 text-sm text-slate-500"
  }, "\u8FD9\u9053\u9898\u6CA1\u6709\u5B58\u4E0B\u9009\u9879\uFF0C\u76F4\u63A5\u770B\u4E0B\u9762\u7684\u7B54\u6848\u81EA\u8BC4\u5427\u3002"), picked && /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 rounded-xl bg-slate-50 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-slate-700"
  }, "\u6B63\u786E\u7B54\u6848\uFF1A", /*#__PURE__*/React.createElement("b", {
    className: "text-emerald-600"
  }, correct || '未记录'), picked === correct ? /*#__PURE__*/React.createElement("span", {
    className: "ml-2 font-medium text-emerald-600"
  }, "\u2713 \u8FD9\u6B21\u5BF9\u4E86") : /*#__PURE__*/React.createElement("span", {
    className: "ml-2 font-medium text-rose-600"
  }, "\u2717 \u8FD8\u662F\u9519\u4E86")), /*#__PURE__*/React.createElement("button", {
    onClick: () => onRedo(picked === correct),
    className: "w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white"
  }, "\u8BB0\u5F55\u8FD9\u6B21\u7ED3\u679C")));
}
function DetailPage({
  id,
  onBack
}) {
  const {
    records,
    settings,
    patch
  } = useApp();
  const rec = records.find(r => r.id === id);
  const [thread, setThread] = useState(rec?.chat || []);
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState('');
  const [redoOpen, setRedoOpen] = useState(false);
  const [redoMsg, setRedoMsg] = useState('');
  if (!rec) {
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
      onClick: onBack,
      className: "mb-4 text-sm text-brand-600"
    }, "\u2190 \u8FD4\u56DE"), /*#__PURE__*/React.createElement(Empty, {
      title: "\u8BB0\u5F55\u4E0D\u5B58\u5728",
      desc: "\u53EF\u80FD\u5DF2\u88AB\u5220\u9664"
    }));
  }
  const analysis = rec.analysis || {};

  /** 改错因：同时更新记录本身和 analysis 里的数组，保证统计口径一致 */
  const setErrorTypes = types => {
    patch(rec.id, {
      analysis: {
        ...analysis,
        error_types: types
      },
      errorTypes: types
    });
  };

  /** 重做结果：对了就把这条标记为已掌握，错了则记一笔重做失败 */
  const onRedo = isCorrect => {
    const history = Array.isArray(rec.redoHistory) ? rec.redoHistory : [];
    patch(rec.id, {
      redoHistory: [...history, {
        at: Date.now(),
        correct: isCorrect
      }],
      status: isCorrect ? 'correct' : 'wrong'
    });
    setRedoMsg(isCorrect ? '✓ 已标记为掌握，弱点报告里会算作已解决' : '✗ 已记录，这道题还会留在你的错题本里');
    setRedoOpen(false);
  };
  const redoCount = rec.redoHistory?.length || 0;
  const redoRight = rec.redoHistory?.filter(h => h.correct).length || 0;
  const ask = async text => {
    const question = (text ?? q).trim();
    if (!question) return;
    setAsking(true);
    setErr('');
    const next = [...thread, {
      role: 'user',
      content: question
    }];
    setThread(next);
    setQ('');
    try {
      const answer = await aiAsk(settings, {
        analysis: rec.analysis,
        questionText: rec.questionText,
        history: thread,
        question
      });
      const full = [...next, {
        role: 'assistant',
        content: answer
      }];
      setThread(full);
      patch(rec.id, {
        chat: full
      });
    } catch (e) {
      setErr(e.message);
      setThread(thread);
    } finally {
      setAsking(false);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 pb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    className: "rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600"
  }, "\u2190 \u8FD4\u56DE"), /*#__PURE__*/React.createElement("span", {
    className: "text-sm text-slate-400"
  }, new Date(rec.createdAt).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }))), rec.analysis ? /*#__PURE__*/React.createElement(AnalysisResult, {
    analysis: rec.analysis,
    saved: rec.status === 'correct' ? 'mastered' : 'pending',
    showErrorFixes: false
  }) : /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "whitespace-pre-wrap text-sm text-slate-700"
  }, rec.questionText)), rec.analysis && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(ErrorEditor, {
    value: analysis.error_types || [],
    onChange: setErrorTypes
  })), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u91CD\u505A\u4E00\u904D"), redoCount > 0 && /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-400"
  }, "\u5DF2\u91CD\u505A ", redoCount, " \u6B21\uFF0C\u5BF9\u4E86 ", redoRight, " \u6B21")), redoMsg && /*#__PURE__*/React.createElement("div", {
    className: "mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
  }, redoMsg), redoOpen ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "mb-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
  }, analysis.question_text || rec.questionText), /*#__PURE__*/React.createElement(RedoBlock, {
    analysis: analysis,
    onRedo: onRedo
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setRedoOpen(false),
    className: "mt-2 w-full rounded-xl bg-slate-100 py-2.5 text-sm text-slate-600"
  }, "\u53D6\u6D88")) : /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setRedoMsg('');
      setRedoOpen(true);
    },
    className: "w-full rounded-xl border border-brand-200 bg-white py-2.5 text-sm font-medium text-brand-700"
  }, "\u906E\u4F4F\u7B54\u6848\uFF0C\u91CD\u505A\u8FD9\u9053\u9898")), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u95EE\u8001\u5E08"), thread.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "mb-3 flex flex-wrap gap-1.5"
  }, ['为什么这么快？', '换个更笨但更稳的解法', '这类题有什么通用套路？', '我错在哪一步？'].map(s => /*#__PURE__*/React.createElement("button", {
    key: s,
    onClick: () => ask(s),
    className: "rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-700"
  }, s))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, thread.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: 'rounded-xl p-3 text-sm leading-relaxed ' + (m.role === 'user' ? 'ml-6 bg-brand-50 text-brand-900' : 'mr-2 bg-slate-50 text-slate-700')
  }, m.content)), asking && /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-slate-400"
  }, "\u8001\u5E08\u6B63\u5728\u601D\u8003\u2026")), /*#__PURE__*/React.createElement(ErrorBox, {
    message: err
  }), /*#__PURE__*/React.createElement("div", {
    className: "mt-3 flex gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    value: q,
    onChange: e => setQ(e.target.value),
    onKeyDown: e => e.key === 'Enter' && ask(),
    placeholder: "\u7EE7\u7EED\u8FFD\u95EE\u2026",
    className: "flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ask(),
    disabled: asking || !q.trim(),
    className: "rounded-xl bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
  }, "\u53D1\u9001"))));
}

/* ==========================================================================
 * §10 弱点报告
 * ========================================================================*/

function WeaknessPage() {
  const {
    records,
    stats,
    settings,
    create
  } = useApp();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [goal, setGoal] = useState(() => localStorage.getItem('gk_goal') || '');
  useEffect(() => {
    localStorage.setItem('gk_goal', goal);
  }, [goal]);
  const run = async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await aiWeaknessReport(settings, {
        statsText: statsToText(stats),
        goal
      });
      setReport(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 空状态也要保留页面标题和说明，否则用户进来不知道这是哪个页面
  if (!records.length) {
    return /*#__PURE__*/React.createElement("div", {
      className: "space-y-4"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
      className: "text-xl font-bold text-slate-800"
    }, "\u5F31\u70B9\u62A5\u544A"), /*#__PURE__*/React.createElement("p", {
      className: "mt-0.5 text-sm text-slate-500"
    }, "\u6512\u591F\u9519\u9898\u540E\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u7EDF\u8BA1\u4F60\u7684\u9519\u56E0\u5206\u5E03\uFF0C\u5E76\u8BA9 AI \u7ED9\u51FA\u9636\u6BB5\u8BCA\u65AD")), /*#__PURE__*/React.createElement(Empty, {
      icon: "\uD83D\uDCCA",
      title: "\u8FD8\u6CA1\u6709\u6570\u636E\u53EF\u4EE5\u5206\u6790",
      desc: "\u5148\u5F55\u51E0\u9053\u9519\u9898\uFF0C\u8FD9\u91CC\u4F1A\u81EA\u52A8\u7EDF\u8BA1\u4F60\u7684\u9519\u56E0\u5206\u5E03\uFF0C\u5E76\u8BA9 AI \u7ED9\u51FA\u9636\u6BB5\u8BCA\u65AD\u3002"
    }), /*#__PURE__*/React.createElement("button", {
      onClick: () => buildDemoRecords(create),
      className: "mx-auto block rounded-xl border border-brand-200 bg-white px-5 py-2.5 text-sm font-medium text-brand-700"
    }, "\u5148\u7528\u793A\u4F8B\u6570\u636E\u770B\u770B\u957F\u4EC0\u4E48\u6837"));
  }
  const maxErr = Math.max(1, ...stats.errorRanking.map(e => e.count));
  const maxMod = Math.max(1, ...Object.values(stats.byModule));
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-bold text-slate-800"
  }, "\u5F31\u70B9\u62A5\u544A"), /*#__PURE__*/React.createElement("p", {
    className: "mt-0.5 text-sm text-slate-500"
  }, "\u57FA\u4E8E\u4F60\u5F55\u5165\u7684 ", stats.total, " \u9053\u9898\u81EA\u52A8\u7EDF\u8BA1")), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-4 gap-2"
  }, [{
    label: '累计题目',
    value: stats.total
  }, {
    label: '待攻克',
    value: stats.activeCount
  }, {
    label: '已掌握',
    value: stats.mastered
  }, {
    label: '错因种类',
    value: stats.errorRanking.length
  }].map(s => /*#__PURE__*/React.createElement(Card, {
    key: s.label,
    className: "p-3 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xl font-bold tabular-nums text-brand-600"
  }, s.value), /*#__PURE__*/React.createElement("div", {
    className: "mt-0.5 text-[11px] text-slate-500"
  }, s.label)))), stats.mastered > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "border-emerald-200 bg-emerald-50 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-emerald-800"
  }, "\uD83C\uDF93 \u5DF2\u638C\u63E1 ", /*#__PURE__*/React.createElement("b", null, stats.mastered), " \u9898\uFF08\u5360 ", stats.masteredPct, "%\uFF09\u2014\u2014 \u8FD9\u4E9B\u9898\u4E0D\u518D\u8BA1\u5165\u4E0B\u9762\u7684\u9519\u56E0\u7EDF\u8BA1\uFF0C\u6CBB\u597D\u7684\u6BDB\u75C5\u4E0D\u4F1A\u4E00\u76F4\u6302\u5728\u62A5\u544A\u4E0A\u3002")), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u8FD1 7 \u5929\u5F55\u5165\u91CF"), /*#__PURE__*/React.createElement(LineBars, {
    data: stats.days
  })), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, {
    extra: /*#__PURE__*/React.createElement("span", {
      className: "text-xs text-slate-400"
    }, "\u4EC5\u7EDF\u8BA1\u672A\u638C\u63E1\u7684\u9898")
  }, "\u9519\u56E0\u5206\u5E03\uFF08\u4F60\u7684\u75C5\u6839\uFF09"), stats.errorRanking.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-slate-500"
  }, "\u8FD8\u6CA1\u6709\u53EF\u7EDF\u8BA1\u7684\u9519\u56E0") : stats.errorRanking.map(e => /*#__PURE__*/React.createElement(BarRow, {
    key: e.key,
    label: errorName(e.key),
    count: e.count,
    max: maxErr,
    total: stats.total,
    color: "bg-rose-400"
  }))), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, {
    extra: /*#__PURE__*/React.createElement("span", {
      className: "text-xs text-slate-400"
    }, "\u4EC5\u7EDF\u8BA1\u672A\u638C\u63E1\u7684\u9898")
  }, "\u6A21\u5757\u5206\u5E03"), Object.entries(stats.byModule).map(([k, v]) => /*#__PURE__*/React.createElement(BarRow, {
    key: k,
    label: moduleOf(k).name,
    count: v,
    max: maxMod,
    total: stats.total,
    color: moduleOf(k).bar
  }))), stats.topicRanking.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u9AD8\u9891\u8003\u70B9 Top 10"), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, stats.topicRanking.slice(0, 10).map(t => /*#__PURE__*/React.createElement(Chip, {
    key: t.key,
    className: "border-slate-200 bg-slate-50 text-slate-600"
  }, t.key, " \xB7 ", t.count)))), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "AI \u9636\u6BB5\u8BCA\u65AD"), /*#__PURE__*/React.createElement("input", {
    value: goal,
    onChange: e => setGoal(e.target.value),
    placeholder: "\u6211\u7684\u76EE\u6807\uFF0C\u5982\uFF1A\u7701\u8003\u884C\u6D4B 75 \u5206 / \u8D44\u6599\u5206\u6790 30 \u5206\u949F\u505A\u5B8C",
    className: "mb-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement(ErrorBox, {
    message: err,
    onRetry: run
  }), /*#__PURE__*/React.createElement(PrimaryButton, {
    onClick: run,
    loading: loading,
    className: err ? 'mt-3' : ''
  }, loading ? '教练正在分析你的数据…' : report ? '重新生成诊断' : '生成阶段诊断'), report && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-brand-50 p-3 font-semibold text-brand-800"
  }, report.headline), (report.main_problems || []).map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "rounded-xl border border-slate-200 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-medium text-slate-800"
  }, i + 1, ". ", p.problem), p.evidence && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-sm text-slate-500"
  }, "\uD83D\uDCC8 ", p.evidence), p.impact && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-sm text-rose-600"
  }, "\uD83C\uDFAF ", p.impact), p.action && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-sm text-emerald-700"
  }, "\u2705 ", p.action))), report.priority_order?.length > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-1 text-sm font-semibold text-slate-600"
  }, "\u6CBB\u7597\u987A\u5E8F"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal space-y-1 pl-5 text-sm text-slate-700"
  }, report.priority_order.map((p, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, p)))), report.time_allocation?.length > 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-1 text-sm font-semibold text-slate-600"
  }, "\u65F6\u95F4\u5206\u914D\u5EFA\u8BAE"), report.time_allocation.map((t, i) => /*#__PURE__*/React.createElement(BarRow, {
    key: i,
    label: `${t.module} · ${t.reason || ''}`,
    count: t.percent,
    max: 100,
    suffix: "%",
    color: "bg-brand-500"
  }))), report.this_week_plan?.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-slate-50 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-1.5 text-sm font-semibold text-slate-700"
  }, "\u8FD9\u4E00\u5468\u600E\u4E48\u7EC3"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-1 text-sm text-slate-700"
  }, report.this_week_plan.map((p, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, p)))), report.warnings?.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-1 font-semibold"
  }, "\u26A0\uFE0F \u8981\u8B66\u60D5"), /*#__PURE__*/React.createElement("ul", {
    className: "list-disc space-y-1 pl-5"
  }, report.warnings.map((w, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, w)))), report.encouragement && /*#__PURE__*/React.createElement("div", {
    className: "text-sm italic text-slate-500"
  }, report.encouragement))));
}

/* ==========================================================================
 * §11 技巧库
 * ========================================================================*/

function TipsPage() {
  const {
    tips,
    addTip,
    removeTip
  } = useApp();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    module: 'data',
    title: '',
    when: '',
    how: '',
    caution: ''
  });
  const list = filter === 'all' ? tips : tips.filter(t => t.module === filter);
  const modsWithTips = MODULES.filter(m => tips.some(t => t.module === m.key));
  const submit = () => {
    if (!draft.title.trim()) return;
    addTip({
      module: draft.module,
      title: draft.title.trim(),
      when: draft.when.trim(),
      how: draft.how.split('\n').map(s => s.trim()).filter(Boolean),
      caution: draft.caution.trim()
    });
    setDraft({
      module: 'data',
      title: '',
      when: '',
      how: '',
      caution: ''
    });
    setAdding(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start justify-between"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-bold text-slate-800"
  }, "\u89E3\u9898\u6280\u5DE7\u5E93"), /*#__PURE__*/React.createElement("p", {
    className: "mt-0.5 text-sm text-slate-500"
  }, "\u5FEB\u89E3\u65B9\u6CD5\u901F\u67E5\uFF0C\u8003\u524D\u7FFB\u4E00\u904D")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setAdding(v => !v),
    className: "rounded-xl border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700"
  }, adding ? '取消' : '+ 新增')), adding && /*#__PURE__*/React.createElement(Card, {
    className: "space-y-3 p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex flex-wrap gap-1.5"
  }, MODULES.map(m => /*#__PURE__*/React.createElement("button", {
    key: m.key,
    onClick: () => setDraft({
      ...draft,
      module: m.key
    }),
    className: 'rounded-full border px-3 py-1.5 text-xs font-medium ' + (draft.module === m.key ? m.chip : 'border-slate-200 text-slate-500')
  }, m.name))), /*#__PURE__*/React.createElement("input", {
    value: draft.title,
    onChange: e => setDraft({
      ...draft,
      title: e.target.value
    }),
    placeholder: "\u65B9\u6CD5\u540D\uFF0C\u5982 \u5DEE\u5206\u6CD5\u6BD4\u8F83\u5206\u6570\u5927\u5C0F",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("input", {
    value: draft.when,
    onChange: e => setDraft({
      ...draft,
      when: e.target.value
    }),
    placeholder: "\u4EC0\u4E48\u65F6\u5019\u7528",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("textarea", {
    value: draft.how,
    onChange: e => setDraft({
      ...draft,
      how: e.target.value
    }),
    rows: 4,
    placeholder: "\u600E\u4E48\u505A\uFF08\u4E00\u884C\u4E00\u6B65\uFF09",
    className: "w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("input", {
    value: draft.caution,
    onChange: e => setDraft({
      ...draft,
      caution: e.target.value
    }),
    placeholder: "\u6CE8\u610F\u4EC0\u4E48",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement(PrimaryButton, {
    onClick: submit,
    disabled: !draft.title.trim()
  }, "\u4FDD\u5B58\u6280\u5DE7")), /*#__PURE__*/React.createElement("div", {
    className: "-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setFilter('all'),
    className: 'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === 'all' ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500')
  }, "\u5168\u90E8 ", tips.length), modsWithTips.map(m => /*#__PURE__*/React.createElement("button", {
    key: m.key,
    onClick: () => setFilter(m.key),
    className: 'flex-none rounded-full border px-3 py-1.5 text-xs font-medium ' + (filter === m.key ? m.chip : 'border-slate-200 bg-white text-slate-500')
  }, m.name))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, list.map(t => {
    const isOpen = open === t.id;
    return /*#__PURE__*/React.createElement(Card, {
      key: t.id,
      className: "overflow-hidden"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(isOpen ? null : t.id),
      className: "flex w-full items-center gap-2 p-3.5 text-left"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-lg"
    }, isOpen ? '▾' : '▸'), /*#__PURE__*/React.createElement("div", {
      className: "flex-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-medium text-slate-800"
    }, t.title), t.when && /*#__PURE__*/React.createElement("div", {
      className: "mt-0.5 text-xs text-slate-500"
    }, t.when)), /*#__PURE__*/React.createElement(ModuleChip, {
      module: t.module
    })), isOpen && /*#__PURE__*/React.createElement("div", {
      className: "border-t border-slate-100 bg-slate-50/60 p-3.5"
    }, t.how?.length > 0 && /*#__PURE__*/React.createElement("ol", {
      className: "list-decimal space-y-1.5 pl-5 text-sm text-slate-700"
    }, t.how.map((h, i) => /*#__PURE__*/React.createElement("li", {
      key: i
    }, h))), t.caution && /*#__PURE__*/React.createElement("div", {
      className: "mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800"
    }, "\u26A0\uFE0F ", t.caution), t.custom && /*#__PURE__*/React.createElement("button", {
      onClick: () => removeTip(t.id),
      className: "mt-2 text-xs text-slate-400 hover:text-rose-600"
    }, "\u5220\u9664\u8FD9\u6761")));
  })));
}

/* ==========================================================================
 * §12 申论批改
 * ========================================================================*/

function EssayPage({
  onBack
}) {
  const {
    settings,
    create
  } = useApp();
  const [mode, setMode] = useState('text');
  const [image, setImage] = useState(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  // 题型与满分：决定用哪套判分口径。国考大作文通常 35 或 40 分，
  // 不给分值的话模型会用百分制，你就没法对照真实考试成绩。
  const [essayType, setEssayType] = useState('大作文');
  const [scoreFull, setScoreFull] = useState('40');
  // 方法流派：申论可叠加两个包（白鹭方法论 + 国考评分标准）
  const [packId, setPackId] = useState('bailu-shenlun');
  const [rubricOn, setRubricOn] = useState(true);
  const fileRef = useRef(null);
  const onPick = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr('');
    try {
      setImage(await compressImage(f, 1800, 0.85));
      setResult(null);
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const run = async () => {
    setLoading(true);
    setErr('');
    try {
      let packPrompt = '';
      let packName = '';
      if (packId) {
        const pack = await loadPack(packId);
        if (pack) {
          packPrompt = packToPromptText(pack);
          packName = packsForSubject('essay').find(p => p.id === packId)?.name || '';
        }
      }

      // 评分标尺单独加载：它和"方法论"是两回事，可以只用其中一个
      let rubricPrompt = '';
      if (rubricOn) {
        const rubric = await loadPack('gk-shenlun-rubric');
        if (rubric) rubricPrompt = packToPromptText(rubric, {
          maxChars: 1800
        });
      }
      const r = await aiAnalyzeEssay(settings, {
        image: mode === 'photo' ? image : null,
        question,
        answer,
        reference,
        essayType,
        scoreFull: Number(scoreFull) || null,
        packPrompt,
        packName,
        rubricPrompt
      });
      setResult(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };
  const canRun = mode === 'photo' ? Boolean(image) : answer.trim().length > 20;
  const save = () => {
    if (!result) return;
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
        essay: result
      },
      source: 'essay'
    });
    onBack?.();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 pb-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    className: "rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600"
  }, "\u2190 \u8FD4\u56DE"), /*#__PURE__*/React.createElement("h1", {
    className: "text-lg font-bold text-slate-800"
  }, "\u7533\u8BBA\u6279\u6539")), /*#__PURE__*/React.createElement("div", {
    className: "flex rounded-xl bg-slate-100 p-1"
  }, [{
    k: 'text',
    label: '✍️ 粘贴作答'
  }, {
    k: 'photo',
    label: '📷 拍手写稿'
  }].map(t => /*#__PURE__*/React.createElement("button", {
    key: t.k,
    onClick: () => setMode(t.k),
    className: 'flex-1 rounded-lg py-2 text-sm font-medium transition ' + (mode === t.k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500')
  }, t.label))), mode === 'photo' && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: "image/*",
    capture: "environment",
    onChange: onPick,
    className: "hidden"
  }), image ? /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: "\u4F5C\u7B54",
    className: "max-h-80 w-full rounded-xl object-contain bg-slate-50"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => fileRef.current?.click(),
    className: "w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700"
  }, "\u91CD\u65B0\u62CD\u7167")) : /*#__PURE__*/React.createElement("button", {
    onClick: () => fileRef.current?.click(),
    className: "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-slate-500"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-3xl"
  }, "\uD83D\uDCF7"), /*#__PURE__*/React.createElement("span", {
    className: "font-medium"
  }, "\u62CD\u624B\u5199\u7B54\u6848"), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-400"
  }, "\u5B57\u8FF9\u6E05\u6670\u3001\u5149\u7EBF\u5747\u5300\uFF0C\u8BC6\u522B\u66F4\u51C6"))), /*#__PURE__*/React.createElement(Card, {
    className: "space-y-3 p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u9898\u76EE\u7C7B\u578B"), /*#__PURE__*/React.createElement("select", {
    value: essayType,
    onChange: e => {
      setEssayType(e.target.value);
      // 换题型时给个合理的默认满分，省得每次手改
      if (e.target.value === '大作文') setScoreFull('40');else setScoreFull('20');
    },
    className: "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }, ['大作文', '归纳概括', '综合分析', '提出对策', '贯彻执行'].map(t => /*#__PURE__*/React.createElement("option", {
    key: t,
    value: t
  }, t)))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u672C\u9898\u6EE1\u5206"), /*#__PURE__*/React.createElement("select", {
    value: scoreFull,
    onChange: e => setScoreFull(e.target.value),
    className: "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }, (essayType === '大作文' ? ['40', '35', '50'] : ['10', '15', '20', '25', '30']).map(s => /*#__PURE__*/React.createElement("option", {
    key: s,
    value: s
  }, s, " \u5206"))), /*#__PURE__*/React.createElement("p", {
    className: "mt-1 text-[11px] text-slate-400"
  }, "\u56FD\u8003\u5927\u4F5C\u6587\u901A\u5E38 35 \u6216 40 \u5206\uFF0C\u586B\u5BF9\u4E86\u624D\u80FD\u5BF9\u7167\u771F\u5B9E\u6210\u7EE9"))), /*#__PURE__*/React.createElement(MethodPicker, {
    module: "essay",
    subject: "essay",
    value: packId,
    onChange: setPackId
  }), /*#__PURE__*/React.createElement("label", {
    className: "flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-2.5"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: rubricOn,
    onChange: e => setRubricOn(e.target.checked),
    className: "mt-0.5 h-4 w-4 accent-blue-600"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-slate-600"
  }, "\u53E0\u52A0", /*#__PURE__*/React.createElement("b", null, "\u56FD\u8003\u8BC4\u5206\u6807\u51C6"), "\uFF08\u56DB\u7C7B\u6587\u5206\u6863 + \u4E94\u7EF4\u6743\u91CD + \u81F4\u547D\u6263\u5206\u70B9\uFF09", /*#__PURE__*/React.createElement("span", {
    className: "mt-0.5 block text-[11px] text-slate-400"
  }, "\u6CE8\uFF1A\u56FD\u5BB6\u516C\u52A1\u5458\u5C40\u4ECE\u672A\u516C\u5F00\u8FC7\u8BC4\u5206\u7EC6\u5219\uFF0C\u8FD9\u5957\u5206\u6863\u6807\u51C6\u662F\u57F9\u8BAD\u884C\u4E1A\u4F9D\u636E\u9605\u5377\u89C4\u5F8B\u5F52\u7EB3\u7684\u60EF\u4F8B\uFF0C\u4E0D\u662F\u5B98\u65B9\u6587\u4EF6"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u9898\u76EE\u8981\u6C42"), /*#__PURE__*/React.createElement("textarea", {
    value: question,
    onChange: e => setQuestion(e.target.value),
    rows: 3,
    placeholder: "\u5982\uFF1A\u6839\u636E\u7ED9\u5B9A\u8D44\u6599\uFF0C\u6982\u62EC\u2026\uFF08\u4E0D\u8D85\u8FC7 300 \u5B57\uFF09",
    className: "w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
  })), mode === 'text' && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u6211\u7684\u4F5C\u7B54"), /*#__PURE__*/React.createElement("textarea", {
    value: answer,
    onChange: e => setAnswer(e.target.value),
    rows: 10,
    placeholder: "\u628A\u5199\u597D\u7684\u7B54\u6848\u7C98\u8FDB\u6765\u2026",
    className: "w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u53C2\u8003\u7B54\u6848 / \u8BC4\u5206\u6807\u51C6\uFF08\u9009\u586B\uFF0C\u586B\u4E86\u6279\u6539\u66F4\u51C6\uFF09"), /*#__PURE__*/React.createElement("textarea", {
    value: reference,
    onChange: e => setReference(e.target.value),
    rows: 3,
    placeholder: "\u6709\u53C2\u8003\u7B54\u6848\u5C31\u8D34\u4E0A\uFF0C\u8001\u5E08\u4F1A\u544A\u8BC9\u4F60\u5DEE\u5728\u54EA",
    className: "w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-brand-500"
  }))), /*#__PURE__*/React.createElement(ErrorBox, {
    message: err,
    onRetry: canRun ? run : null
  }), /*#__PURE__*/React.createElement(PrimaryButton, {
    onClick: run,
    disabled: !canRun,
    loading: loading
  }, loading ? '阅卷人正在批改…' : '开始批改'), result && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 pt-2"
  }, /*#__PURE__*/React.createElement(Card, {
    className: "p-4 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-slate-500"
  }, result.essay_type), /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-4xl font-bold tabular-nums text-brand-600"
  }, result.score, /*#__PURE__*/React.createElement("span", {
    className: "text-lg text-slate-400"
  }, " / ", result.score_full)), result.grade && /*#__PURE__*/React.createElement("div", {
    className: "mt-1"
  }, /*#__PURE__*/React.createElement(Chip, {
    className: "border-brand-200 bg-brand-50 text-brand-700"
  }, result.grade))), result.dimension_scores?.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u5206\u9879\u5F97\u5206"), result.dimension_scores.map((d, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "border-b border-slate-100 py-2 last:border-0"
  }, /*#__PURE__*/React.createElement(BarRow, {
    label: d.name,
    count: d.score,
    max: d.full,
    suffix: `${d.score}/${d.full}`,
    color: "bg-brand-500"
  }), d.comment && /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-slate-500"
  }, d.comment)))), result.missing_points?.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "border-rose-200 bg-rose-50 p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u6F0F\u6389\u7684\u91C7\u5206\u70B9\uFF08\u6700\u81F4\u547D\uFF09"), /*#__PURE__*/React.createElement("ul", {
    className: "space-y-1 text-sm text-rose-800"
  }, result.missing_points.map((p, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("span", null, "\u2717"), /*#__PURE__*/React.createElement("span", null, p))))), result.line_comments?.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u9010\u53E5\u70B9\u8BC4"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, result.line_comments.map((c, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "rounded-xl border border-slate-200 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm italic text-slate-500"
  }, "\u300C", c.quote, "\u300D"), c.problem && /*#__PURE__*/React.createElement("div", {
    className: "mt-1.5 text-sm text-rose-600"
  }, "\u2717 ", c.problem), c.better && /*#__PURE__*/React.createElement("div", {
    className: "mt-1 text-sm text-emerald-700"
  }, "\u2713 ", c.better))))), result.structure_advice && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u7ED3\u6784\u600E\u4E48\u8C03"), /*#__PURE__*/React.createElement("div", {
    className: "whitespace-pre-wrap text-sm text-slate-700"
  }, result.structure_advice)), result.top_fixes?.length > 0 && /*#__PURE__*/React.createElement(Card, {
    className: "border-emerald-200 bg-emerald-50 p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u6700\u8BE5\u5148\u6539\u7684 3 \u4EF6\u4E8B"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal space-y-1 pl-5 text-sm text-emerald-900"
  }, result.top_fixes.map((f, i) => /*#__PURE__*/React.createElement("li", {
    key: i
  }, f)))), result.rewrite_sample && /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u793A\u8303\u6539\u5199"), /*#__PURE__*/React.createElement("div", {
    className: "whitespace-pre-wrap text-sm text-slate-700"
  }, result.rewrite_sample)), result.note_card && /*#__PURE__*/React.createElement(Card, {
    className: "border-amber-200 bg-amber-50 p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u8FD9\u9053\u9898\u7684\u65B9\u6CD5\u8BBA"), /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-amber-900"
  }, result.note_card)), /*#__PURE__*/React.createElement("button", {
    onClick: save,
    className: "w-full rounded-xl bg-slate-100 py-3 text-sm font-medium text-slate-700"
  }, "\u5B58\u5165\u8BB0\u5F55")));
}

/* ==========================================================================
 * §13 设置页（API Key、备份、部署说明）
 * ========================================================================*/

function SettingsPage() {
  const {
    settings,
    updateSettings,
    records,
    reload,
    stats,
    clearAllRecords,
    showToast
  } = useApp();
  const [draft, setDraft] = useState(settings);
  const [msg, setMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [testingVision, setTestingVision] = useState(false);
  const [showKey, setShowKey] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const save = () => {
    updateSettings(draft);
    setMsg('已保存');
    setTimeout(() => setMsg(''), 2000);
  };
  const test = async () => {
    setTesting(true);
    setMsg('');
    try {
      const content = await callChat({
        ...draft
      }, [{
        role: 'user',
        content: '只回复两个字：可以'
      }], {
        json: false,
        maxTokens: 20,
        retries: 0
      });
      setMsg('✓ 连接成功，模型回复：' + content.trim().slice(0, 20));
    } catch (e) {
      setMsg('✗ ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  /**
   * 专门测「能不能读图」。
   * 用一张内嵌的小图，让模型只回复两个字 —— 能返回就说明读图链路通了。
   * 比只测文字更能说明问题：很多模型文字能用，一给图片就报 400。
   */
  const testVision = async () => {
    setTestingVision(true);
    setMsg('');
    try {
      const probe = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAWklEQVR4nO3RMQ0AMAwDMLP/pks/' + 'vBJA0i3JAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgbQFP8QAB' + 'lKvBoQAAAABJRU5ErkJggg==';
      const content = await callChat({
        ...draft
      }, [{
        role: 'user',
        content: [{
          type: 'image_url',
          image_url: {
            url: probe
          }
        }, {
          type: 'text',
          text: '这张图是什么颜色？只回复两个字。'
        }]
      }], {
        json: false,
        maxTokens: 20,
        retries: 0,
        model: draft.visionModel,
        target: visionTarget(draft)
      });
      setMsg('✓ 读图成功，模型看到：' + content.trim().slice(0, 20));
    } catch (e) {
      setMsg('✗ 读图失败：' + e.message);
    } finally {
      setTestingVision(false);
    }
  };
  const doExport = () => {
    const data = {
      app: 'gongkao-coach',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: {
        ...settings,
        apiKey: ''
      },
      records
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `考公错题备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('已导出备份文件，建议存到网盘或微信收藏');
  };

  /**
   * 生成纯文字版错题报告。
   * 为什么需要：JSON 备份是给程序用的，人看不了。手机上想复习、
   * 想复制到备忘录或发给研友，纯文本最方便。
   */
  const buildTextReport = () => {
    const lines = [];
    lines.push(`考公错题本 · ${new Date().toLocaleDateString('zh-CN')}`);
    lines.push(`共 ${stats.total} 题，待攻克 ${stats.activeCount} 题，已掌握 ${stats.mastered} 题`);
    if (stats.errorRanking.length) {
      lines.push('');
      lines.push('【错因排行】');
      stats.errorRanking.forEach((e, i) => {
        lines.push(`${i + 1}. ${errorName(e.key)} —— ${e.count} 次（${e.pct}%）`);
        const fix = ERROR_TYPES[e.key]?.fix;
        if (fix) lines.push(`   → ${fix}`);
      });
    }
    const active = records.filter(r => r.status !== 'correct');
    if (active.length) {
      lines.push('');
      lines.push('【待攻克题目】');
      active.forEach((r, i) => {
        const a = r.analysis || {};
        lines.push('');
        lines.push(`${i + 1}. [${moduleOf(r.module).name}] ${a.topic || r.topic || ''}`);
        if (a.error_summary) lines.push(`   错因：${a.error_summary}`);
        if (a.fast_solution?.name) lines.push(`   快解：${a.fast_solution.name}`);
        if (a.note_card) lines.push(`   记住：${a.note_card}`);
      });
    }
    return lines.join('\n');
  };
  const copyReport = async () => {
    const text = buildTextReport();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setMsg(`✓ 已复制 ${text.length} 字到剪贴板，去备忘录粘一下`);
      } else {
        // 鸿蒙/旧浏览器可能没有 clipboard API，退回到 textarea 方案
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setMsg(`✓ 已复制 ${text.length} 字到剪贴板`);
      }
    } catch (e) {
      setMsg('✗ 复制失败：' + e.message + '（可以改用「导出备份」）');
    }
  };
  const doImport = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data) ? data : data.records;
        if (!Array.isArray(incoming)) throw new Error('格式不对');
        const ids = new Set(records.map(r => r.id));
        const fresh = incoming.filter(r => r?.id && !ids.has(r.id)).map(r => ({
          saved: true,
          updatedAt: r.updatedAt || Date.now(),
          ...r
        }));
        if (fresh.length) await dbPutRecords(fresh);
        await reload();
        setMsg(`导入成功，新增 ${fresh.length} 条`);
      } catch (err) {
        setMsg('✗ 导入失败：' + err.message);
      }
    };
    reader.readAsText(f);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4 pb-6"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-bold text-slate-800"
  }, "\u8BBE\u7F6E"), /*#__PURE__*/React.createElement("p", {
    className: "mt-0.5 text-sm text-slate-500"
  }, "Key \u53EA\u5B58\u5728\u8FD9\u53F0\u8BBE\u5907\u4E0A\uFF0C\u4E0D\u4F1A\u4E0A\u4F20\u5230\u4EFB\u4F55\u670D\u52A1\u5668")), msg && /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-brand-50 p-3 text-sm text-brand-800"
  }, msg), /*#__PURE__*/React.createElement(Card, {
    className: "space-y-3 p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "AI \u6A21\u578B"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "API Key"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("input", {
    type: showKey ? 'text' : 'password',
    value: draft.apiKey,
    onChange: e => setDraft({
      ...draft,
      apiKey: e.target.value
    }),
    placeholder: "sk-...",
    className: "flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowKey(v => !v),
    className: "rounded-xl bg-slate-100 px-3 text-sm text-slate-600"
  }, showKey ? '隐藏' : '显示')), /*#__PURE__*/React.createElement("p", {
    className: "mt-1.5 text-xs text-slate-500"
  }, "\u53BB platform.deepseek.com \u6CE8\u518C \u2192 API Keys \u2192 \u521B\u5EFA\u4E00\u4E2A\uFF0C\u5145 10 \u5757\u94B1\u80FD\u7528\u5F88\u4E45\u3002")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u63A5\u53E3\u5730\u5740\uFF08\u4E00\u822C\u4E0D\u7528\u6539\uFF09"), /*#__PURE__*/React.createElement("input", {
    value: draft.baseUrl,
    onChange: e => setDraft({
      ...draft,
      baseUrl: e.target.value
    }),
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u6587\u5B57\u6A21\u578B\uFF08\u7528\u6765\u5206\u6790\u548C\u6279\u6539\uFF09"), /*#__PURE__*/React.createElement("input", {
    value: draft.model,
    onChange: e => setDraft({
      ...draft,
      model: e.target.value
    }),
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  })), /*#__PURE__*/React.createElement("div", {
    className: "border-t border-slate-100 pt-3"
  }, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\uD83D\uDCF7 \u770B\u56FE\u6A21\u578B\uFF08\u62CD\u7167\u8BC6\u9898\u7528\uFF0C\u53EF\u9009\uFF09"), /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-amber-50 p-3 text-xs text-amber-800"
  }, /*#__PURE__*/React.createElement("b", null, "DeepSeek \u76EE\u524D\u4E0D\u652F\u6301\u8BFB\u56FE"), "\uFF0C\u6240\u4EE5\u300C\u62CD\u7167\u8BC6\u9898\u300D\u8981\u53E6\u5916\u63A5\u4E00\u5BB6\u80FD\u770B\u56FE\u7684\u6A21\u578B\u3002 \u4E0D\u914D\u4E5F\u80FD\u7528 \u2014\u2014 \u6539\u7528\u300C\u7C98\u8D34\u6587\u5B57\u300D\u6A21\u5F0F\u5373\u53EF\uFF08\u7C89\u7B14 App \u91CC\u7684\u9898\u53EF\u4EE5\u76F4\u63A5\u590D\u5236\uFF09\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 flex flex-wrap gap-1.5"
  }, VISION_PRESETS.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.name,
    onClick: () => setDraft({
      ...draft,
      visionBaseUrl: p.baseUrl,
      visionModel: p.model
    }),
    className: 'rounded-full border px-2.5 py-1.5 text-xs ' + (draft.visionModel === p.model && draft.visionBaseUrl === p.baseUrl ? 'border-brand-300 bg-brand-50 font-medium text-brand-700' : 'border-slate-200 bg-white text-slate-500')
  }, p.name))), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 space-y-2"
  }, /*#__PURE__*/React.createElement("input", {
    value: draft.visionBaseUrl,
    onChange: e => setDraft({
      ...draft,
      visionBaseUrl: e.target.value
    }),
    placeholder: "\u770B\u56FE\u6A21\u578B\u7684\u63A5\u53E3\u5730\u5740\uFF0C\u5982 https://dashscope.aliyuncs.com/compatible-mode",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("input", {
    value: draft.visionModel,
    onChange: e => setDraft({
      ...draft,
      visionModel: e.target.value
    }),
    placeholder: "\u770B\u56FE\u6A21\u578B\u540D\uFF0C\u5982 qwen-vl-max",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("input", {
    type: showKey ? 'text' : 'password',
    value: draft.visionApiKey,
    onChange: e => setDraft({
      ...draft,
      visionApiKey: e.target.value
    }),
    placeholder: "\u770B\u56FE\u6A21\u578B\u7684 API Key\uFF08\u548C\u4E0A\u9762\u662F\u540C\u4E00\u5BB6\u5C31\u4E0D\u7528\u586B\uFF09",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("button", {
    onClick: testVision,
    disabled: testingVision || !draft.visionModel,
    className: "w-full rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
  }, testingVision ? '正在让模型看图…' : '测试能否读图'))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "label"
  }, "\u4EE3\u7406\u5730\u5740\uFF08\u53EF\u9009\uFF0C\u8FDB\u9636\uFF09"), /*#__PURE__*/React.createElement("input", {
    value: draft.proxyUrl,
    onChange: e => setDraft({
      ...draft,
      proxyUrl: e.target.value
    }),
    placeholder: "https://xxx.workers.dev",
    className: "w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
  }), /*#__PURE__*/React.createElement("p", {
    className: "mt-1.5 text-xs text-slate-500"
  }, "\u586B\u4E86\u4E4B\u540E Key \u4EA4\u7ED9\u4EE3\u7406\u4FDD\u7BA1\uFF0C\u524D\u7AEF\u4E0D\u518D\u5B58 Key\u3002\u90E8\u7F72\u7ED9\u522B\u4EBA\u7528\u65F6\u5EFA\u8BAE\u914D\u4E0A\u3002")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: save,
    className: "flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white"
  }, "\u4FDD\u5B58"), "          ", /*#__PURE__*/React.createElement("button", {
    onClick: test,
    disabled: testing,
    className: "flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
  }, testing ? '测试中…' : '测试连接'))), /*#__PURE__*/React.createElement(Card, {
    className: "space-y-3 p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u6570\u636E\u4E0E\u5907\u4EFD"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-slate-600"
  }, "\u6570\u636E\u5168\u90E8\u5B58\u5728\u8FD9\u53F0\u8BBE\u5907\u7684\u6D4F\u89C8\u5668\u91CC\uFF0C", /*#__PURE__*/React.createElement("b", null, "\u4E0D\u4F1A\u4E0A\u4F20"), "\u3002\u6240\u4EE5\u6E05\u7F13\u5B58\u3001\u6362\u624B\u673A\u3001\u6362\u6D4F\u89C8\u5668\u90FD\u4F1A\u4E22\uFF0C \u8BF7\u5B9A\u671F\u5BFC\u51FA\u5907\u4EFD\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: doExport,
    className: "flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white"
  }, "\u5BFC\u51FA\u5907\u4EFD"), /*#__PURE__*/React.createElement("label", {
    className: "flex-1 cursor-pointer rounded-xl bg-slate-100 py-2.5 text-center text-sm font-medium text-slate-700"
  }, "\u5BFC\u5165\u5907\u4EFD", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "application/json",
    onChange: doImport,
    className: "hidden"
  }))), /*#__PURE__*/React.createElement("button", {
    onClick: copyReport,
    disabled: !records.length,
    className: "w-full rounded-xl border border-brand-200 bg-white py-2.5 text-sm font-medium text-brand-700 disabled:opacity-50"
  }, "\u590D\u5236\u6587\u5B57\u7248\u9519\u9898\u672C\uFF08\u65B9\u4FBF\u7C98\u5230\u5907\u5FD8\u5F55\uFF09"), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-slate-500"
  }, "\u5F53\u524D\u5171 ", records.length, " \u6761\u8BB0\u5F55"), /*#__PURE__*/React.createElement("div", {
    className: "rounded-xl bg-slate-50 p-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm font-medium text-slate-700"
  }, "\u60F3\u5148\u770B\u770B\u300C\u5F31\u70B9\u62A5\u544A\u300D\u957F\u4EC0\u4E48\u6837\uFF1F"), /*#__PURE__*/React.createElement("p", {
    className: "mt-1 text-xs text-slate-500"
  }, "\u8F7D\u5165 18 \u6761\u793A\u4F8B\u9519\u9898\uFF0C\u53EF\u4EE5\u7ACB\u523B\u770B\u5230\u9519\u56E0\u5206\u5E03\u3001\u6A21\u5757\u7EDF\u8BA1\u548C 7 \u5929\u8D8B\u52BF\u3002\u770B\u5B8C\u53EF\u4EE5\u4E00\u952E\u6E05\u7A7A\u3002"), /*#__PURE__*/React.createElement("div", {
    className: "mt-2 flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      buildDemoRecords(create);
      setMsg('已载入示例数据，去「弱点」页看看');
      setTimeout(() => setMsg(''), 3000);
    },
    className: "flex-1 rounded-xl border border-brand-200 bg-white py-2 text-sm font-medium text-brand-700"
  }, "\u8F7D\u5165\u793A\u4F8B\u6570\u636E"), /*#__PURE__*/React.createElement("button", {
    onClick: async () => {
      if (!confirm('确定清空所有记录？此操作不可撤销，建议先导出备份。')) return;
      await clearAllRecords();
      showToast('已清空所有记录');
    },
    className: "flex-1 rounded-xl border border-rose-200 bg-white py-2 text-sm font-medium text-rose-600"
  }, "\u6E05\u7A7A\u6240\u6709\u8BB0\u5F55")))), /*#__PURE__*/React.createElement(Card, {
    className: "p-4"
  }, /*#__PURE__*/React.createElement(SectionTitle, null, "\u5728\u624B\u673A\u4E0A\u4F7F\u7528"), /*#__PURE__*/React.createElement("ol", {
    className: "list-decimal space-y-2 pl-5 text-sm text-slate-600"
  }, /*#__PURE__*/React.createElement("li", null, "\u628A\u8FD9\u4E2A\u9879\u76EE\u90E8\u7F72\u5230 Cloudflare Pages \u6216 GitHub Pages\uFF08\u63A8\u4EE3\u7801\u5373\u53EF\uFF0C\u4E0D\u9700\u8981\u6784\u5EFA\uFF09\u3002"), /*#__PURE__*/React.createElement("li", null, "\u624B\u673A\u6D4F\u89C8\u5668\u6253\u5F00\u7F51\u5740\uFF0C\u7528\u6D4F\u89C8\u5668\u83DC\u5355\u91CC\u7684\u300C\u6DFB\u52A0\u5230\u684C\u9762\u300D\uFF0C\u56FE\u6807\u5C31\u50CF App \u4E00\u6837\u3002"), /*#__PURE__*/React.createElement("li", null, "\u9E3F\u8499\u81EA\u5E26\u6D4F\u89C8\u5668\u4E0A\uFF0C\u684C\u9762\u56FE\u6807\u53EF\u80FD\u4F1A\u5E26\u5730\u5740\u680F\uFF0C\u5C5E\u4E8E\u7CFB\u7EDF\u9650\u5236\uFF0C\u529F\u80FD\u4E0D\u53D7\u5F71\u54CD\u3002"))), /*#__PURE__*/React.createElement("div", {
    className: "pb-4 text-center text-xs text-slate-400"
  }, "\u8003\u516C\u505A\u9898\u5206\u6790\u5668 \xB7 \u6570\u636E\u672C\u5730\u4F18\u5148 \xB7 \u613F\u4F60\u4E0A\u5CB8"));
}

/* ==========================================================================
 * §14 全局状态 + 应用外壳
 * ========================================================================*/

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);
function AppProvider({
  children
}) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [records, setRecords] = useState([]);
  const [customTips, setCustomTips] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [migratedCount, setMigratedCount] = useState(0);
  // 全局提示条：任何操作完成后都给一个看得见的确认，避免「我点到了吗」
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((message, kind = 'ok') => {
    setToast({
      message,
      kind
    });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // 启动时：先迁移旧数据（一次性），再从 IndexedDB 读出来
  useEffect(() => {
    let alive = true;
    (async () => {
      let moved = 0;
      try {
        moved = await migrateFromLocalStorage();
      } catch (e) {
        console.warn('旧数据迁移失败（不影响使用）', e);
      }
      const [s, r, t] = await Promise.all([dbGetSettings(), dbGetRecords(), dbGetCustomTips()]);
      if (!alive) return;
      if (s) setSettings(cur => ({
        ...cur,
        ...s
      }));
      setRecords(Array.isArray(r) ? r : []);
      setCustomTips(Array.isArray(t) ? t : []);
      setMigratedCount(moved);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 设置和技巧都是小对象，变化时整体写回（量小，不必精打细算）
  useEffect(() => {
    if (hydrated) dbSaveSettings(settings);
  }, [settings, hydrated]);
  useEffect(() => {
    if (hydrated) dbSaveCustomTips(customTips);
  }, [customTips, hydrated]);
  const updateSettings = useCallback(p => setSettings(s => ({
    ...s,
    ...p
  })), []);

  /**
   * 新增一条记录。
   * 注意：现在**每次分析都会调用它** —— 分析完就留档，不管有没有加入错题本。
   * saved 字段区分「只是分析过」和「已加入错题本」。
   */
  const create = useCallback(rec => {
    const now = Date.now();
    const full = {
      id: `r_${now}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
      status: 'wrong',
      saved: false,
      ...rec
    };
    // createdAt 允许被显式指定（示例数据要铺在最近几天，好让趋势图有内容）
    setRecords(rs => [full, ...rs]);
    dbPutRecord(full);
    return full;
  }, []);
  const patch = useCallback((id, p) => {
    setRecords(rs => rs.map(r => {
      if (r.id !== id) return r;
      const next = {
        ...r,
        ...p,
        updatedAt: Date.now()
      };
      dbPutRecord(next);
      return next;
    }));
  }, []);
  const remove = useCallback(id => {
    setRecords(rs => rs.filter(r => r.id !== id));
    dbDeleteRecord(id);
  }, []);
  const reload = useCallback(async () => {
    const r = await dbGetRecords();
    setRecords(Array.isArray(r) ? r : []);
  }, []);
  const clearAllRecords = useCallback(async () => {
    await dbClearRecords();
    setRecords([]);
  }, []);
  const addTip = useCallback(tip => {
    const full = {
      ...tip,
      id: `t_custom_${Date.now()}`,
      custom: true
    };
    setCustomTips(t => [...t, full]);
    return full;
  }, []);
  const removeTip = useCallback(id => setCustomTips(t => t.filter(x => x.id !== id)), []);
  const tips = useMemo(() => [...BUILTIN_TIPS, ...customTips], [customTips]);
  const stats = useMemo(() => computeStats(records), [records]);
  const value = {
    settings,
    updateSettings,
    records,
    setRecords,
    create,
    patch,
    remove,
    reload,
    clearAllRecords,
    stats,
    tips,
    addTip,
    removeTip,
    hydrated,
    migratedCount,
    toast,
    showToast
  };
  return /*#__PURE__*/React.createElement(AppContext.Provider, {
    value: value
  }, children, /*#__PURE__*/React.createElement(ToastBar, {
    toast: toast
  }));
}

/** 底部提示条。挂在 AppProvider 里，所以任何页面都能触发 */
function ToastBar({
  toast
}) {
  if (!toast) return null;
  const ok = toast.kind !== 'error';
  return /*#__PURE__*/React.createElement("div", {
    className: "pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: 'gk-toast max-w-md rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ' + (ok ? 'bg-slate-800/95 text-white' : 'bg-rose-600/95 text-white')
  }, ok ? '✓ ' : '⚠️ ', toast.message));
}
const TABS = [{
  key: 'capture',
  label: '分析',
  icon: '📷'
}, {
  key: 'records',
  label: '记录',
  icon: '📋'
}, {
  key: 'weakness',
  label: '弱点',
  icon: '📊'
}, {
  key: 'tips',
  label: '技巧',
  icon: '📚'
}, {
  key: 'settings',
  label: '设置',
  icon: '⚙️'
}];
function Shell() {
  const {
    settings,
    hydrated,
    migratedCount,
    showToast
  } = useApp();
  const [tab, setTab] = useState('capture');
  const [detailId, setDetailId] = useState(null);
  const [essayOpen, setEssayOpen] = useState(false);
  useEffect(() => {
    if (!settings.apiKey && !settings.proxyUrl) {
      // 每个会话只自动跳一次设置页。
      // 否则用户每次切回分析页都会被弹走，非常烦；
      // 而"这次会话已经引导过了"用 sessionStorage 记着就够了。
      try {
        if (sessionStorage.getItem('gk_guided')) return;
        sessionStorage.setItem('gk_guided', '1');
      } catch {
        // 隐私模式下 sessionStorage 可能不可用，那就每次都引导
      }
      setTab('settings');
    }
  }, [settings.apiKey, settings.proxyUrl]);

  // 旧版本数据迁移完成后提示一次，让用户知道东西没丢
  useEffect(() => {
    if (hydrated && migratedCount > 0) {
      showToast(`已把 ${migratedCount} 条旧记录迁移到新存储`);
    }
  }, [hydrated, migratedCount, showToast]);

  // IndexedDB 是异步的，首次进来要等一下，避免闪一下空数据
  if (!hydrated) {
    return /*#__PURE__*/React.createElement("div", {
      className: "flex min-h-screen items-center justify-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand-600"
    }), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 text-sm text-slate-500"
    }, "\u6B63\u5728\u8BFB\u53D6\u672C\u5730\u6570\u636E\u2026")));
  }
  let body;
  if (essayOpen) {
    body = /*#__PURE__*/React.createElement(EssayPage, {
      onBack: () => setEssayOpen(false)
    });
  } else if (detailId) {
    body = /*#__PURE__*/React.createElement(DetailPage, {
      id: detailId,
      onBack: () => setDetailId(null)
    });
  } else if (tab === 'capture') {
    body = /*#__PURE__*/React.createElement(CapturePage, {
      onOpenDetail: setDetailId,
      gotoEssay: () => setEssayOpen(true)
    });
  } else if (tab === 'records') {
    body = /*#__PURE__*/React.createElement(RecordsPage, {
      onOpenDetail: setDetailId
    });
  } else if (tab === 'weakness') {
    body = /*#__PURE__*/React.createElement(WeaknessPage, null);
  } else if (tab === 'tips') {
    body = /*#__PURE__*/React.createElement(TipsPage, null);
  } else {
    body = /*#__PURE__*/React.createElement(SettingsPage, null);
  }
  const hideNav = essayOpen || Boolean(detailId);
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-slate-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto max-w-2xl px-4 pb-28 pt-4"
  }, body), !hideNav && /*#__PURE__*/React.createElement("nav", {
    className: "fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mx-auto flex max-w-2xl pb-[env(safe-area-inset-bottom)]"
  }, TABS.map(t => {
    const active = tab === t.key;
    return /*#__PURE__*/React.createElement("button", {
      key: t.key,
      onClick: () => setTab(t.key),
      "aria-current": active ? 'page' : undefined,
      className: 'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition ' + (active ? 'font-semibold text-brand-600' : 'text-slate-400')
    }, active && /*#__PURE__*/React.createElement("span", {
      className: "absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-600"
    }), /*#__PURE__*/React.createElement("span", {
      className: 'text-lg leading-none ' + (active ? 'scale-110' : '')
    }, t.icon), t.label);
  }))));
}

/**
 * 错误边界。
 * 万一某个页面渲染时报错，不至于整个 App 白屏 —— 至少还能看到原因、
 * 有一键导出备份的入口（数据比界面重要）。
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }
  static getDerivedStateFromError(error) {
    return {
      error
    };
  }
  componentDidCatch(error, info) {
    console.error('页面渲染出错：', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return /*#__PURE__*/React.createElement("div", {
      className: "mx-auto max-w-2xl p-6"
    }, /*#__PURE__*/React.createElement("div", {
      className: "rounded-2xl border border-rose-200 bg-rose-50 p-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-lg font-bold text-rose-800"
    }, "\u9875\u9762\u51FA\u9519\u4E86"), /*#__PURE__*/React.createElement("p", {
      className: "mt-1 text-sm text-rose-700"
    }, "\u4F60\u7684\u6570\u636E\u8FD8\u5728\uFF0C\u6CA1\u6709\u88AB\u7834\u574F\u3002\u53EF\u4EE5\u5148\u5BFC\u51FA\u5907\u4EFD\uFF0C\u518D\u5237\u65B0\u9875\u9762\u91CD\u8BD5\u3002"), /*#__PURE__*/React.createElement("pre", {
      className: "mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-xs text-rose-700"
    }, String(this.state.error?.message || this.state.error)), /*#__PURE__*/React.createElement("div", {
      className: "mt-3 flex gap-2"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: async () => {
        try {
          const all = await dbGetRecords();
          const raw = JSON.stringify({
            app: 'gongkao-coach',
            version: 2,
            records: all || []
          }, null, 2);
          const blob = new Blob([raw], {
            type: 'application/json'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `考公错题备份_${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          alert('导出失败：' + e.message);
        }
      },
      className: "rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white"
    }, "\u5BFC\u51FA\u5907\u4EFD"), /*#__PURE__*/React.createElement("button", {
      onClick: () => location.reload(),
      className: "rounded-xl bg-white px-4 py-2 text-sm font-medium text-rose-700"
    }, "\u5237\u65B0\u91CD\u8BD5"))));
  }
}
function Root() {
  return /*#__PURE__*/React.createElement(ErrorBoundary, null, /*#__PURE__*/React.createElement(AppProvider, null, /*#__PURE__*/React.createElement(Shell, null)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Root, null));