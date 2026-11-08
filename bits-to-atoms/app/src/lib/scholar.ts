/**
 * 학술 출판 자동 검증의 순수 로직 (네트워크 없음 — 서버·화면·테스트가 같이 쓴다).
 *
 * 판단 원칙: DOI는 출판사(ACM 등)가 Crossref에 직접 등록하는 번호다.
 * 제목·저자가 Crossref 기록과 맞으면 "그 출판사에서 출판됨"으로 본다.
 * 출판사 페이지(dl.acm.org)가 자동 접속을 막아도 DOI 기록이 있으면 판정은 바뀌지 않는다.
 */
import type { Case, MediaItem } from './schema.ts'

export type CheckState = 'pass' | 'warn' | 'fail' | 'skip'
export type Verdict = 'published' | 'partial' | 'mismatch' | 'not-found'

export const VERDICT_LABELS: Record<Verdict, string> = {
  published: '학술 게재 확인',
  partial: '게재 정보 일부만 확인',
  mismatch: '다른 논문으로 보임',
  'not-found': '학술 출판 기록 없음',
}

export interface VerifyCheck {
  key: string
  label: string
  state: CheckState
  detail: string
  url?: string
}

export interface Quote {
  text: string
  page: number
}

export interface Publication {
  doi: string
  doiUrl: string
  title: string
  authors: string[]
  /** 학회 약칭 (DIS '26 Companion) 또는 저널명 */
  venue: string
  container: string
  publisher: string
  type: string
  published: string
  year: number | null
  pages: string
  license: { url: string; label: string } | null
  /** Crossref 검색으로 찾았는지, 기존 링크에 DOI가 있었는지 */
  foundBy: 'record' | 'source-page' | 'crossref-search'
}

export interface PdfInfo {
  /** 원본 다운로드 주소 */
  url: string
  /** 어디서 찾은 PDF인가 */
  source: string
  /** data/ 아래 로컬 사본 (예: figures/BT-A-005/paper.pdf) */
  file: string
  pages: number
  titleFound: boolean
  doiFound: boolean
}

export interface Figure {
  no: number | null
  caption: string
  page: number
  /** data/ 아래 상대 경로 (figures/BT-A-005/fig-1.jpg) */
  file: string
  width: number
  height: number
}

export interface VerificationReport {
  id: string
  checkedAt: string
  verdict: Verdict
  headline: string
  publication: Publication | null
  pdf: PdfInfo | null
  checks: VerifyCheck[]
  figures: Figure[]
  techQuotes: Quote[]
  interactionQuotes: Quote[]
  /** Crossref 저자 중 기록(creator)에 없는 사람 */
  missingAuthors: string[]
}

// ── 문자열 비교 ─────────────────────────────────────────────

export const normTitle = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  const t = s.replace(/\s+/g, ' ')
  for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1)
  return m
}

/** Sørensen–Dice 유사도 (0~1) */
export function similarity(a: string, b: string): number {
  const x = normTitle(a)
  const y = normTitle(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const bx = bigrams(x)
  const by = bigrams(y)
  let inter = 0
  for (const [g, n] of bx) inter += Math.min(n, by.get(g) ?? 0)
  const total = [...bx.values()].reduce((s, n) => s + n, 0) + [...by.values()].reduce((s, n) => s + n, 0)
  return total ? (2 * inter) / total : 0
}

export type TitleMatch = 'exact' | 'prefix' | 'similar' | 'none'

/** "Dream Brush" ↔ "Dream Brush: Generative Painting with …" 는 부제 생략으로 본다. */
export function titleMatch(recordTitle: string, pubTitle: string): TitleMatch {
  const r = normTitle(recordTitle)
  const p = normTitle(pubTitle)
  if (!r || !p) return 'none'
  if (r === p) return 'exact'
  const main = normTitle(pubTitle.split(/[:：—–]|\s-\s/)[0] ?? '')
  if (main && main === r) return 'prefix'
  if (similarity(recordTitle, pubTitle) >= 0.88) return 'similar'
  return 'none'
}

/** "A, B, C (MIT Media Lab)" → 소속 괄호를 뗀 이름 문자열 */
export const creatorNames = (creator: string): string => creator.replace(/\([^)]*\)/g, ' ')

/** 성(family name)이 기록에 있는 Crossref 저자 / 없는 저자 */
export function authorOverlap(creator: string, authors: readonly string[]): { matched: string[]; missing: string[] } {
  const names = ` ${normTitle(creatorNames(creator))} `
  const matched: string[] = []
  const missing: string[] = []
  for (const a of authors) {
    const family = normTitle(a.split(' ').at(-1) ?? a)
    if (family && names.includes(` ${family} `)) matched.push(a)
    else missing.push(a)
  }
  return { matched, missing }
}

export const DOI_PATTERN = /\b(10\.\d{4,9}\/[^\s"'<>#?&]+[^\s"'<>#?&.,;)\]])/i

export function findDoi(text: string): string | null {
  const m = DOI_PATTERN.exec(decodeURIComponentSafe(text))
  return m ? m[1].replace(/\/(pdf|full|abs|epdf)$/i, '') : null
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

export function licenseLabel(url: string): string {
  const m = /creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/i.exec(url)
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`
  if (/creativecommons\.org\/publicdomain/i.test(url)) return 'CC0 (퍼블릭 도메인)'
  return '출판사 라이선스'
}

export const isOpenLicense = (url: string): boolean => /creativecommons\.org/i.test(url)

/** CC 라이선스 조건을 사람이 바로 읽을 수 있게 */
export function licenseConditions(url: string): string[] {
  const out = ['원작자·출처 표기']
  if (/-nc/i.test(url)) out.push('비상업적 이용만')
  if (/-nd/i.test(url)) out.push('변형 금지 — 자르기·합성·색 보정 없이 원본 그대로')
  if (/-sa/i.test(url)) out.push('같은 조건으로 공유')
  return out
}

// ── PDF 본문 분석 ───────────────────────────────────────────

/** PDF 줄바꿈·하이픈 분철을 이어 붙인다. */
export const joinPdfLines = (s: string): string =>
  s.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()

/** 섹션 제목 줄 ("3.1 Experience and interaction", "Abstract", "Keywords") */
const HEADING_LINE = /^\s*(?:\d+(?:\.\d+)*\.?\s+[A-Z][^.!?]{0,70}|Abstract|Keywords|CCS Concepts|ACM Reference Format:?|References|Acknowledg(?:e)?ments?)\s*$/
const BREAK = '\u0000'

export interface CaptionHit {
  no: number
  caption: string
  /** 페이지 텍스트에서 캡션이 차지하는 범위 (본문 인용에서 뺄 때 쓴다) */
  start: number
  end: number
}

/** 한 페이지 텍스트에서 "Figure N: …" 캡션을 순서대로 뽑는다. 빈 줄·섹션 제목·다음 캡션에서 끊는다. */
export function figureCaptions(pageText: string): CaptionHit[] {
  const out: CaptionHit[] = []
  const re = /(?:^|\n)\s*(?:Figure|Fig\.)\s*(\d+)\s*[:.|]\s*/g
  const hits = [...pageText.matchAll(re)]
  hits.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const limit = hits[i + 1]?.index ?? pageText.length
    const lines = pageText.slice(start, limit).split('\n')
    const kept: string[] = []
    for (const line of lines) {
      if (kept.length > 0 && (line.trim() === '' || HEADING_LINE.test(line))) break
      kept.push(line)
      // 줄이 문장 끝으로 끝나면 캡션도 끝난 것으로 본다 (두 단 편집에서 옆 단 본문이 이어 붙는 것 방지)
      if (/[.!?]["”)]?\s*$/.test(line) && kept.join(' ').length > 40) break
    }
    const raw = kept.join('\n')
    const caption = joinPdfLines(raw).slice(0, 360)
    out.push({ no: Number(m[1]), caption, start: m.index ?? 0, end: start + raw.length })
  })
  return out
}

/** 인용용 본문: 캡션을 빼고, 섹션 제목 자리에서 문장을 끊는다. */
export function bodyText(pageText: string): string {
  let text = pageText
  for (const c of [...figureCaptions(pageText)].reverse()) text = `${text.slice(0, c.start)}\n${BREAK}\n${text.slice(c.end)}`
  return text.split('\n').map((line) => (HEADING_LINE.test(line) ? BREAK : line)).join('\n')
}

export function sentences(pageText: string): string[] {
  return bodyText(pageText)
    .split(BREAK)
    .flatMap((chunk) => joinPdfLines(chunk).split(/(?<=[.!?])\s+(?=[A-Z“"(])/))
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 640)
}

/** 센서·구동·출력 하드웨어 (가중치 2) */
const HARDWARE_TERMS = [
  'infrared', 'camera', 'sensor', 'sensing', 'projector', 'back-project', 'rfid', 'nfc', 'capacitive', 'pressure sens',
  'accelerometer', 'imu', 'microphone', 'arduino', 'raspberry', 'microcontroller', 'kinect', 'depth', 'speaker', 'motor',
  'actuator', 'servo', 'led', 'esp32', 'hardware', 'touch screen', 'touchscreen', 'lidar', 'magnet',
]
/** 소프트웨어·모델 (가중치 1) */
const SOFTWARE_TERMS = [
  'vision model', 'computer vision', 'llm', 'gpt', 'diffusion', 'text-to-sound', 'text-to-speech', 'image model', 'image generation',
  'recognized', 'recognition', 'machine learning', 'neural', 'touchdesigner', 'unity', 'pipeline', 'projection',
]
const INTERACTION_TERMS = ['participant', 'user', 'visitor', 'audience', 'people', 'player']
const ACTION_TERMS = ['write', 'writes', 'draw', 'touch', 'press', 'place', 'move', 'rotate', 'hold', 'speak', 'brush', 'stroke', 'appear', 'respond', 'transform', 'watch']
/** 참고문헌·각주·저작권 문구는 인용에서 뺀다 */
const NOISE = /(copyright|licensed under|acm isbn|permission to make|https?:\/\/|\[\d+\]\s*[A-Z][a-z]+,|proceedings of|contributed equally)/i

const termRegex = new Map<string, RegExp>()
/** 단어 경계로 센다 ("sampled"가 LED로 잡히지 않게). 4자 이하 약어는 완전한 단어만. */
function countTerms(s: string, terms: readonly string[]): number {
  return terms.reduce((n, t) => {
    let re = termRegex.get(t)
    if (!re) {
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      re = new RegExp(t.length <= 4 ? `\\b${esc}s?\\b` : `\\b${esc}`, 'i')
      termRegex.set(t, re)
    }
    return n + (re.test(s) ? 1 : 0)
  }, 0)
}

function pickQuotes(pages: readonly string[], score: (s: string) => number, limit: number): Quote[] {
  const scored: Array<Quote & { score: number }> = []
  pages.forEach((text, i) => {
    for (const s of sentences(text)) {
      if (NOISE.test(s)) continue
      const sc = score(s)
      if (sc > 0) scored.push({ text: s, page: i + 1, score: sc })
    }
  })
  const seen = new Set<string>()
  return scored
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .filter((q) => (seen.has(q.text) ? false : (seen.add(q.text), true)))
    .slice(0, limit)
    .sort((a, b) => a.page - b.page)
    .map(({ text, page }) => ({ text, page }))
}

/** 사용 기술(센서·구동·모델)을 말하는 원문 문장 */
export const techQuotes = (pages: readonly string[], limit = 4): Quote[] =>
  pickQuotes(pages, (s) => {
    const n = countTerms(s, HARDWARE_TERMS) * 2 + countTerms(s, SOFTWARE_TERMS)
    return n >= 2 ? n : 0
  }, limit)

/** 사람이 무엇을 하면 무엇이 일어나는지 말하는 원문 문장 */
export const interactionQuotes = (pages: readonly string[], limit = 3): Quote[] =>
  pickQuotes(pages, (s) => {
    const who = countTerms(s, INTERACTION_TERMS)
    const act = countTerms(s, ACTION_TERMS)
    return who && act >= 2 ? who + act : 0
  }, limit)

// ── 판정 ────────────────────────────────────────────────────

export function verdictOf(checks: readonly VerifyCheck[], pub: Publication | null): Verdict {
  if (!pub) return 'not-found'
  const state = (k: string) => checks.find((c) => c.key === k)?.state ?? 'skip'
  if (state('title') === 'fail' || state('authors') === 'fail') return 'mismatch'
  const core = ['doi', 'title', 'authors', 'doi-link']
  return core.every((k) => state(k) === 'pass' || state(k) === 'warn') && state('doi-link') === 'pass' ? 'published' : 'partial'
}

export function headlineOf(verdict: Verdict, pub: Publication | null, pdf: PdfInfo | null = null): string {
  if (!pub && pdf?.titleFound) return `등록된 DOI는 없지만, ${pdf.source}에서 작품명이 실린 원문 PDF(${pdf.pages}쪽)를 확보했습니다. 출판처는 PDF에서 확인하세요.`
  if (!pub) return '제목·저자로 등록된 DOI를 찾지 못했습니다. 논문이 아닌 작품이면 공식 웹 출처로 확인하세요.'
  const where = [pub.publisher, pub.venue].filter(Boolean).join(' · ')
  if (verdict === 'published') return `${where}에 실제로 게재된 논문입니다 (DOI ${pub.doi})${pdf ? '' : ' — PDF는 자동으로 받지 못했습니다'}.`
  if (verdict === 'mismatch') return `비슷한 DOI(${pub.doi})가 있지만 제목 또는 저자가 기록과 다릅니다.`
  return `${where} DOI는 찾았지만 일부 항목을 확인하지 못했습니다.`
}

// ── 기록에 반영할 수정안 ─────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10)
const shortQuote = (q: Quote) => `p.${q.page} "${q.text.length > 220 ? `${q.text.slice(0, 217)}…` : q.text}"`

/** 첫 저자 성 + et al. */
export const shortAuthors = (authors: readonly string[]): string => {
  if (authors.length === 0) return ''
  const family = authors[0].split(' ').at(-1)
  return authors.length > 1 ? `${family} et al.` : authors[0]
}

export function figureMedia(report: VerificationReport, fig: Figure): MediaItem {
  const pub = report.publication
  const lic = pub?.license
  const label = fig.no ? `Figure ${fig.no}` : `p.${fig.page} 이미지`
  return {
    url: pub?.doiUrl ?? report.pdf?.url ?? '',
    image: fig.file,
    credit: pub ? `${shortAuthors(pub.authors)}, ${pub.venue || pub.container} (${pub.year ?? ''}) — ${label}` : label,
    permission: lic && isOpenLicense(lic.url) ? '허용 확인됨' : '권한 확인 필요',
    permission_basis: lic && isOpenLicense(lic.url)
      ? `${lic.label} (${lic.url}) — 출판사가 DOI에 등록한 라이선스. 조건: ${licenseConditions(lic.url).join(', ')}`
      : '',
  }
}

/**
 * 검증 결과를 사례 기록에 반영하는 수정안. 사람이 저장 버튼을 눌러야 파일에 쓰인다.
 * 이미 '확인'인 행은 덮어쓰지 않는다 (작품 정체 행은 DOI가 더 강한 근거라 교체).
 */
export function suggestPatch(c: Case, report: VerificationReport, figureFiles: readonly string[] = []): Partial<Case> {
  const pub = report.publication
  if (!pub || report.verdict !== 'published') return {}
  const stamp = `[자동 검증 ${report.checkedAt.slice(0, 10)}: Crossref DOI 기록${report.pdf?.titleFound ? ' + PDF 원문 대조' : ''}]`
  const evidence = { ...c.evidence }
  evidence.identity = {
    note: `${pub.title} — ${pub.authors.join(', ')}. ${pub.venue || pub.container}, ${pub.publisher}, ${pub.published}${pub.pages ? `, pp.${pub.pages}` : ''}. DOI ${pub.doi} ${stamp}`,
    url: pub.doiUrl,
    status: '확인',
    link_opened: true,
  }
  if (report.pdf && report.techQuotes.length > 0 && c.evidence.technology.status !== '확인') {
    evidence.technology = {
      note: `${report.techQuotes.slice(0, 3).map(shortQuote).join(' / ')} ${stamp}`,
      url: report.pdf.url,
      status: '확인',
      link_opened: true,
    }
  }
  if (report.pdf && report.interactionQuotes.length > 0 && c.evidence.interaction.status !== '확인') {
    evidence.interaction = {
      note: `${report.interactionQuotes.slice(0, 2).map(shortQuote).join(' / ')} ${stamp}`,
      url: report.pdf.url,
      status: '확인',
      link_opened: true,
    }
  }
  const patch: Partial<Case> = { evidence, source_checked_at: today() }
  // 공식 출처가 연구실·기관 페이지면, 출판의 1차 증거인 DOI로 바꾼다 (연구실 페이지는 맥락 행에 남아 있다)
  if (sourceKind(c.source_primary).strength !== 'strong') {
    patch.source_primary = pub.doiUrl
    if (!c.evidence.context.url) evidence.context = { ...c.evidence.context, url: c.source_primary }
  }
  if (!c.ai_evidence) patch.ai_evidence = pub.doiUrl
  if (report.missingAuthors.length > 0) {
    const affiliation = /\(([^)]*)\)/.exec(c.creator)?.[0] ?? ''
    patch.creator = `${pub.authors.join(', ')}${affiliation ? ` ${affiliation}` : ''}`
  }
  if (pub.year && !c.year.includes(String(pub.year))) patch.year = `${pub.year} (${pub.venue || pub.container})`
  const picked = report.figures.filter((f) => figureFiles.includes(f.file)).map((f) => figureMedia(report, f))
  if (picked.length > 0) {
    const keep = c.media.filter((m) => !m.image || !picked.some((p) => p.image === m.image))
    patch.media = [...picked, ...keep].slice(0, 3)
  }
  return patch
}

const PUBLISHER_HOSTS = ['doi.org', 'dl.acm.org', 'ieeexplore.ieee.org', 'link.springer.com', 'sciencedirect.com', 'tandfonline.com', 'mdpi.com', 'nature.com', 'arxiv.org']

/** 기록된 출처가 출판 증거로서 얼마나 강한가 */
export function sourceKind(url: string): { strength: 'strong' | 'medium' | 'weak'; label: string } {
  let host = ''
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return { strength: 'weak', label: '링크 없음' }
  }
  if (PUBLISHER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { strength: 'strong', label: host === 'arxiv.org' ? '프리프린트 (심사 전일 수 있음)' : '출판사·DOI — 출판의 1차 증거' }
  }
  if (/\.(edu|ac\.[a-z]{2})$|media\.mit|lab|research/i.test(host)) {
    return { strength: 'medium', label: '연구실·기관 페이지 — 작품 정체는 알 수 있지만 출판 증거는 아님' }
  }
  return { strength: 'medium', label: '작가·기관 웹페이지 — 출판 증거는 아님' }
}

const EVIDENCE_LABEL: Record<string, string> = { identity: '작품 정체', interaction: '입력·출력', technology: '사용 기술', context: '맥락' }

/** 수정안을 사람이 읽는 한 줄 목록으로 */
export function summarizePatch(c: Case, patch: Partial<Case>): string[] {
  const out: string[] = []
  if (patch.source_primary && patch.source_primary !== c.source_primary) out.push(`공식 출처: ${c.source_primary} → ${patch.source_primary}`)
  if (patch.creator && patch.creator !== c.creator) out.push(`제작자: 논문 저자 전원으로 → ${patch.creator}`)
  if (patch.year && patch.year !== c.year) out.push(`연도: ${c.year} → ${patch.year}`)
  if (patch.ai_evidence && patch.ai_evidence !== c.ai_evidence) out.push(`AI 결합 근거: ${patch.ai_evidence}`)
  if (patch.evidence) {
    for (const k of Object.keys(EVIDENCE_LABEL) as Array<keyof Case['evidence']>) {
      const before = c.evidence[k]
      const after = patch.evidence[k]
      if (after.note !== before.note || after.status !== before.status || after.url !== before.url) {
        out.push(`검증표 '${EVIDENCE_LABEL[k]}': ${before.status} → ${after.status}${after.url !== before.url ? ` (근거 ${after.url})` : ''}`)
      }
    }
  }
  if (patch.media) {
    const added = patch.media.filter((m) => m.image && !c.media.some((o) => o.image === m.image))
    const order = patch.media.map((m) => m.image).join('|') !== c.media.map((m) => m.image).join('|')
    if (added.length || order) out.push(`이미지: 논문 Figure ${patch.media.filter((m) => m.image).length}장 (${patch.media[0]?.permission ?? ''})`)
  }
  return out
}

/** 사례에 학술 출판일 가능성이 있는가 — 일괄 검증 대상 고르기 */
export function looksAcademic(c: Case): boolean {
  const blob = [c.context, c.status, c.year, c.source_primary, c.creator, ...Object.values(c.evidence).map((e) => `${e.url} ${e.note}`)].join(' ')
  return /연구|research|논문|paper|doi|acm|ieee|chi\b|uist|dis\s?20|tei\b|arxiv|media\.mit|university|대학|lab\b|프로토타입/i.test(blob)
}
