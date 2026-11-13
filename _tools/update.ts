/**
 * 이미 게시된 스냅샷(data.enc.json)에 엔터테크 사례와 '2026 리서치' 요약을 더해 다시 암호화한다.
 * build.ts는 2026-11-08 검증 실행 폴더(VERIFY)가 있어야 하므로, 그 폴더 없이 고칠 때 쓴다.
 *   DASH_PIN=… APP=<main 체크아웃>/bits-to-atoms/app OUT=. COMMIT=<sha> node _tools/update.ts
 * 기존 사례의 검증 기록(논문·그림·접근 확인)은 그대로 두고, YAML에서 온 칸만 새로 읽는다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { webcrypto as crypto } from 'node:crypto'

const { DASH_PIN, OUT, COMMIT = '' } = process.env
const APP = process.env.APP && path.resolve(process.env.APP)
if (!DASH_PIN || !APP || !OUT) throw new Error('DASH_PIN, APP, OUT 필요')
const imp = (p: string) => import(pathToFileURL(path.join(APP, p)).href)
const { loadCases } = await imp('server/store.ts')
const { checkCase, countsTowardArchive } = await imp('src/lib/validate.ts')
const { EVIDENCE_ROWS } = await imp('src/lib/schema.ts')
const { parse } = createRequire(path.join(APP, 'package.json'))('yaml')

const DATA = path.resolve(APP, '../data')
const ENC_FILE = path.join(OUT, 'data.enc.json')
const ITER = 600_000
const RESEARCH_FILE = path.join(DATA, 'entertech', '_research-2026.yaml')
const SCHEDULE_FILE = path.join(DATA, 'entertech', '_schedule-2026.yaml')
const DAY_MS = 86_400_000
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')
const unb64 = (s: string) => Buffer.from(s, 'base64')
const text = new TextEncoder()

async function deriveKey(salt: Uint8Array, iterations: number, usage: 'encrypt' | 'decrypt') {
  const base = await crypto.subtle.importKey('raw', text.encode(DASH_PIN), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [usage])
}

async function decryptPayload(): Promise<any> {
  const e = JSON.parse(readFileSync(ENC_FILE, 'utf8'))
  const key = await deriveKey(unb64(e.salt), e.iterations, 'decrypt')
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv) }, key, unb64(e.data))
    return JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new Error('기존 스냅샷을 풀지 못했습니다. DASH_PIN이 맞는지 확인하세요.')
  }
}

async function encryptPayload(payload: unknown) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(salt, ITER, 'encrypt')
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, text.encode(JSON.stringify(payload))))
  writeFileSync(ENC_FILE, JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iterations: ITER, salt: b64(salt), iv: b64(iv), data: b64(ct) }))
  return ct.length
}

/** YAML에서 오는 칸. 검증 실행 결과(verify·find·quotes·access·ars)는 여기 없다. */
function yamlFields(c: any, collection: string, all: any[]) {
  return {
    id: c.id, collection, title: c.title, creator: c.creator, year: c.year, location: c.location, context: c.context,
    status: c.status, summary: c.summary_ko, object: c.physical_object, input: c.input, output: c.output, mechanism: c.mechanism,
    stage: c.stage, scope: c.scope, letter: c.letter_no, source: c.source_primary, snapshot: c.archive_snapshot,
    counted: countsTowardArchive(c),
    evidence: Object.entries(EVIDENCE_ROWS).map(([k, label]) => ({ label, status: c.evidence[k].status, url: c.evidence[k].url, note: c.evidence[k].note })),
    media: c.media.map((m: any) => ({ url: m.url, credit: m.credit, permission: m.permission })),
    carousel: c.carousel, caption: c.caption.text, hashtags: c.caption.hashtags,
    issues: checkCase(c, all).map((i: any) => ({ level: i.level, field: i.field, message: i.message })),
    insight: c.ad_insight, idea: c.what_if, facts: c.notes.fact,
  }
}
const NO_RUN = { verify: null, find: { status: 'n/a', label: '논문 사례 아님' }, quotes: [], captured: 0, ars: null, access: null }

const payload = await decryptPayload()
const research = parse(readFileSync(RESEARCH_FILE, 'utf8'))
const regionOf = (id: string) => (research.regions.domestic.includes(id) ? 'domestic' : research.regions.overseas.includes(id) ? 'overseas' : null)
const before = new Map<string, any>(payload.cases.map((c: any) => [c.id, c]))

const COLS = [{ key: 'interaction', dir: 'cases' }, { key: 'entertech', dir: 'entertech' }]
const cases: any[] = []
for (const col of COLS) {
  const loaded = (await loadCases(path.join(DATA, col.dir))).flatMap((e: any) => (e.case ? [e.case] : []))
  for (const c of loaded) {
    const old = before.get(c.id)
    const cls = old?.cls ?? { ...(research.cls[c.id] ?? { grade: '?', basis: '미분류' }), verified: false }
    cases.push({ ...NO_RUN, ...old, ...yamlFields(c, col.key, loaded), cls, region: regionOf(c.id) })
  }
}

const plan = parse(readFileSync(SCHEDULE_FILE, 'utf8'))
const startMs = Date.parse(`${plan.start}T00:00:00Z`)
const schedule = { start: plan.start, items: plan.order.map((id: string, n: number) => ({ id, date: new Date(startMs + n * DAY_MS).toISOString().slice(0, 10) })) }
const unknownIds = schedule.items.filter((it: any) => !cases.some((c) => c.id === it.id)).map((it: any) => it.id)
if (unknownIds.length > 0) throw new Error(`일정에 없는 사례 id가 있습니다: ${unknownIds.join(', ')}`)

const added = cases.filter((c) => !before.has(c.id))
const y2026 = cases.filter((c) => c.region)
const hold = y2026.filter((c) => c.stage === '출처 확인 중' || c.stage === '발견').map((c) => c.id)
const drafted = y2026.filter((c) => c.stage === '원고 작성').map((c) => c.id)
const NEW_TASKS = [
  { id: 'd-copy-2026', group: 'decide', pri: 1, title: `2026 엔터테크 원고 ${drafted.length}건 — 읽고 고칠 곳 알려 주기`, how: 'Codex가 쓴 6장 원고와 캡션입니다. 말투·농담·WHAT IF가 마음에 드는지 봐 주세요. 번호는 아직 배정하지 않았습니다.', cases: drafted },
  { id: 'f-2026-hold', group: 'find', pri: 2, title: `2026 엔터테크 후보 ${hold.length}건 — 관객이 무엇을 하는지·공식 출처`, how: '관객의 행동이나 공식 페이지가 확인되지 않아 원고를 쓰지 않았습니다. 다녀온 곳이나 꼭 넣고 싶은 것을 알려 주시면 먼저 확인합니다.', cases: hold },
  { id: 'd-letter-no', group: 'decide', pri: 1, title: '엔터테크 러브레터 번호를 어떻게 매길지', how: `${schedule.start}부터 하루 1건 올리려면 LOVE LETTER 번호가 필요합니다. 지금은 전부 번호 미배정입니다.`, options: ['기존 인터랙션 번호에 이어서', '엔터테크만 따로 001부터'] },
]
const tasks = [...payload.tasks.filter((t: any) => !NEW_TASKS.some((n) => n.id === t.id)), ...NEW_TASKS]

const next = {
  ...payload, generatedAt: new Date().toISOString(), commit: COMMIT || payload.commit, cases, tasks, schedule,
  research: { title: research.title, checkedAt: research.checked_at, note: research.note, insights: research.insights, tech: research.tech },
}
const bytes = await encryptPayload(next)
console.log(`cases=${cases.length} (+${added.length}) tasks=${tasks.length} scheduled=${schedule.items.length} insights=${research.insights.length} tech=${research.tech.length} bytes=${bytes}`)
