/**
 * 데일리 기록 검증. data/daily/*.yaml을 모두 읽어 형식과 규칙을 확인한다 (문제가 있으면 exit 1).
 *   node scripts/daily.ts
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { checkDaily, dailySchema } from '../src/lib/daily.ts'

const dir = path.resolve(import.meta.dirname, '../../data/daily')
const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.yaml$/.test(f)).sort()

let bad = 0
for (const file of files) {
  let problems: string[]
  try {
    const result = dailySchema.safeParse(parse(readFileSync(path.join(dir, file), 'utf8')))
    problems = result.success
      ? checkDaily(result.data, file)
      : result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
  } catch (e) {
    problems = [`YAML을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`]
  }
  if (problems.length > 0) bad++
  console.log(`${problems.length ? '✗' : '✓'} ${file}`)
  for (const p of problems) console.log(`  ${p}`)
}
console.log(`데일리 ${files.length}일치 · 문제 있는 날 ${bad}`)
if (bad > 0) process.exitCode = 1
