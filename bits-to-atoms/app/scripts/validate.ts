/**
 * 터미널에서 모든 컬렉션(인터랙션·엔터테크)의 사례 파일을 검증한다: npm run validate
 * 스키마 오류나 규칙 error가 하나라도 있으면 exit 1.
 * 게시 번호 중복 같은 비교 규칙은 컬렉션 안에서만 적용한다.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadCases } from '../server/store.ts'
import { COLLECTIONS, COLLECTION_KEYS, type CollectionKey } from '../src/lib/collections.ts'
import { casesOf } from '../src/lib/types.ts'
import { checkCase, countsTowardArchive } from '../src/lib/validate.ts'

const DATA_ROOT = path.resolve(import.meta.dirname, '../../data')
const MARK = { error: 'ERR ', warn: 'WARN', info: 'INFO' } as const

/** 컬렉션 하나를 검사해 출력하고 error 개수를 돌려준다. */
async function validateCollection(key: CollectionKey): Promise<number> {
  const { label, dir } = COLLECTIONS[key]
  const dataDir = path.join(DATA_ROOT, dir)
  console.log(`\n━━ ${label} (data/${dir}) ━━`)
  if (!existsSync(dataDir)) {
    console.log('  폴더 없음 — 건너뜀')
    return 0
  }
  const entries = await loadCases(dataDir)
  const cases = casesOf(entries)
  let errorCount = 0

  for (const entry of entries) {
    if (entry.error) {
      errorCount += 1
      console.log(`\n✗ ${entry.file}\n  ${entry.error.replaceAll('\n', '\n  ')}`)
      continue
    }
    const c = entry.case!
    const issues = checkCase(c, cases)
    errorCount += issues.filter((i) => i.level === 'error').length
    console.log(`\n${issues.some((i) => i.level === 'error') ? '✗' : '✓'} ${c.id}  ${c.title}  [${c.stage}]`)
    for (const i of issues) console.log(`  ${MARK[i.level]} ${i.field}: ${i.message}`)
  }

  console.log(`\n${label}: ${entries.length}개 파일 · 아카이브 산입 ${cases.filter(countsTowardArchive).length}개 · 오류 ${errorCount}개`)
  return errorCount
}

let total = 0
for (const key of COLLECTION_KEYS) total += await validateCollection(key)
console.log(`\n전체 오류 ${total}개`)
process.exitCode = total > 0 ? 1 : 0
