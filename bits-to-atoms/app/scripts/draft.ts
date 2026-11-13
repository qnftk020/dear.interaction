/**
 * 원고 일괄 생성 (지침 5-1: 조사는 Claude, 글은 Codex).
 * '검증 완료' 단계이고 원고 칸이 전부 빈 사례를 Codex에 넘겨 빈 칸만 채우고 '원고 작성'으로 옮긴다.
 *   node scripts/draft.ts entertech            — 컬렉션 전체
 *   node scripts/draft.ts entertech BT-E-015   — 지정한 사례만
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runCodex } from '../server/codex.ts'
import { buildDraftPrompt, extractGuide, mergeDraft, needsDraft, parseDraft } from '../server/draft.ts'
import { loadCases, saveCase } from '../server/store.ts'
import { COLLECTIONS, type CollectionKey } from '../src/lib/collections.ts'
import { isVerified } from '../src/lib/derive.ts'
import type { Case } from '../src/lib/schema.ts'

const CONCURRENCY = 3
const [collection = 'entertech', ...ids] = process.argv.slice(2)
if (!(collection in COLLECTIONS)) throw new Error(`컬렉션은 ${Object.keys(COLLECTIONS).join(' | ')} 중 하나여야 합니다.`)

const dir = path.resolve(import.meta.dirname, '../../data', COLLECTIONS[collection as CollectionKey].dir)
const guideFile = path.resolve(import.meta.dirname, '../../../dear_interaction_Claude_Project_Instructions.md')
const guide = extractGuide(readFileSync(guideFile, 'utf8'))

const isTarget = (c: Case): boolean =>
  c.stage === '검증 완료' && isVerified(c) && needsDraft(c) && (ids.length === 0 || ids.includes(c.id))

const targets = (await loadCases(dir)).flatMap((e) => (e.case && isTarget(e.case) ? [e.case] : []))
console.log(`대상 ${targets.length}건: ${targets.map((c) => c.id).join(', ') || '없음'}`)

async function draftOne(c: Case): Promise<boolean> {
  try {
    const draft = parseDraft(await runCodex(buildDraftPrompt(c, guide)))
    await saveCase(dir, { ...mergeDraft(c, draft), stage: '원고 작성' })
    console.log(`✓ ${c.id} ${c.title}`)
    return true
  } catch (e) {
    console.error(`✗ ${c.id} ${c.title}\n  ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

const queue = [...targets]
const results: boolean[] = []
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let c = queue.shift(); c; c = queue.shift()) results.push(await draftOne(c))
  }),
)
const failed = results.filter((ok) => !ok).length
console.log(`완료 ${results.length - failed}건 · 실패 ${failed}건`)
if (failed > 0) process.exitCode = 1
