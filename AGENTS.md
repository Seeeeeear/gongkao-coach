# 项目约定（所有子任务必须遵守）

## 这是什么
「考公做题分析器」—— **不是题库 App**，而是**做题分析器 + AI 私教**。
用户已经把粉笔、华图、纸质真题刷完了，痛点是**没人给他做错因分析**。
产品价值链：拍题/粘题 → AI 单题深度分析（考点 + 最快解法 + 错因归因）→ 错因归档统计 → 阶段弱点报告 → 申论批改。

用户背景（做设计决策时请考虑）：
- 全职备考，强度很大（每天 50 题以上）
- 主要用**华为鸿蒙 6 手机**，其次**安卓平板**
- 数据必须**只存本机**，不上云；提供一键导出备份
- AI 用自己的 DeepSeek API Key，月预算 20 元以内

## 技术栈（已装好，不要更换）
- **免构建**：Vite/esbuild 在当前沙箱无法运行（`spawn EPERM`），已全部移除。
- 源码是**单个文件 `app.jsx`**（JSX + 全局 React UMD），由 `scripts/build.mjs` 编译成 `app.js`。
- `app.jsx` 内**不允许出现 `import`/`export`**（Babel standalone 以普通脚本编译），全部靠文件内声明。
- 样式：Tailwind 3 预编译成 `styles.css`；改样式类后要跑 `npm run css`。
- 无后端、无路由库：页面切换用 `useState` + props 回调。
- 数据存 **IndexedDB**（`gongkao_coach` 库，settings / records 两个 store），
  不再用 localStorage；旧 localStorage 数据在启动时自动迁移并清理。
- 触摸反馈写在 `src-css/input.css` 的原生 CSS 里，**不要依赖 Tailwind 的 `active:` 变体**
  （部分移动浏览器触发不稳定）。

## 数据模型要点
- `record.saved`：`true` = 已加入错题本，`false` = 只是分析过（自动留档）。
  **每次分析都会 create() 一条**，加入错题本时用 `patch(id, { saved: true })` 复用同一条，
  绝不重复入库。
- `record.status`：`correct` 表示已掌握，**不计入弱点统计**。
- `record.redoHistory`：重做记录数组。
- 统计口径：只有未掌握的题参与错因/模块/考点统计。

## 文件职责
```
app.jsx                  唯一源码（§1 错因体系 §2 技巧库 §3 存储 §4 AI §5 示例数据 §6 组件 §7-13 页面 §14 外壳）
app.js                   自动生成，禁止手改
index.html               入口（含 Service Worker 注册）
styles.css               Tailwind 产物
sw.js                    Service Worker，离线缓存（改代码后记得升 VERSION）
manifest.webmanifest     PWA 清单
404.html / .nojekyll     GitHub Pages 用
_headers                 Cloudflare Pages 缓存策略
cloudflare-worker.example.js  可选的 Key 代理（公开给别人用时才需要）
scripts/build.mjs        app.jsx → app.js（npm run build / watch）
scripts/check.mjs        语法校验
scripts/verify-render.mjs jsdom 真实渲染验证（改完必跑）
scripts/vendor.mjs       复制 React 到 vendor/
scripts/fetch-skills.mjs 抓第三方 skill 原始文档到 vendor-skills/（已 gitignore）
skills/index.json        技能包索引（仅供参考，实际索引内联在 app.jsx）
skills/packs/*.json      方法流派包（按需加载，每个 8-12KB）
src-css/input.css        Tailwind 源样式
server.mjs               零依赖静态服务器
```

## 方法流派（技能包）系统
- **索引内联、内容按需**：`SKILLS_INDEX` 直接写在 app.jsx 里（约 2KB）；
  各流派内容在 `skills/packs/*.json`（每个 8-12KB），用 `loadPack(id)` 按需 fetch，
  并缓存到 IndexedDB 的 `skills` store（**离线可用**）。
- **不要把流派内容内联进 app.jsx** —— 会让首屏体积暴涨，也违背按需加载的设计。
- 新增流派的流程：
  1. 写 `skills/packs/<id>.json`
  2. 在 `SKILLS_INDEX.packs` 加一条索引（含 subject / file / license / triggers）
  3. 跑 `npm run verify`
- **许可纪律**：只收录 MIT/Apache/BSD 等宽松许可的来源。
  无 LICENSE 的仓库默认「保留所有权利」，**不要收录其内容**；
  需要占位时用 `disabled: true` + `file: null`（见索引里的 huasheng13-data）。
  每个包必须写清 `license` / `source` / `attribution`。
- **证据分级纪律（申论包尤其重要）**：白鹭包里区分 `verified` / `partial` / `unverified`。
  标 `unverified` 的条目（如「综合分析＝3W 十六字方针」）**不得用于扣分**，
  也不得说成「某老师的方法」。改这些文件时不要破坏这个分级。
- **诚实标注**：国考评分标准包里有 `honestyNote` —— 国家公务员局从未公开评分细则，
  那些分档是培训行业归纳的惯例。批改时必须如实说明，不得冒充官方标准。
- `packToPromptText(pack)` 负责把包压成提示词片段（默认截到 2800 字）。
  包变大时要调整压缩逻辑，不要整包塞进 prompt。

## 改动流程（务必遵守）
1. 只改 `app.jsx`（或 `src-css/input.css`、`tailwind.config.js`）
2. 跑 `npm run verify` —— 它会编译、校验语法、并用 jsdom + fake-indexeddb 真实渲染一遍
   （逐个点开 5 个 tab、点示例分析、验证自动留档/收藏/双视图计数/IndexedDB 落盘）
3. 改了 Tailwind 类或配置，再跑 `npm run css`
4. **改了 app.js / styles.css 后必须把 `sw.js` 里的 `VERSION` 加一**，
   否则手机上一直加载旧缓存，你会以为改动没生效
5. `npm run verify` 需要 `fake-indexeddb` —— jsdom 不带 IndexedDB，
   测试脚本里必须注入，否则应用启动会失败

## 硬性约束
1. **移动端优先**：单列布局、点击区域够大、字号不小于 12px，适配底部安全区。
2. **中文文案**：像一个懂考公的助教说话，不要机器翻译腔，不要空话套话。
3. **不引入新依赖**；不要用图表库 —— 图表用纯 div + Tailwind 画条形图（见 `BarRow`/`LineBars`）。
4. 不用 `<form>` 提交，用按钮 `onClick`。
5. 配色：素雅白底 + `brand-600`（蓝）重点色，文字用 slate 系。
6. AI 调用失败必须把原因友好显示出来，并给「重试」按钮。
7. 不要删改 `ERROR_TYPES` 里已有的 key（会导致历史记录统计断裂）；新增可以。

## 关键 API
```js
const { settings, updateSettings, records, create, patch, remove, reload, stats, tips, addTip, removeTip } = useApp()
```
- `create(record)` 新增记录，形如 `{ module, topic, questionText, userAnswer, correctAnswer, status, analysis, source }`
- `stats` = `{ total, byModule, errorRanking:[{key,count,pct}], topicRanking:[{key,count}], days:[{label,count}] }`
- 错因与模块：`ERROR_TYPES`、`ERROR_GROUPS`、`MODULES`、`errorName()`、`moduleOf()`
- AI：`aiAnalyzeQuestion()`、`aiAnalyzeEssay()`、`aiWeaknessReport()`、`aiAsk()`、`compressImage()`
