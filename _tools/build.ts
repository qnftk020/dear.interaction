/**
 * dear.interaction 대시보드(GitHub Pages) 데이터 빌드.
 * 저장소 YAML + 자동 검증 보고서 + 2026-11-08 검증 실행 결과를 하나로 묶고, PIN으로 암호화한다.
 *   DASH_PIN=… APP=<repo>/bits-to-atoms/app VERIFY=<verify-all> OUT=<site> node build.ts
 * PIN은 코드·결과물 어디에도 남지 않는다 (PBKDF2로 키를 만들어 AES-GCM 암호화에만 쓴다).
 */
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { webcrypto as crypto } from 'node:crypto'

const { DASH_PIN, APP, VERIFY, OUT, COMMIT = '' } = process.env
if (!DASH_PIN || !APP || !VERIFY || !OUT) throw new Error('DASH_PIN, APP, VERIFY, OUT 필요')
const imp = (p: string) => import(pathToFileURL(path.join(APP, p)).href)
const { loadCases } = await imp('server/store.ts')
const { checkCase, countsTowardArchive } = await imp('src/lib/validate.ts')
const { STAGES, EVIDENCE_ROWS, LETTER_TOTAL } = await imp('src/lib/schema.ts')
const sharp = createRequire(path.join(APP, 'package.json'))('sharp')

const DATA = path.resolve(APP, '../data')
const j = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const step4 = j(path.join(VERIFY, 'step4.json')).results as Record<string, any>
const step5 = j(path.join(VERIFY, 'step5.json')) as any[]
// 2026-11-08 Simon이 브라우저로 받아 준 PDF (ACM)
const userIds = existsSync(path.join(VERIFY, 'in-user', 'identity.json')) ? j(path.join(VERIFY, 'in-user', 'identity.json')) : {}
const saved = existsSync(path.join(VERIFY, 'saved.json')) ? j(path.join(VERIFY, 'saved.json')) : {}
const access = Object.fromEntries(step5.map(([id, , host, http, note, wb]) => [id, { host, http, note, wayback: wb }]))

// ── 분류 초안 (2026-11-08 대화에서 만든 안 + 원문 대조 결과) ─────────────
const G = (grade: string, basis: string, verified = false) => ({ grade, basis, verified })
const CLS: Record<string, ReturnType<typeof G>> = {
  'BT-A-001': G('T1', '병을 열면 소리, 테이블에 색 빛 배면 투사 (SIGGRAPH 1999 p1)', true),
  'BT-A-002': G('T1', '테이블 아래 IR 카메라가 fiducial 마커 추적 → 테이블 표면에 투사 (TEI ’07 p4)', true),
  'BT-A-003': G('T1', '단어 타일·노브·페이더 → 기기 위 ePaper에 LLM 응답 (C&C ’26 p2–3)', true),
  'BT-A-004': G('T1', '사진·로터리 엔코더 3개 → 이야기 + 펌프로 향 조합 · 왕복(물리→디지털→물리) (Fig 6)', true),
  'BT-A-005': G('T1', '캔버스를 둘러싼 적외선 감지 프레임이 붓을 인식 → 같은 캔버스에 배면 투사 + text-to-sound (DIS ’26 p2, Fig 2)', true),
  'BT-A-006': G('T2', '흔들리는 바나나 사물에 앉고 흔듦 → 공간에 음악 · 초안 E에서 정정 (Ars 2026 작품 기록)', true),
  'BT-A-007': G('T1', '막대로 모래에 그림 → 카메라 추적 → 로봇 팔이 씨앗 그물에 물 · 왕복 (Ars 2026 작품 기록)', true),
  'BT-A-008': G('T1', '유리 조각 터치(ITO 정전식) → 유리 속 LED·스피커 (TEI ’26 p9)', true),
  'BT-A-009': G('T1', '구리 테이프 회로와 모듈 안 전자 부품 → 연결되면 그 모듈이 빛남 (TEI ’26 p4, Fig 5)', true),
  'BT-A-010': G('T2', '기기 카메라가 CV 마커를 추적 → 웹 앱 화면 속 캐릭터가 움직임 (TEI ’26 p3)', true),
  'BT-A-011': G('T2', '테이블 위 고정 카메라가 조각을 촬영 → 큰 화면에 분류 결과 (C&C ’24 p3)', true),
  'BT-A-012': G('E', '팔 동작 → 서보 코르크스크루 · 디지털→물리 (Ars 2026 작품 기록)', true),
  'BT-A-013': G('X', '정적인 촉각 모형, 시스템 반응 없음 (arXiv p6)', true),
  'BT-A-014': G('?', '디지털 여부 확인 필요 (기계식 자판기일 수 있음)'),
  'BT-A-015': G('T2', 'Play-Doh 형태 → 떨어진 LED 화면 · 초안에서 누락돼 이번에 추가'),
  'BT-A-016': G('보류', '입력이 "진열대를 다룬다"뿐 — 인터랙션 불명'),
  'BT-A-017': G('T2', '키 참을 휴대폰에 댐 → 폰 화면 (토큰-열쇠형)'),
  'BT-A-018': G('E', '계단을 밟음 → 음 (신체형)'),
  'BT-A-019': G('E', '자판기를 껴안음 → 캔 (신체형)'),
  'BT-A-020': G('보류', '터치스크린 자판기 — 화면 인터랙션'),
  'BT-A-021': G('T2', '종이 팔찌 착용 → 떨어진 휴대폰 알림 (착용형)'),
  'BT-A-022': G('E', '트랙을 달림 → LED 아바타 (신체형)'),
  'BT-A-023': G('X', '원단 촉감만, 시스템 반응 없음'),
  'BT-A-024': G('A', '붙은 물건을 당김 — 디지털 시스템 없음'),
  'BT-A-025': G('A', '테이프를 뜯음 — 디지털 시스템 없음'),
  'BT-A-026': G('A', '후드 아래로 들어감 — 디지털 시스템 없음'),
  'BT-A-027': G('A', '지팡이로 보도블록 홈을 셈 — 디지털 시스템 없음'),
  'BT-A-028': G('X', '관객 입력 없음 (경기 중 공)'),
  'BT-A-029': G('?', '레버 → 문 · 디지털 여부 확인 필요'),
  'BT-A-030': G('?', '버튼 → 미스트 · 디지털 여부 확인 필요'),
  'BT-E-001': G('T2', '색칠한 종이 스캔 → 벽면 수족관 투사'),
  'BT-E-002': G('T2', '골판지 Toy-Con 조작 → 게임 화면 (조립형)'),
  'BT-E-003': G('T2', '게이트 배치·실물 카트 → 화면 (배치형)'),
  'BT-E-004': G('T2', '피규어를 NFC에 댐 → 게임 (토큰-열쇠형)'),
  'BT-E-005': G('T2', '장난감을 포털에 올림 → 게임 (배치형)'),
  'BT-E-006': G('T2', '지팡이를 휘두름 → 진열창 반응 (도구형)'),
  'BT-E-007': G('보류', '구체 동작이 공식 페이지에 없음'),
  'BT-E-008': G('T2', '조종석 레버·버튼 → 비행 화면 (조작부형)'),
  'BT-E-009': G('T2', '밴드 착용 + 손짓 → 밴드 빛·진동 · 초안에서 누락돼 이번에 추가'),
  'BT-E-010': G('X', '관객 입력 없음 (운영자 무선 제어)'),
  'BT-E-011': G('T1', '피규어를 브릭 코스 위에서 움직임 → 피규어 자체 소리·화면'),
  'BT-E-012': G('T1', '피규어를 상자에 올림·두드림 → 상자에서 재생'),
  'BT-E-013': G('T2', '발사기로 조준 → 화면 표적 (도구형)'),
  'BT-E-014': G('?', '부품 조립 — 디지털 여부 확인 필요'),
}

// ── Ars Electronica 작품 기록 (2026-11-08 확인) ──────────────────────
const ARS: Record<string, { url: string; note: string }> = {
  'BT-A-002': { url: 'https://archive.aec.at/prix/125294/', note: 'Prix 2008 Digital Musics Golden Nica · 작가 Jordà, Geiger, Alonso, Kaltenbrunner · 공식 출처 없음 오류를 해결할 주소' },
  'BT-A-006': { url: 'https://ars.electronica.art/negotiatinghumanity/de/view/sound-bananas-38038ddb450c81119265da26c0b37b56/', note: '“전자 장치 내장”까지만 기재 — 감지 방식은 계속 미확인' },
  'BT-A-007': { url: 'https://ars.electronica.art/negotiatinghumanity/de/view/sybil-38938ddb450c816db093e78c21f4f4e3/', note: '카메라가 모래 위 몸짓 추적 → UR10e 로봇 팔이 씨앗 그물에 물 분사' },
  'BT-A-012': { url: 'https://ars.electronica.art/negotiatinghumanity/', note: '몸짓 실시간 포착 → 서보 코르크스크루 (감지 장치는 미기재)' },
}

const FIND_LABEL: Record<string, string> = { same: '같은 논문 확보', related: '같은 작품의 다른 논문' }

async function thumb(rel: string): Promise<string | null> {
  const f = path.join(DATA, rel)
  if (!existsSync(f)) return null
  const buf = await sharp(f).resize({ width: 560, withoutEnlargement: true }).jpeg({ quality: 68 }).toBuffer()
  return `data:image/jpeg;base64,${buf.toString('base64')}`
}

const COLS = [
  { key: 'interaction', label: '인터랙션', dir: 'cases' },
  { key: 'entertech', label: '엔터테크', dir: 'entertech' },
]
const out: any[] = []
const broken: any[] = []
for (const col of COLS) {
  const entries = await loadCases(path.join(DATA, col.dir))
  const cases = entries.filter((e: any) => e.case).map((e: any) => e.case)
  for (const e of entries) if (e.error) broken.push({ collection: col.key, file: e.file, error: e.error })
  for (const c of cases) {
    const repFile = path.join(DATA, 'verification', `${c.id}.json`)
    const rep = existsSync(repFile) ? j(repFile) : null
    const vFigs = rep ? await Promise.all(rep.figures.slice(0, 8).map(async (f: any) => ({ no: f.no, page: f.page, caption: f.caption, src: await thumb(f.file) }))) : []
    const s4 = step4[c.id]
    let find: any = { status: 'n/a', label: '논문 사례 아님' }
    const u = userIds[c.id]
    if (u?.verdict === 'same') find = { status: 'same', label: FIND_LABEL.same, via: 'Simon이 브라우저로 받음 (ACM)', url: `https://doi.org/${u.doi}`, pages: u.pages }
    else if (s4?.found) find = { status: s4.found.verdict, label: FIND_LABEL[s4.found.verdict], via: s4.found.via, url: s4.found.url, pages: s4.found.pages }
    else if (s4) find = { status: 'human', label: '사람 브라우저로 받아야 함 (ACM 전용)', url: c.source, tried: s4.tried.length }
    const repDir = u?.verdict === 'same' ? path.join(VERIFY, 'out-user', c.id) : path.join(VERIFY, 'out', c.id)
    let quotes: any[] = [], captured = 0
    if (existsSync(path.join(repDir, 'report.json'))) {
      const r = j(path.join(repDir, 'report.json'))
      captured = r.figures.length
      for (const k of ['sensing', 'output', 'action', 'ai']) for (const q of (r.evidence[k] ?? []).slice(0, 2)) quotes.push({ kind: k, page: q.page, quote: q.quote })
      const seen = new Set<string>(); quotes = quotes.filter((q) => (seen.has(q.quote) ? false : (seen.add(q.quote), true))).slice(0, 6)
    }
    out.push({
      id: c.id, collection: col.key, title: c.title, creator: c.creator, year: c.year, location: c.location, context: c.context,
      status: c.status, summary: c.summary_ko, object: c.physical_object, input: c.input, output: c.output, mechanism: c.mechanism,
      stage: c.stage, scope: c.scope, letter: c.letter_no, source: c.source_primary, snapshot: c.archive_snapshot,
      counted: countsTowardArchive(c),
      evidence: Object.entries(EVIDENCE_ROWS).map(([k, label]) => ({ label, status: c.evidence[k].status, url: c.evidence[k].url, note: c.evidence[k].note })),
      media: c.media.map((m: any) => ({ url: m.url, credit: m.credit, permission: m.permission })),
      carousel: c.carousel, caption: c.caption.text, hashtags: c.caption.hashtags,
      issues: checkCase(c, cases).map((i: any) => ({ level: i.level, field: i.field, message: i.message })),
      verify: rep && { verdict: rep.verdict, headline: rep.headline, doi: rep.publication?.doi ?? null, venue: rep.publication?.venue ?? '', license: rep.publication?.license?.label ?? null,
        checks: rep.checks.map((k: any) => ({ label: k.label, state: k.state, detail: k.detail })), figures: vFigs },
      find, quotes, captured, ars: ARS[c.id] ?? null, access: access[c.id] ?? null, cls: CLS[c.id] ?? G('?', '미분류'),
    })
  }
}

// ── 사람이 직접 해야 하는 일 (2026-11-08 검증 결과에서 뽑음) ──────────
type Link = { label: string; url: string }
type Task = { id: string; group: string; pri: 1 | 2 | 3; title: string; how: string; links?: Link[]; cases?: string[]; options?: string[]; done?: string }
const byId = Object.fromEntries(out.map((c) => [c.id, c]))
const acm = (doi: string): Link => ({ label: 'ACM에서 PDF 열기', url: `https://dl.acm.org/doi/pdf/${doi}` })
const wb = (u: string): Link => ({ label: 'Wayback에 저장', url: `https://web.archive.org/save/${u}` })
const src = (id: string, label = '출처 열기'): Link => ({ label, url: byId[id].source })
const TASKS: Task[] = [
  { id: 'd-grade', group: 'decide', pri: 1, title: '1,000개에 넣을 분류 범위 정하기', how: '추천: 핵심 탠저블·탠저블 컨트롤러는 산입, 신체·환경은 ‘확장 사례’로 표기, 아날로그 참여형은 별도 연재.', options: ['추천안대로', 'T1만 산입', '전부 산입'] },
  { id: 'd-figs', group: 'decide', pri: 1, title: '공개 저장소에 올라간 권리 미확인 그림 16장 처리', how: 'BT-A-001·004·013의 논문 그림이 공개 저장소에 있습니다.', options: ['저장소를 비공개로', '그림을 빼고 이력 정리', '그대로 두기'] },
  { id: 'd-split', group: 'decide', pri: 2, title: '한 논문에 작품이 여러 개일 때', how: 'GlassIO는 스테인드글라스 작품 3개(식사 추천·기억 녹음·날씨 창)입니다.', options: ['1건으로 유지', '작품별로 나누기'], cases: ['BT-A-008'] },
  { id: 'd-wayback', group: 'decide', pri: 2, title: 'Wayback 저장을 Claude가 대신 해도 될지', how: '외부(archive.org)에 기록이 남는 일이라 허락이 필요합니다. 직접 하시려면 아래 ‘링크 보존’ 버튼을 누르면 됩니다.', options: ['Claude가 해도 됨', '직접 하겠음'] },
  { id: 'd-email', group: 'decide', pri: 3, title: '논문 검색 API 키 신청에 쓸 이메일', how: 'OpenAlex·Semantic Scholar·CORE 무료 키. 키가 없으면 자동 검색이 자주 막힙니다(Semantic Scholar 10번 중 4번).' },
  { id: 'd-domain', group: 'decide', pri: 3, title: '도메인과 등록자', how: 'dearinteraction.com이 미등록으로 조회됐습니다(구매 직전 재확인 필요).' },

  { id: 'p-005', group: 'pdf', pri: 1, title: 'Dream Brush 원문 PDF', how: '브라우저로 열어 저장 → 저에게 파일을 주시면 그림 캡처·원문 분석을 돌립니다.', links: [acm('10.1145/3802974.3808682')], cases: ['BT-A-005'] },
  { id: 'p-009', group: 'pdf', pri: 1, title: 'Lighting the Reef 원문 PDF', how: 'TEI ’26 Work-in-Progress. ACM에만 있습니다.', links: [acm('10.1145/3731459.3779321')], cases: ['BT-A-009'] },
  { id: 'p-010', group: 'pdf', pri: 1, title: 'Rig-a-Doodle 원문 PDF', how: 'TEI ’26 Work-in-Progress. ACM에만 있습니다.', links: [acm('10.1145/3731459.3779320')], cases: ['BT-A-010'] },
  { id: 'p-011', group: 'pdf', pri: 2, title: 'DataBites 원래 논문 (C&C ’24)', how: '지금은 후속 논문(TEI ’26)만 있습니다. NSF 저장소가 이 Mac에서 안 열렸으니 브라우저로 먼저 시도해 주세요.', links: [{ label: 'NSF 저장소', url: 'https://par.nsf.gov/servlets/purl/10526805' }, acm('10.1145/3635636.3664247')], cases: ['BT-A-011'] },

  { id: 'f-019', group: 'find', pri: 1, title: 'Coca-Cola Hug Machine — 새 출처 찾기', how: '지금 출처(afaqs) 주소가 엉뚱한 기사로 넘어갑니다. 출처가 사라졌으니 브랜드·에이전시(Ogilvy Singapore) 공식 자료나 수상 기록을 찾아 주세요.', links: [src('BT-A-019', '지금 출처')], cases: ['BT-A-019'] },
  { id: 'f-018', group: 'find', pri: 2, title: 'Piano Stairs — 1차 출처 찾기', how: '지금 출처가 어린이 뉴스 사이트입니다. Volkswagen·DDB 공식 케이스 영상이나 수상 기록이 필요합니다.', links: [src('BT-A-018', '지금 출처')], cases: ['BT-A-018'] },
  { id: 'f-006', group: 'find', pri: 2, title: 'Sound Bananas — 무엇으로 감지하는지', how: '공식 기록에는 ‘전자 장치 내장’까지만 있습니다. 작가(ligeti zentrum) 페이지·영상에서 센서 종류를 찾아 주세요.', links: [{ label: 'Ars 작품 기록', url: ARS['BT-A-006'].url }], cases: ['BT-A-006'] },
  { id: 'f-012', group: 'find', pri: 2, title: 'Who Is Jumping, Jack? — 몸짓 감지 장치', how: '서보로 움직이는 건 확인됐지만, 팔 동작을 무엇으로 읽는지(카메라·센서)는 없습니다.', links: [src('BT-A-012', '지금 출처')], cases: ['BT-A-012'] },
  { id: 'f-digital', group: 'find', pri: 2, title: '디지털 장치가 들어 있는지 확인 (4건)', how: '센서·전자 부품이 있으면 탠저블, 순수 기계식이면 아날로그로 분류됩니다.', cases: ['BT-A-014', 'BT-A-029', 'BT-A-030', 'BT-E-014'] },
  { id: 'f-hold', group: 'find', pri: 3, title: '관객이 정확히 무엇을 하는지 (2건)', how: 'Netflix는 ‘진열대를 다룬다’, Power-Up Band는 구체 동작이 없습니다.', cases: ['BT-A-016', 'BT-E-007'] },
  { id: 'f-020', group: 'find', pri: 2, title: 'Small World Machines — 넣을지 뺄지, 넣는다면 새 출처', how: '터치스크린 자판기라 브리프 기준으로는 제외 대상입니다. 그리고 지금 출처(The Drum)는 유료 회원 페이지로 넘어가 내용을 볼 수 없습니다.', cases: ['BT-A-020'] },
  { id: 'f-credit', group: 'find', pri: 3, title: 'Ars Electronica 사진 크레딧 (3건)', how: '사진 아카이브에서 작품 사진과 사진가 이름을 찾아 주세요 (CC BY-NC-ND, 크레딧 필수).', links: [{ label: 'Ars 사진 아카이브', url: 'https://photos.ars.electronica.art/' }], cases: ['BT-A-006', 'BT-A-007', 'BT-A-012'] },

  ...['BT-A-018', 'BT-A-021', 'BT-A-022', 'BT-A-030'].map((id): Task => ({ id: `s-${id}`, group: 'save', pri: 2, title: byId[id].title, how: '보존본이 없습니다. 버튼을 누르면 archive.org가 지금 페이지를 저장합니다.', links: [wb(byId[id].source), src(id)], cases: [id] })),

  ...['BT-A-025', 'BT-A-026', 'BT-A-028', 'BT-E-005', 'BT-E-008', 'BT-E-009', 'BT-E-012', 'BT-E-013', 'BT-E-014'].map((id): Task => ({ id: `o-${id}`, group: 'open', pri: 3, title: byId[id].title, how: '자동 접속만 막혔고 보존본은 있습니다. 브라우저로 열어 내용이 기록과 맞는지만 봐 주세요.', links: [src(id)], cases: [id] })),
]

// 끝난 일 표시 (2026-11-08)
const DONE: Record<string, string> = {
  'd-wayback': 'Claude가 하기로 결정 (11-08)',
  ...Object.fromEntries(Object.entries(userIds).filter(([, v]: any) => v.verdict === 'same').map(([id]: any) => [`p-${id.slice(-3)}`, '받은 PDF가 같은 논문으로 확인됨 · 그림 캡처·원문 분석 완료'])),
  ...Object.fromEntries(Object.entries(saved).filter(([, v]: any) => v.ok).map(([id, v]: any) => [`s-${id}`, `Wayback에 저장됨 (${v.when})${v.note ? ' · ' + v.note : ''}`])),
}
for (const t of TASKS) if (DONE[t.id]) t.done = DONE[t.id]
for (const c of out) if (saved[c.id]?.ok && c.access) c.access.wayback = saved[c.id].when.replace(/-/g, '')

const payload = {
  generatedAt: new Date().toISOString(), commit: COMMIT, goal: LETTER_TOTAL, stages: STAGES,
  collections: COLS.map(({ key, label }) => ({ key, label })), broken, cases: out, tasks: TASKS,
  run: { date: '2026-11-08', note: '원문 찾기·그림 캡처·원문 분석·Ars 경로·출처 접근 검증 실행 결과 포함. 분류는 초안이며 ✓ 표시는 원문과 대조한 사례.' },
}

const enc = new TextEncoder()
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12))
const ITER = 600_000
const base = await crypto.subtle.importKey('raw', enc.encode(DASH_PIN), 'PBKDF2', false, ['deriveKey'])
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload))))
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64')
writeFileSync(path.join(OUT, 'data.enc.json'), JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iterations: ITER, salt: b64(salt), iv: b64(iv), data: b64(ct) }))
console.log(`cases=${out.length} broken=${broken.length} bytes=${ct.length} figs=${out.reduce((n, c) => n + (c.verify?.figures.filter((f: any) => f.src).length ?? 0), 0)}`)
void readdirSync
