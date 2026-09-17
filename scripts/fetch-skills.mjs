/**
 * 抓取外部 skill 仓库的参考文档到本地 vendor-skills/。
 *
 * 为什么需要这个脚本：
 *   GitHub 的 skill 仓库按 SKILL.md + references/ 组织，内容几万到几十万字。
 *   直接塞进 app.jsx（单文件）会让体积爆炸，所以这里的做法是：
 *   把原始文档下载到一个独立目录留档、供人工审阅与提炼，
 *   **不直接进入应用包**；应用只加载提炼后的技能包。
 *
 * 关于许可：只抓取明确带 MIT 等宽松许可的仓库（脚本里会校验）。
 *   无 LICENSE 的仓库默认「保留所有权利」，不要用它。
 *
 * 用法：node scripts/fetch-skills.mjs
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'vendor-skills')

/** 只允许 MIT / Apache / BSD 这类宽松许可 */
const ALLOWED_LICENSES = ['mit', 'apache-2.0', 'bsd-2-clause', 'bsd-3-clause']

const SOURCES = [
  {
    id: 'shenlun-skill',
    repo: 'coffe-d/Shenlun.skill',
    branch: 'master',
    // 只抓方法论、规则、模板；真题库太大且非必需
    paths: [
      'README.md',
      'skills/shenlun-xiaoti/SKILL.md',
      'skills/shenlun-xiaoti/references/bai-lu-methodology.md',
      'skills/shenlun-xiaoti/references/xiaoma-methodology.md',
      'skills/shenlun-xiaoti/references/scoring-rules.md',
      'skills/shenlun-xiaoti/references/writing-rules.md',
      'skills/shenlun-dawenti/SKILL.md',
      'skills/shenlun-dawenti/references/yuan-dong-methodology.md',
      'skills/shenlun-dawenti/references/fallback-eval-rules.md',
      'skills/shenlun-router/SKILL.md',
      'skills/shenlun-router/references/prediction-methodology.md',
      'skills/shared/references/expression-upgrade-rules.md',
      'skills/shared/references/error-bank-rules.md',
    ],
  },
]

const GH = 'https://api.github.com'

async function getJson(url) {
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'gongkao-coach-fetch' },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.json()
}

async function main() {
  mkdirSync(outDir, { recursive: true })

  for (const src of SOURCES) {
    console.log(`\n=== ${src.repo} ===`)

    // 先校验许可，不合规就整个仓库跳过
    const meta = await getJson(`${GH}/repos/${src.repo}`)
    const lic = meta.license?.spdx_id?.toLowerCase() || null
    console.log(`许可：[${lic || '无'}]  star=${meta.stargazers_count}`)
    if (!lic || !ALLOWED_LICENSES.includes(lic)) {
      console.warn(`✗ 许可不允许分发，跳过整个仓库（默认保留所有权利）`)
      continue
    }

    const destDir = join(outDir, src.id)
    mkdirSync(destDir, { recursive: true })

    let ok = 0
    for (const p of src.paths) {
      try {
        const data = await getJson(
          `${GH}/repos/${src.repo}/contents/${p}?ref=${src.branch}`,
        )
        const text = Buffer.from(data.content, 'base64').toString('utf8')
        const flat = p.replace(/\//g, '__')
        writeFileSync(join(destDir, flat), text, 'utf8')
        console.log(`  ✓ ${p}  (${(text.length / 1024).toFixed(1)} KB)`)
        ok++
      } catch (e) {
        console.warn(`  ✗ ${p}  ${e.message}`)
      }
    }
    console.log(`  完成 ${ok}/${src.paths.length}`)
  }

  console.log(`\n原始文档已存到 vendor-skills/（仅供人工审阅与提炼，不进应用包）`)
  console.log(`注意：这些是第三方文档，提炼后的技能包要标注来源与许可。`)
}

main().catch((e) => {
  console.error('失败：' + e.message)
  process.exit(1)
})
