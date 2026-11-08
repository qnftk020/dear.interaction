/**
 * 원고 작성 이후 단계의 사례를 지침 8절 형식 마크다운 한 파일로 모은다.
 * npm run export -- <출력 파일명>   (기본: exports/letters.md)
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadCases } from '../server/store.ts'
import { candidateTable, toMarkdown } from '../src/lib/carousel.ts'
import { casesOf } from '../src/lib/types.ts'
import { stageIndex } from '../src/lib/validate.ts'

const ROOT = path.resolve(import.meta.dirname, '../..')
const fileName = process.argv[2] ?? 'letters.md'
const outPath = path.join(ROOT, 'exports', path.basename(fileName))

const cases = casesOf(await loadCases(path.join(ROOT, 'data/cases')))
const drafted = cases.filter((c) => stageIndex(c.stage) >= stageIndex('원고 작성') && c.scope !== 'HOLD' && c.scope !== 'EXCLUDED')

const header = [`# dear.interaction — 러브레터 원고 모음 (${drafted.length}건)`, '## 후보 표', candidateTable(drafted)].join('\n\n')
const body = [header, ...drafted.map((c) => toMarkdown(c, cases))].join('\n\n---\n\n')

await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, `${body}\n`, 'utf8')
console.log(`${drafted.length}건 → ${path.relative(ROOT, outPath)}`)
