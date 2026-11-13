/**
 * 데일리 기록 하루치를 메일 파일로 만든다 (보내는 일은 tools/daily-mail.ps1이 한다).
 *   node scripts/daily-mail.ts <날짜 YYYY-MM-DD> <출력 폴더>
 * 출력: subject.txt, body.html, body.txt (모두 UTF-8)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { checkDaily, dailySchema } from '../src/lib/daily.ts'
import { renderDailyMail } from '../src/lib/dailyMail.ts'

const DASHBOARD_URL = 'https://qnftk020.github.io/dear.interaction/#daily'
const [date, outDir] = process.argv.slice(2)
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !outDir) throw new Error('사용법: node scripts/daily-mail.ts <YYYY-MM-DD> <출력 폴더>')

const file = `${date}.yaml`
const daily = dailySchema.parse(parse(readFileSync(path.resolve(import.meta.dirname, '../../data/daily', file), 'utf8')))
const problems = checkDaily(daily, file)
if (problems.length > 0) throw new Error(`검증에 통과하지 못한 기록은 보내지 않습니다:\n${problems.join('\n')}`)

const mail = renderDailyMail(daily, DASHBOARD_URL)
mkdirSync(outDir, { recursive: true })
writeFileSync(path.join(outDir, 'subject.txt'), mail.subject, 'utf8')
writeFileSync(path.join(outDir, 'body.html'), mail.html, 'utf8')
writeFileSync(path.join(outDir, 'body.txt'), mail.text, 'utf8')
console.log(mail.subject)
