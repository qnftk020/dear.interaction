/**
 * 학술 출판 자동 검증을 터미널에서 돌린다.
 *   npm run verify                 # 연구·논문으로 보이는 사례 전부
 *   npm run verify -- BT-A-005     # 지정한 사례만
 * 결과는 data/verification/<id>.json, 그림·PDF 사본은 data/figures/<id>/ 에 저장된다.
 */
import path from 'node:path'
import { loadCases } from '../server/store.ts'
import { verifyCase } from '../server/verify.ts'
import { COLLECTIONS, COLLECTION_KEYS } from '../src/lib/collections.ts'
import { looksAcademic, VERDICT_LABELS } from '../src/lib/scholar.ts'
import { casesOf } from '../src/lib/types.ts'

const DATA_ROOT = path.resolve(import.meta.dirname, '../../data')
const DIRS = {
  reports: path.join(DATA_ROOT, 'verification'),
  figures: path.join(DATA_ROOT, 'figures'),
  uploads: path.join(DATA_ROOT, 'verification', 'uploads'),
}
const MARK = { pass: '✓', warn: '!', fail: '✗', skip: '·' } as const

const ids = process.argv.slice(2).filter((a) => a.startsWith('BT-'))
const all = (await Promise.all(COLLECTION_KEYS.map(async (k) => casesOf(await loadCases(path.join(DATA_ROOT, COLLECTIONS[k].dir)))))).flat()
const targets = ids.length ? all.filter((c) => ids.includes(c.id)) : all.filter(looksAcademic)

console.log(`검증 대상 ${targets.length}건\n`)
for (const c of targets) {
  process.stdout.write(`━━ ${c.id} ${c.title}\n`)
  try {
    const r = await verifyCase(c, DIRS)
    console.log(`   ⇒ ${VERDICT_LABELS[r.verdict]} — ${r.headline}`)
    for (const ch of r.checks) console.log(`   ${MARK[ch.state]} ${ch.label}: ${ch.detail}`)
    if (r.figures.length) console.log(`   Figure: ${r.figures.map((f) => (f.no ? `Fig.${f.no}` : `p.${f.page}`)).join(', ')}`)
  } catch (e) {
    console.log(`   ✗ 실패: ${e instanceof Error ? e.message : e}`)
  }
  console.log('')
}
