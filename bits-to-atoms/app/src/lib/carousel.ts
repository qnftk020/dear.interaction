import { hasValue, letterLabel, pad, repostStatusOf } from './derive.ts'
import { EVIDENCE_ROWS, LETTER_TOTAL, SCOPE_LABELS, type Case, type EvidenceKey } from './schema.ts'
import { selfCheck } from './selfcheck.ts'
import { checkCase } from './validate.ts'

export const SIGN_OFF = 'Dear, Interaction.'
export const WHAT_IF_DISCLAIMER = '※ 실제 진행된 프로젝트가 아닌, 에디터의 가상 제안입니다.'
export const WHY_DISCLAIMER = '에디터 해석'

export interface Slide {
  no: string
  name: string
  kicker: string
  body: string
  /** 03 HOW IT WORKS의 INPUT/OUTPUT/MECHANISM 줄 */
  rows: Array<[string, string]>
  note: string
  footer: string
  /** 재게시가 허용된 이미지 (data/ 기준 상대 경로)와 그 크레딧. 02·03장에만 들어간다. */
  image?: { file: string; credit: string }
}

/** 재게시 허용이 확인된 로컬 이미지만 슬라이드에 쓴다. 출처 표기는 허가가 아니다. */
export function slideImages(c: Case): Array<{ file: string; credit: string }> {
  return c.media.filter((m) => m.image && m.permission === '허용 확인됨').map((m) => ({ file: m.image, credit: m.credit }))
}

const noLabel = (c: Case) => (c.letter_no === null ? '번호 미배정' : pad(c.letter_no))

/** 지침 6절 고정 구조 6장. 미리보기와 마크다운 내보내기가 같은 모델을 쓴다. */
export function buildSlides(c: Case): Slide[] {
  const credit = `${c.title} — ${c.creator}`
  const base = { rows: [] as Array<[string, string]>, note: '', footer: '' }
  const how: Array<[string, string]> = [['INPUT', c.input], ['OUTPUT', c.output]]
  if (hasValue(c.mechanism)) how.push(['MECHANISM', c.mechanism])
  const [img02, img03] = slideImages(c)
  return [
    { ...base, no: '01', name: 'LOVE LETTER', kicker: `LOVE LETTER ${letterLabel(c)}`, body: c.carousel.cover, footer: credit },
    {
      ...base, no: '02', name: 'THE WORK', kicker: `To. ${c.title}`, body: c.carousel.work,
      note: c.scope === 'EXTENDED' ? SCOPE_LABELS.EXTENDED : '',
      ...(img02 ? { image: img02 } : {}),
    },
    { ...base, no: '03', name: 'HOW IT WORKS', kicker: c.physical_object, body: '', rows: how, ...(img03 ? { image: img03 } : {}) },
    { ...base, no: '04', name: 'WHY IT WORKS', kicker: '경험을 설계하는 방식', body: c.carousel.why, note: WHY_DISCLAIMER },
    { ...base, no: '05', name: 'WHAT IF?', kicker: c.what_if.context ?? '맥락 미정', body: c.carousel.what_if, note: WHAT_IF_DISCLAIMER },
    {
      ...base, no: '06', name: 'P.S. I STILL LOVE YOU', kicker: '', body: c.carousel.ps,
      footer: `Love Letter ${noLabel(c)} / ${LETTER_TOTAL} · ${SIGN_OFF}`,
    },
  ]
}

const cell = (s: string) => (s.trim() || '—').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')
const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`

function slideMarkdown(s: Slide): string {
  const lines = [`### ${s.no} / ${s.name}`]
  if (s.no === '01') lines.push(s.kicker)
  if (s.image) lines.push(`[이미지: ${s.image.file} — ${s.image.credit}]`)
  lines.push(...(s.rows.length ? s.rows.map(([k, v]) => `${k}: ${v}`) : [s.body || '(원고 없음)']))
  if (s.note) lines.push(`_${s.note}_`)
  if (s.footer) lines.push(s.footer)
  return lines.join('\n')
}

function evidenceMarkdown(c: Case): string {
  const keys = Object.keys(EVIDENCE_ROWS) as EvidenceKey[]
  const rows = keys.map((k) => {
    const r = c.evidence[k]
    const link = r.url ? (r.link_opened ? r.url : `${r.url} (접근 확인 못 함)`) : ''
    return row([EVIDENCE_ROWS[k], r.note, link, r.status])
  })
  return [
    row(['항목', '조사 내용', '근거 링크', '확인 상태']), '|---|---|---|---|', ...rows, '',
    `- 공식 출처: ${c.source_primary}`,
    '- 04 WHY IT WORKS는 `에디터 해석`, 05 WHAT IF는 `가상 제안`입니다.',
  ].join('\n')
}

function mediaMarkdown(c: Case): string {
  if (c.media.length === 0) return '- 후보 없음 — 공식 이미지/영상 링크 필요'
  return c.media
    .map((m) => `- ${m.url}${m.image ? ` · 파일: ${m.image}` : ''} · 크레딧: ${m.credit || '미확인'} · ${m.permission}${m.permission_basis ? ` (근거: ${m.permission_basis})` : ''}`)
    .join('\n')
}

export const DB_COLUMNS = [
  'Archive No.', '작품명', '제작자', '연도', '국가/장소', '분류', 'INPUT', 'OUTPUT', '핵심 기술',
  '광고/경험 인사이트', '적용 아이디어', '공식 출처', '재게시 권리 상태', '태그',
]

export function dbRow(c: Case): string[] {
  const w = c.what_if
  const idea = w.context ? `[${w.context}] ${w.audience} / ${w.action} → ${w.response} / ${w.message}` : ''
  return [
    noLabel(c), c.title, c.creator, c.year, c.location, SCOPE_LABELS[c.scope], c.input, c.output, c.mechanism,
    c.ad_insight, idea, c.source_primary, repostStatusOf(c), c.keywords.join(', '),
  ]
}

function pendingMarkdown(c: Case, all: readonly Case[]): string {
  const issues = checkCase(c, all).filter((i) => i.level !== 'info').map((i) => `- [${i.level === 'error' ? '필수' : '권장'}] ${i.message}`)
  const checks = selfCheck(c, all).filter((i) => !i.ok).map((i) => `- [점검] ${i.label}`)
  const lines = [...issues, ...checks]
  return lines.length ? lines.join('\n') : '- 없음'
}

/** 지침 8절 출력 형식 그대로. 캐러셀 원고가 조사 메모보다 먼저 온다. */
export function toMarkdown(c: Case, all: readonly Case[]): string {
  const tags = c.caption.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
  return [
    `# LOVE LETTER ${noLabel(c)} — ${c.title}`,
    '## 인스타 캐러셀 (6장)',
    ...buildSlides(c).map(slideMarkdown),
    '## 인스타 캡션',
    [c.caption.text || '(캡션 없음)', tags].filter(Boolean).join('\n\n'),
    '## 리서치 근거',
    evidenceMarkdown(c),
    '## 이미지/영상 소스 및 재게시 권리',
    mediaMarkdown(c),
    '## 아카이브 DB',
    [row(DB_COLUMNS), `|${DB_COLUMNS.map(() => '---').join('|')}|`, row(dbRow(c))].join('\n'),
    '## 게시 전 확인할 항목',
    pendingMarkdown(c, all),
  ].join('\n\n')
}

/** 지침 9절: "10개 찾아줘" 요청 때 먼저 보여주는 후보 표 */
export function candidateTable(cases: readonly Case[]): string {
  return [
    row(['작품명', '작가·연도', '한 줄 인터랙션', '탠저블 여부', '공식 출처']),
    '|---|---|---|---|---|',
    ...cases.map((c) => row([c.title, `${c.creator} · ${c.year}`, `${c.input} → ${c.output}`, SCOPE_LABELS[c.scope], c.source_primary])),
  ].join('\n')
}

/** 01·02·04·05·06 원고 칸이 모두 비었는가 (03은 자동 생성). 비었을 때만 Codex 자동 원고를 만든다. */
export function isCarouselEmpty(c: Pick<Case, 'carousel'>): boolean {
  return Object.values(c.carousel).every((v) => v.trim() === '')
}
