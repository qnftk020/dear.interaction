import { COVER_LINE_CHARS, hasValue, isVerified, lineCount, repostStatusOf, SLIDE_LINE_CHARS, SLIDE_MAX_LINES } from './derive.ts'
import { EVIDENCE_ROWS, STAGES, type Case, type EvidenceKey, type Stage } from './schema.ts'

export type IssueLevel = 'error' | 'warn' | 'info'
export interface Issue {
  level: IssueLevel
  field: string
  message: string
}

/** SNS·Pinterest는 발견 경로일 뿐 출처 확인의 최종 근거가 아니다. */
const DISCOVERY_HOSTS = [
  'pinterest.com', 'pinterest.co.kr', 'pin.it', 'instagram.com', 'facebook.com',
  'twitter.com', 'x.com', 'tiktok.com', 'tumblr.com', 'threads.net', 'threads.com',
]
const AI_ACTIVE_TAGS: readonly string[] = ['AI-ASSISTED', 'AI-GENERATIVE', 'AI-ADAPTIVE']
/** 지침 5절: 근거 없는 칭찬 금지 */
const EMPTY_PRAISE = ['혁신적', '몰입감이 뛰어', '압도적', '놀라운 경험', '새로운 차원']
/** 지침 5절: 같은 농담을 매 게시물 반복하지 않는다 */
export const JOKE_MOTIFS = ['바람', '미련', '상을 줬', '직업병', '첫사랑']
/** 지침 4-4: 검증 안 된 효과·수치 */
const FIGURE_PATTERN = /\d[\d,.]*\s*(%|퍼센트|만\s*명|명|회|배)|조회수|매출|전환율/
const COVER_RANGE = [10, COVER_LINE_CHARS * SLIDE_MAX_LINES] as const
const LIST_RANGE = [3, 5] as const

export const stageIndex = (stage: Stage): number => STAGES.indexOf(stage)
const VERIFIED = stageIndex('검증 완료')
const DRAFTING = stageIndex('원고 작성')
const POST_READY = stageIndex('게시 준비')

export function parseUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

export function isDiscoveryUrl(value: string): boolean {
  const url = parseUrl(value)
  if (!url) return false
  const host = url.hostname.replace(/^www\./, '')
  return DISCOVERY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))
}

const issue = (level: IssueLevel, field: string, message: string): Issue => ({ level, field, message })
const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const inRange = (n: number, [min, max]: readonly [number, number]) => n >= min && n <= max

function sourceRules(c: Case): Issue[] {
  const out: Issue[] = []
  if (!parseUrl(c.source_primary)) {
    out.push(issue('error', 'source_primary', '공식 출처 URL이 없습니다. 작가/스튜디오·기관·논문 페이지를 넣어주세요.'))
  } else if (isDiscoveryUrl(c.source_primary)) {
    out.push(issue('error', 'source_primary', 'SNS·Pinterest는 발견 경로일 뿐, 공식 출처가 될 수 없습니다.'))
  }
  for (const key of Object.keys(EVIDENCE_ROWS) as EvidenceKey[]) {
    const row = c.evidence[key]
    const field = `evidence.${key}`
    if (row.url && !parseUrl(row.url)) out.push(issue('warn', field, '근거 링크가 올바른 URL이 아닙니다.'))
    if (isDiscoveryUrl(row.url)) out.push(issue('warn', field, 'SNS 링크는 근거로 약합니다. 1차 출처를 찾아주세요.'))
    if (row.status === '확인' && !parseUrl(row.url)) {
      out.push(issue('error', field, `'${EVIDENCE_ROWS[key]}'를 확인으로 표시했지만 근거 링크가 없습니다.`))
    } else if (row.status === '확인' && !row.link_opened) {
      out.push(issue('warn', field, `'${EVIDENCE_ROWS[key]}' 링크를 실제로 열어 확인했는지 표시되지 않았습니다.`))
    }
  }
  return out
}

function verificationRules(c: Case): Issue[] {
  const out: Issue[] = []
  const idx = stageIndex(c.stage)
  if (idx >= VERIFIED && !isVerified(c)) {
    out.push(issue('error', 'evidence', '검증 부족 — 게시 보류. 작품 정체와 입력·출력이 모두 확인되어야 합니다.'))
  }
  if (hasValue(c.mechanism) && c.evidence.technology.status === '미확인') {
    out.push(issue('error', 'mechanism', "사용 기술이 미확인인데 MECHANISM을 적었습니다. 추정하지 말고 '미확인'으로 두세요."))
  }
  if (c.tags.ai.some((t) => AI_ACTIVE_TAGS.includes(t)) && !parseUrl(c.ai_evidence)) {
    out.push(issue('warn', 'ai_evidence', 'AI 결합의 공식 근거(ai_evidence URL)가 없습니다.'))
  }
  if (idx >= VERIFIED && !c.source_checked_at) out.push(issue('warn', 'source_checked_at', '출처를 확인한 날짜가 없습니다.'))
  if (idx >= VERIFIED && !parseUrl(c.archive_snapshot)) {
    out.push(issue('warn', 'archive_snapshot', '링크 유실 대비 web.archive.org 스냅샷이 없습니다.'))
  }
  if (idx >= VERIFIED && (c.scope === 'HOLD' || c.scope === 'EXCLUDED')) {
    out.push(issue('error', 'scope', '보류·제외 사례는 검증 완료 이후 단계로 진행할 수 없습니다.'))
  }
  return out
}

const SLIDES = [
  ['cover', '01 표지'], ['work', '02 THE WORK'], ['why', '04 WHY IT WORKS'], ['what_if', '05 WHAT IF'], ['ps', '06 P.S.'],
] as const

function copyRules(c: Case): Issue[] {
  const idx = stageIndex(c.stage)
  if (idx < DRAFTING) return []
  const out: Issue[] = []
  const missingLevel: IssueLevel = idx >= POST_READY ? 'error' : 'warn'
  for (const [key, label] of SLIDES) {
    const body = c.carousel[key]
    if (!body.trim()) out.push(issue(missingLevel, `carousel.${key}`, `${label} 원고가 비어 있습니다.`))
    else {
      const perLine = key === 'cover' ? COVER_LINE_CHARS : SLIDE_LINE_CHARS
      const lines = lineCount(body, perLine)
      if (lines > SLIDE_MAX_LINES) {
        out.push(issue('warn', `carousel.${key}`, `${label}가 슬라이드에서 ${lines}줄입니다. 최대 ${SLIDE_MAX_LINES}줄(한 줄 ${perLine}자)로 줄이고, 넘치는 정보는 조사 노트로 내리세요.`))
      }
    }
    const praise = EMPTY_PRAISE.find((w) => body.includes(w))
    if (praise) out.push(issue('warn', `carousel.${key}`, `'${praise}' 같은 근거 없는 칭찬 대신 행동 → 반응 → 경험의 변화를 쓰세요.`))
  }
  const coverLen = [...c.carousel.cover.replace(/\s+/g, ' ').trim()].length
  if (c.carousel.cover && !inRange(coverLen, COVER_RANGE)) {
    out.push(issue('warn', 'carousel.cover', `표지 헤드라인이 ${coverLen}자입니다. ${COVER_RANGE[0]}~${COVER_RANGE[1]}자를 권장합니다.`))
  }
  if (FIGURE_PATTERN.test(c.carousel.why)) {
    out.push(issue('warn', 'carousel.why', '수치·성과가 들어 있습니다. 검증된 근거가 없으면 빼고 가설로 표현하세요.'))
  }
  if (!hasValue(c.input) || !hasValue(c.output)) {
    out.push(issue(missingLevel, 'input', '03 HOW IT WORKS의 INPUT·OUTPUT이 미확인입니다.'))
  }
  for (const key of ['input', 'output', 'mechanism'] as const) {
    if (hasValue(c[key]) && lineCount(c[key]) > 1) {
      out.push(issue('warn', key, `03 HOW IT WORKS에서 ${key.toUpperCase()}가 한 줄(${SLIDE_LINE_CHARS}자)을 넘습니다. 슬라이드용으로 짧게 줄여주세요.`))
    }
  }
  const w = c.what_if
  if (!w.context || !w.audience || !w.action || !w.response || !w.message) {
    out.push(issue(missingLevel, 'what_if', 'WHAT IF에는 맥락·대상 관객·행동·반응·전달할 메시지가 모두 필요합니다.'))
  }
  return out
}

function publishRules(c: Case): Issue[] {
  const out: Issue[] = []
  if (stageIndex(c.stage) < POST_READY) return out
  if (c.letter_no === null) out.push(issue('error', 'letter_no', '게시 번호가 배정되지 않았습니다.'))
  if (!c.caption.text.trim()) out.push(issue('error', 'caption', '인스타 캡션이 비어 있습니다.'))
  if (!inRange(c.caption.hashtags.length, LIST_RANGE)) out.push(issue('warn', 'caption.hashtags', '해시태그는 3~5개를 권장합니다.'))
  if (!inRange(c.keywords.length, LIST_RANGE)) out.push(issue('warn', 'keywords', '아카이브 DB 태그는 3~5개입니다.'))
  if (!c.checklist.humor_linked || !c.checklist.info_not_buried) {
    out.push(issue('error', 'checklist', '자체 점검(유머-작품 연결, 정보 가독성)을 확인해주세요.'))
  }
  if (c.media.length === 0) out.push(issue('warn', 'media', '이미지·영상 후보가 없습니다. 공식 자료 링크 1~3개를 넣어주세요.'))
  else if (repostStatusOf(c) !== '허용 확인됨') {
    out.push(issue('warn', 'media', '재게시가 허용된 자료가 없습니다. 이미지 없이 텍스트 캐러셀로만 게시할 수 있습니다.'))
  }
  return out
}

function mediaRules(c: Case): Issue[] {
  return c.media.flatMap((m, i) => {
    const out: Issue[] = []
    if (!parseUrl(m.url)) out.push(issue('warn', `media.${i}`, '자료 링크가 올바른 URL이 아닙니다.'))
    if (m.permission === '허용 확인됨' && !m.permission_basis) {
      out.push(issue('error', `media.${i}`, "'허용 확인됨'에는 근거(라이선스·허락 내역)가 필요합니다. 출처 표기는 허가가 아닙니다."))
    }
    return out
  })
}

function scopeRules(c: Case): Issue[] {
  const out: Issue[] = []
  if (c.scope === 'EXTENDED') out.push(issue('info', 'scope', '확장 사례 (non-tangible)로 표기되어 게시됩니다.'))
  if (c.scope === 'HOLD' || c.scope === 'EXCLUDED') out.push(issue('info', 'scope', '보류·제외 사례는 아카이브 카운트에 들어가지 않습니다.'))
  if (c.tags.input.length === 0 || c.tags.output.length === 0) out.push(issue('warn', 'tags', '입력·출력 분류 태그가 비어 있습니다.'))
  return out
}

function duplicateRules(c: Case, all: readonly Case[]): Issue[] {
  const others = all.filter((o) => o.id !== c.id)
  const out = others
    .filter((o) => normalize(o.title) === normalize(c.title))
    .map((o) => issue('warn', 'title', `${o.id}와 제목이 같습니다. 중복 사례인지 확인하세요.`))
  const sameNo = others.find((o) => c.letter_no !== null && o.letter_no === c.letter_no)
  if (sameNo) out.push(issue('error', 'letter_no', `${sameNo.id}가 이미 LOVE LETTER ${c.letter_no}번을 쓰고 있습니다.`))
  const jokeText = `${c.carousel.cover} ${c.carousel.ps}`
  for (const motif of JOKE_MOTIFS.filter((m) => jokeText.includes(m))) {
    const reused = others.find((o) => `${o.carousel.cover} ${o.carousel.ps}`.includes(motif))
    if (reused) out.push(issue('warn', 'carousel.cover', `'${motif}' 농담을 ${reused.id}에서도 썼습니다. 작품 특성에서 새 한 줄을 찾아주세요.`))
  }
  return out
}

export function checkCase(c: Case, all: readonly Case[] = []): Issue[] {
  return [
    ...sourceRules(c), ...verificationRules(c), ...copyRules(c), ...publishRules(c),
    ...mediaRules(c), ...scopeRules(c), ...duplicateRules(c, all),
  ]
}

/** 해당 단계로 옮기지 못하게 막는 오류 메시지 목록. 비어 있으면 옮길 수 있다. */
export function canEnterStage(c: Case, stage: Stage, all: readonly Case[]): string[] {
  return checkCase({ ...c, stage }, all)
    .filter((i) => i.level === 'error')
    .map((i) => i.message)
}

/** 검증을 통과한 탠저블·확장 사례만 아카이브에 산입한다. */
export function countsTowardArchive(c: Case): boolean {
  return (c.scope === 'TANGIBLE' || c.scope === 'EXTENDED') && stageIndex(c.stage) >= VERIFIED && isVerified(c)
}

/** 공개 아카이브에는 게시를 마친 러브레터만 싣는다. */
export function isPublishable(c: Case, all: readonly Case[]): boolean {
  return c.stage === '게시됨' && countsTowardArchive(c) && checkCase(c, all).every((i) => i.level !== 'error')
}
