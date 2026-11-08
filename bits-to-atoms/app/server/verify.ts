/**
 * 학술 출판 자동 검증 루트 (dev 서버·CLI 공용).
 *
 *  1. DOI 찾기   — 기록의 링크 → 공식 출처 페이지 본문 → Crossref 제목·저자 검색
 *  2. Crossref   — 출판사가 등록한 제목·저자·게재처·라이선스를 기록과 대조
 *  3. DOI 연결   — doi.org가 출판사 페이지(dl.acm.org 등)로 보내는지
 *  4. 출판사 DL  — 직접 열리는지 (ACM은 자동 접속을 Cloudflare로 막는다 → 경고만)
 *  5. PDF        — 공식 출처 페이지·Crossref·Semantic Scholar에서 받은 PDF가 같은 논문인지 (제목·DOI 대조)
 *  6. 원문 근거  — 기술·인터랙션 문장을 페이지 번호와 함께 인용
 *  7. Figure     — PDF에 들어 있는 사진을 캡션과 짝지어 data/figures/<id>/ 에 저장
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { extractImages, extractText, getDocumentProxy } from 'unpdf'
import type { Case } from '../src/lib/schema.ts'
import { ID_PATTERN } from '../src/lib/schema.ts'
import {
  authorOverlap, figureCaptions, findDoi, headlineOf, interactionQuotes, licenseLabel, normTitle, techQuotes, titleMatch,
  verdictOf, type Figure, type PdfInfo, type Publication, type VerificationReport, type VerifyCheck,
} from '../src/lib/scholar.ts'

// pdf.js가 쓰는 ArrayBuffer.transferToFixedLength는 Node 21+에만 있다. Node 20에서 이미지 추출이 조용히 실패하지 않도록 채운다.
const AB = ArrayBuffer.prototype as unknown as Record<string, unknown>
if (typeof AB.transferToFixedLength !== 'function') {
  AB.transferToFixedLength = function (this: ArrayBuffer, len = this.byteLength) {
    const out = new ArrayBuffer(len)
    new Uint8Array(out).set(new Uint8Array(this, 0, Math.min(len, this.byteLength)))
    return out
  }
}
if (typeof AB.transfer !== 'function') AB.transfer = AB.transferToFixedLength

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 dear-interaction-verifier/0.1'
const TIMEOUT_MS = 25_000
const MAX_PDF_BYTES = 40 * 1024 * 1024
const MAX_HTML_BYTES = 3 * 1024 * 1024
const MIN_FIGURE_SIDE = 220
const MAX_FIGURES = 8
const FIGURE_WIDTH = 1600

export interface VerifyDirs {
  /** 검증 보고서 JSON (data/verification) */
  reports: string
  /** 그림·PDF 사본 (data/figures) */
  figures: string
  /** 사용자가 직접 올린 PDF (data/verification/uploads) — 검증할 때 그림 폴더를 지워도 남는다 */
  uploads: string
}

export type Fetcher = typeof fetch

interface FetchResult {
  status: number
  url: string
  redirectedTo: string | null
  contentType: string
  body: Uint8Array | null
  error?: string
}

async function get(fetcher: Fetcher, url: string, opts: { maxBytes?: number; redirect?: RequestRedirect; accept?: string } = {}): Promise<FetchResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetcher(url, {
      redirect: opts.redirect ?? 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: opts.accept ?? '*/*' },
    })
    const len = Number(res.headers.get('content-length') ?? 0)
    const max = opts.maxBytes ?? MAX_HTML_BYTES
    let body: Uint8Array | null = null
    if (opts.redirect !== 'manual' && len <= max) {
      const buf = new Uint8Array(await res.arrayBuffer())
      body = buf.byteLength <= max ? buf : null
    }
    return {
      status: res.status,
      url: res.url || url,
      redirectedTo: res.headers.get('location'),
      contentType: res.headers.get('content-type') ?? '',
      body,
    }
  } catch (e) {
    return { status: 0, url, redirectedTo: null, contentType: '', body: null, error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

const text = (r: FetchResult) => (r.body ? new TextDecoder().decode(r.body) : '')
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ── Crossref ────────────────────────────────────────────────

interface CrossrefWork {
  DOI: string
  title?: string[]
  author?: Array<{ given?: string; family?: string; name?: string }>
  'container-title'?: string[]
  publisher?: string
  type?: string
  page?: string
  published?: { 'date-parts'?: number[][] }
  issued?: { 'date-parts'?: number[][] }
  license?: Array<{ URL: string; 'content-version'?: string }>
  link?: Array<{ URL: string; 'content-type'?: string }>
  event?: { name?: string; acronym?: string }
}

const authorName = (a: NonNullable<CrossrefWork['author']>[number]) => (a.name ?? [a.given, a.family].filter(Boolean).join(' ')).trim()

function toPublication(w: CrossrefWork, foundBy: Publication['foundBy']): Publication {
  const parts = (w.published ?? w.issued)?.['date-parts']?.[0] ?? []
  const lic = w.license?.find((l) => l['content-version'] === 'vor') ?? w.license?.[0]
  const doi = w.DOI.toLowerCase()
  return {
    doi,
    doiUrl: `https://doi.org/${doi}`,
    title: w.title?.[0] ?? '',
    authors: (w.author ?? []).map(authorName).filter(Boolean),
    venue: w.event?.acronym ?? w['container-title']?.[0] ?? '',
    container: w['container-title']?.[0] ?? '',
    publisher: w.publisher ?? '',
    type: w.type ?? '',
    published: parts.map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0'))).join('-'),
    year: parts[0] ?? null,
    pages: w.page ?? '',
    license: lic ? { url: lic.URL, label: licenseLabel(lic.URL) } : null,
    foundBy,
  }
}

async function crossrefWork(fetcher: Fetcher, doi: string): Promise<CrossrefWork | null> {
  const r = await get(fetcher, `https://api.crossref.org/works/${encodeURIComponent(doi)}`, { accept: 'application/json' })
  if (r.status !== 200) return null
  try {
    return (JSON.parse(text(r)) as { message: CrossrefWork }).message
  } catch {
    return null
  }
}

/** 제목(+첫 저자 성)으로 검색해서, 제목이 맞고 저자가 1명 이상 겹치는 후보만 받아들인다. */
async function crossrefSearch(fetcher: Fetcher, c: Case): Promise<CrossrefWork | null> {
  const q = new URLSearchParams({
    'query.bibliographic': `${c.title} ${c.creator.replace(/\([^)]*\)/g, ' ')}`.slice(0, 300),
    rows: '8',
    select: 'DOI,title,author,container-title,publisher,type,page,published,issued,license,link,event',
  })
  const r = await get(fetcher, `https://api.crossref.org/works?${q}`, { accept: 'application/json' })
  if (r.status !== 200) return null
  let items: CrossrefWork[] = []
  try {
    items = (JSON.parse(text(r)) as { message: { items: CrossrefWork[] } }).message.items
  } catch {
    return null
  }
  const ranked = items
    .map((w) => {
      const tm = titleMatch(c.title, w.title?.[0] ?? '')
      const { matched } = authorOverlap(c.creator, (w.author ?? []).map(authorName))
      return { w, tm, authors: matched.length }
    })
    // 짧은 제목은 우연히 같은 글(사전 항목 등)이 많다 — 기록에 저자 이름이 있으면 한 명 이상 겹쳐야 받는다
    .filter((x) => x.tm !== 'none' && (x.authors > 0 || (x.tm === 'exact' && !/\p{L}{2,}\s+\p{L}{2,}/u.test(c.creator.replace(/\([^)]*\)/g, '')))))
    .sort((a, b) => b.authors - a.authors)
  return ranked[0]?.w ?? null
}

/** 기록(creator)에 사람 이름이 적혀 있는가 ("Chuanqi Sun, …" / "Sergi Jordà 외") */
const hasPersonNames = (creator: string): boolean => /\p{Lu}\p{Ll}+\s+\p{Lu}\p{Ll}+/u.test(creator.replace(/\([^)]*\)/g, ''))

/** arXiv 제목 검색 → 제목이 맞고 저자가 한 명 이상 겹치는 첫 PDF (짧은 제목은 남의 논문이 잘 걸린다) */
async function arxivPdf(fetcher: Fetcher, title: string, creator: string): Promise<string | null> {
  const q = `ti:"${title.replace(/["\\]/g, ' ').slice(0, 200)}"`
  const r = await get(fetcher, `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&max_results=3`, { accept: 'application/atom+xml' })
  if (r.status !== 200) return null
  for (const entry of text(r).split('<entry>').slice(1)) {
    const t = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] ?? ''
    const id = /<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/.exec(entry)?.[1]
    const names = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1].trim())
    const authorsOk = hasPersonNames(creator) ? authorOverlap(creator, names).matched.length > 0 : titleMatch(title, t) !== 'similar'
    if (id && titleMatch(title, t) !== 'none' && authorsOk) return `https://arxiv.org/pdf/${id}`
  }
  return null
}

// ── 공식 출처 페이지 ─────────────────────────────────────────

interface SourcePage {
  url: string
  html: string
}

const PDF_HREF = /href\s*=\s*["']([^"']+)["']/gi

function pdfLinks(page: SourcePage): string[] {
  const out: string[] = []
  for (const m of page.html.matchAll(PDF_HREF)) {
    const href = m[1]
    if (!/\.pdf($|[?#])|\/pdf($|[/?#])|\/PDF($|[/?#])|arxiv\.org\/pdf/i.test(href)) continue
    try {
      out.push(new URL(href.replace(/&amp;/g, '&'), page.url).href)
    } catch { /* 잘못된 href */ }
  }
  return [...new Set(out)]
}

function recordUrls(c: Case): string[] {
  const urls = [c.source_primary, c.ai_evidence, ...Object.values(c.evidence).map((e) => e.url), ...c.media.map((m) => m.url)]
  return [...new Set(urls.filter((u) => /^https?:\/\//.test(u)))]
}

// ── PDF ─────────────────────────────────────────────────────

interface PdfCandidate {
  url: string
  source: string
  /** 사용자가 직접 올린 PDF (data/figures/<id>/upload.pdf) */
  localFile?: string
}

export const isPdf = (bytes: Uint8Array): boolean => new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
export const UPLOAD_NAME = 'upload.pdf'

/** 브라우저에서 받은 PDF를 올린다 (출판사가 자동 접속을 막을 때). 다음 검증부터 가장 먼저 쓴다. */
export async function savePaperUpload(dirs: VerifyDirs, id: string, bytes: Uint8Array): Promise<void> {
  if (!ID_PATTERN.test(id)) throw new Error(`잘못된 id입니다: ${id}`)
  if (!isPdf(bytes)) throw new Error('PDF 파일이 아닙니다.')
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error('PDF가 너무 큽니다 (40MB 이하).')
  await mkdir(path.join(dirs.uploads, id), { recursive: true })
  await writeFile(path.join(dirs.uploads, id, UPLOAD_NAME), bytes)
}

interface ParsedPdf {
  bytes: Uint8Array
  pages: string[]
  info: Omit<PdfInfo, 'file'>
}

async function tryPdf(fetcher: Fetcher, cand: PdfCandidate, pub: Publication | null, c: Case): Promise<ParsedPdf | null> {
  let bytes: Uint8Array
  let finalUrl = cand.url
  if (cand.localFile) {
    bytes = new Uint8Array(await readFile(cand.localFile))
  } else {
    const r = await get(fetcher, cand.url, { maxBytes: MAX_PDF_BYTES, accept: 'application/pdf,*/*' })
    if (r.status !== 200 || !r.body) return null
    bytes = r.body
    finalUrl = r.url
  }
  if (!isPdf(bytes)) return null
  const pdf = await getDocumentProxy(bytes.slice())
  const { text: pages, totalPages } = await extractText(pdf, { mergePages: false })
  const first = normTitle((pages[0] ?? '').slice(0, 3000))
  const wanted = [pub?.title, c.title].filter(Boolean).map((t) => normTitle(t as string))
  const titleFound = wanted.some((t) => t.length > 3 && first.includes(t))
  const all = pages.join('\n').toLowerCase()
  const doiFound = pub ? all.includes(pub.doi) : false
  return { bytes, pages, info: { url: finalUrl, source: cand.source, pages: totalPages, titleFound, doiFound } }
}

async function extractFigures(bytes: Uint8Array, pages: readonly string[], outDir: string, relDir: string): Promise<Figure[]> {
  const pdf = await getDocumentProxy(bytes.slice())
  const figures: Figure[] = []
  for (let p = 1; p <= pdf.numPages && figures.length < MAX_FIGURES; p++) {
    let images: Awaited<ReturnType<typeof extractImages>> = []
    try {
      images = await extractImages(pdf, p)
    } catch {
      continue
    }
    const big = images.filter((im) => Math.min(im.width, im.height) >= MIN_FIGURE_SIDE && im.width * im.height >= 120_000)
    const captions = figureCaptions(pages[p - 1] ?? '')
    for (const [i, im] of big.entries()) {
      if (figures.length >= MAX_FIGURES) break
      const cap = captions[i]
      const name = cap ? `fig-${cap.no}.jpg` : `p${p}-img${i + 1}.jpg`
      const channels = im.channels as 1 | 2 | 3 | 4
      const out = await sharp(Buffer.from(im.data.buffer, im.data.byteOffset, im.data.byteLength), {
        raw: { width: im.width, height: im.height, channels },
        limitInputPixels: false,
      })
        .flatten({ background: '#ffffff' })
        .resize({ width: FIGURE_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true })
        .toFile(path.join(outDir, name))
      figures.push({
        no: cap?.no ?? null,
        caption: cap?.caption ?? '',
        page: p,
        file: `${relDir}/${name}`,
        width: out.width,
        height: out.height,
      })
    }
  }
  return figures.sort((a, b) => (a.no ?? 99) - (b.no ?? 99) || a.page - b.page)
}

// ── 본체 ────────────────────────────────────────────────────

const countMentions = (hay: string, needle: string): number => {
  const n = normTitle(needle)
  if (n.length < 3) return 0
  return normTitle(hay).split(n).length - 1
}

const check = (key: string, label: string, state: VerifyCheck['state'], detail: string, url?: string): VerifyCheck =>
  ({ key, label, state, detail, ...(url ? { url } : {}) })

export async function verifyCase(c: Case, dirs: VerifyDirs, fetcher: Fetcher = fetch): Promise<VerificationReport> {
  if (!ID_PATTERN.test(c.id)) throw new Error(`잘못된 id입니다: ${c.id}`)
  const checks: VerifyCheck[] = []

  // 1. 기록 링크와 공식 출처 페이지
  const urls = recordUrls(c)
  const pages: SourcePage[] = []
  for (const u of urls.slice(0, 4)) {
    if (/\.pdf($|\?)/i.test(u)) continue
    const r = await get(fetcher, u, { accept: 'text/html' })
    if (r.status === 200 && /html/i.test(r.contentType)) pages.push({ url: r.url, html: text(r) })
  }

  // 2. DOI
  let foundBy: Publication['foundBy'] = 'record'
  let doi = urls.map(findDoi).find(Boolean) ?? null
  if (!doi) {
    doi = pages.map((p) => findDoi(p.html)).find(Boolean) ?? null
    foundBy = 'source-page'
  }
  let work = doi ? await crossrefWork(fetcher, doi) : null
  if (!work) {
    work = await crossrefSearch(fetcher, c)
    foundBy = 'crossref-search'
  }
  const pub = work ? toPublication(work, foundBy) : null

  if (!pub) {
    checks.push(check('doi', 'DOI 등록 (Crossref)', 'fail', `"${c.title}" 제목·저자로 등록된 학술 DOI가 없습니다.`))
  } else {
    const how = { record: '기록의 링크에서', 'source-page': '공식 출처 페이지 본문에서', 'crossref-search': 'Crossref 제목·저자 검색으로' }[foundBy]
    checks.push(check('doi', 'DOI 등록 (Crossref)', 'pass', `${pub.doi} — ${how} 찾음. ${pub.publisher}에서 직접 등록한 출판 번호입니다.`, `https://api.crossref.org/works/${pub.doi}`))
    const venueBits = [pub.venue !== pub.container ? `${pub.venue} (${pub.container})` : pub.container, pub.publisher, pub.pages && `pp.${pub.pages}`, pub.published]
    checks.push(check('venue', '게재처', 'pass', `${venueBits.filter(Boolean).join(' · ')} · 유형 ${pub.type}`))

    checks.push(check('title', '제목 일치', 'skip', '')) // PDF 본문까지 본 뒤 아래에서 채운다

    const { matched, missing } = authorOverlap(c.creator, pub.authors)
    const authorState = matched.length === 0 ? 'fail' : missing.length > 0 ? 'warn' : 'pass'
    const authorDetail = matched.length === 0
      ? `논문 저자(${pub.authors.join(', ')}) 중 기록과 겹치는 사람이 없습니다.`
      : `${matched.length}/${pub.authors.length}명 일치${missing.length ? ` · 기록에 없는 저자: ${missing.join(', ')}` : ''}`
    checks.push(check('authors', '저자 일치', authorState, authorDetail))

    const yearOk = pub.year !== null && c.year.includes(String(pub.year))
    checks.push(check('year', '연도 일치', yearOk ? 'pass' : 'warn', `기록 "${c.year}" ↔ 출판 ${pub.published || '미상'}`))

    // 3. doi.org → 출판사
    const resolve = await get(fetcher, pub.doiUrl, { redirect: 'manual' })
    const target = resolve.redirectedTo ? new URL(resolve.redirectedTo, pub.doiUrl).href : ''
    checks.push(target
      ? check('doi-link', 'DOI 링크 연결', 'pass', `doi.org → ${host(target)} (출판사 공식 페이지)`, pub.doiUrl)
      : check('doi-link', 'DOI 링크 연결', 'fail', `doi.org가 출판사로 연결하지 않았습니다 (HTTP ${resolve.status || resolve.error}).`, pub.doiUrl))

    // 4. 출판사 디지털 라이브러리
    if (target) {
      const landing = await get(fetcher, target, { accept: 'text/html' })
      const body = text(landing)
      const blocked = landing.status === 403 || /just a moment|cf-chl|challenge-platform/i.test(body)
      if (landing.status === 200 && !blocked) {
        checks.push(check('publisher-page', `${host(target)} 페이지`, 'pass', '자동 접속으로 열림', target))
      } else if (blocked) {
        checks.push(check('publisher-page', `${host(target)} 페이지`, 'warn',
          '봇 차단(Cloudflare)으로 자동 접속 불가. 브라우저로는 열립니다. 게재 여부는 위 DOI 기록으로 이미 확인됨.', target))
      } else {
        checks.push(check('publisher-page', `${host(target)} 페이지`, 'warn', `HTTP ${landing.status || landing.error}`, target))
      }
    }

    // 라이선스
    checks.push(pub.license
      ? check('license', '이용 라이선스', /creativecommons/.test(pub.license.url) ? 'pass' : 'warn', `${pub.license.label} — 출판사가 DOI에 등록`, pub.license.url)
      : check('license', '이용 라이선스', 'warn', '등록된 라이선스 없음 — 그림 재게시는 별도 허락 필요'))
  }

  // 5. PDF
  const candidates: PdfCandidate[] = []
  const upload = path.join(dirs.uploads, c.id, UPLOAD_NAME)
  if (existsSync(upload)) candidates.push({ url: `local:${c.id}/${UPLOAD_NAME}`, source: '직접 올린 PDF', localFile: upload })
  for (const u of urls) if (/\.pdf($|\?)/i.test(u)) candidates.push({ url: u, source: '기록의 링크' })
  for (const p of pages) for (const u of pdfLinks(p)) candidates.push({ url: u, source: `${host(p.url)} 페이지의 PDF 링크` })
  for (const l of work?.link ?? []) candidates.push({ url: l.URL, source: `Crossref 등록 링크 (${host(l.URL)})` })
  if (pub) {
    const s2 = await get(fetcher, `https://api.semanticscholar.org/graph/v1/paper/DOI:${pub.doi}?fields=openAccessPdf`, { accept: 'application/json' })
    try {
      const oa = (JSON.parse(text(s2)) as { openAccessPdf?: { url?: string } }).openAccessPdf?.url
      if (oa) candidates.push({ url: oa, source: 'Semantic Scholar 오픈액세스' })
    } catch { /* 없음 */ }
  }
  const arxiv = await arxivPdf(fetcher, pub?.title ?? c.title, c.creator)
  if (arxiv) candidates.push({ url: arxiv, source: 'arXiv 제목 검색' })
  const seen = new Set<string>()
  let parsed: ParsedPdf | null = null
  const tried: string[] = []
  for (const cand of candidates) {
    if (seen.has(cand.url) || tried.length >= 7) continue
    seen.add(cand.url)
    tried.push(cand.localFile ? '직접 올린 PDF' : host(cand.url))
    try {
      const got = await tryPdf(fetcher, cand, pub, c)
      if (got && (got.info.titleFound || got.info.doiFound)) {
        parsed = got
        break
      }
    } catch { /* 다음 후보 */ }
  }

  const relDir = `figures/${c.id}`
  const figDir = path.join(dirs.figures, c.id)
  let pdfInfo: PdfInfo | null = null
  let figures: Figure[] = []
  if (parsed) {
    await rm(figDir, { recursive: true, force: true })
    await mkdir(figDir, { recursive: true })
    await writeFile(path.join(figDir, 'paper.pdf'), parsed.bytes)
    pdfInfo = { ...parsed.info, file: `${relDir}/paper.pdf` }
    checks.push(check('pdf', 'PDF 원문 확보', 'pass', `${parsed.info.source}에서 받음 · ${parsed.info.pages}쪽`, parsed.info.url))
    const same = parsed.info.titleFound && (parsed.info.doiFound || !pub)
    checks.push(check('pdf-match', 'PDF = 같은 논문', same ? 'pass' : 'warn',
      `첫 쪽 제목 ${parsed.info.titleFound ? '일치' : '불일치'}${pub ? ` · 본문 DOI ${parsed.info.doiFound ? '일치' : '없음'}` : ''}`))
    try {
      figures = await extractFigures(parsed.bytes, parsed.pages, figDir, relDir)
    } catch (e) {
      console.error('[verify] figure 추출 실패', e)
    }
    checks.push(check('figures', 'Figure 추출', figures.length ? 'pass' : 'warn',
      figures.length ? `사진 ${figures.length}장 · 캡션 ${figures.filter((f) => f.caption).length}개 연결` : 'PDF 안에 사진(래스터 이미지)이 없습니다. 도식은 벡터라 추출되지 않습니다.'))
  } else {
    // 예전 검증에서 받은 그림이 남아 엉뚱한 근거로 보이지 않게 지운다. 기록이 이미 쓰는 그림이면 남긴다.
    if (!c.media.some((m) => m.image.startsWith(`${relDir}/`))) await rm(figDir, { recursive: true, force: true })
    checks.push(check('pdf', 'PDF 원문 확보', 'warn',
      tried.length ? `후보 ${tried.length}곳(${[...new Set(tried)].join(', ')})에서 열 수 있는 원문을 찾지 못했습니다.` : 'PDF 링크 후보가 없습니다.'))
  }

  // 제목: 작품명이 논문 제목과 달라도, 같은 저자의 PDF 본문에 작품명이 여러 번 나오면 "이 논문에서 소개된 작품"으로 본다
  if (pub) {
    const tm = titleMatch(c.title, pub.title)
    const tmText = { exact: '완전히 같음', prefix: '부제만 생략 — 같은 작품', similar: '표기만 조금 다름', none: '다름' }[tm]
    const mentions = parsed ? countMentions(parsed.pages.join('\n'), c.title) : 0
    const idx = checks.findIndex((x) => x.key === 'title')
    checks[idx] = tm !== 'none'
      ? check('title', '제목 일치', tm === 'similar' ? 'warn' : 'pass', `기록 "${c.title}" ↔ 논문 "${pub.title}" — ${tmText}`)
      : mentions >= 2
        ? check('title', '제목 일치', 'warn', `논문 제목은 "${pub.title}"이지만, PDF 본문에 "${c.title}"가 ${mentions}번 나옵니다 — 이 논문 안에서 소개된 작품으로 보입니다.`)
        : check('title', '제목 일치', 'fail', `기록 "${c.title}" ↔ 논문 "${pub.title}" — 다름${parsed ? ' (PDF 본문에도 작품명이 거의 없음)' : ''}`)
  }

  const tq = parsed ? techQuotes(parsed.pages) : []
  const iq = parsed ? interactionQuotes(parsed.pages) : []
  if (parsed) {
    checks.push(check('tech', '사용 기술 근거', tq.length ? 'pass' : 'warn', tq.length ? `원문에서 ${tq.length}문장 인용` : '원문에서 기술 설명 문장을 찾지 못했습니다.'))
  }

  const verdict = verdictOf(checks, pub)
  const report: VerificationReport = {
    id: c.id,
    checkedAt: new Date().toISOString(),
    verdict,
    headline: headlineOf(verdict, pub, pdfInfo),
    publication: pub,
    pdf: pdfInfo,
    checks,
    figures,
    techQuotes: tq,
    interactionQuotes: iq,
    missingAuthors: pub ? authorOverlap(c.creator, pub.authors).missing : [],
  }
  await saveReport(dirs, report)
  return report
}

const reportFile = (dirs: VerifyDirs, id: string) => {
  if (!ID_PATTERN.test(id)) throw new Error(`잘못된 id입니다: ${id}`)
  return path.join(dirs.reports, `${id}.json`)
}

export async function saveReport(dirs: VerifyDirs, report: VerificationReport): Promise<void> {
  await mkdir(dirs.reports, { recursive: true })
  await writeFile(reportFile(dirs, report.id), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

export async function loadReport(dirs: VerifyDirs, id: string): Promise<VerificationReport | null> {
  const file = reportFile(dirs, id)
  if (!existsSync(file)) return null
  return JSON.parse(await readFile(file, 'utf8')) as VerificationReport
}

export async function loadReports(dirs: VerifyDirs): Promise<VerificationReport[]> {
  if (!existsSync(dirs.reports)) return []
  const files = (await readdir(dirs.reports)).filter((f) => f.endsWith('.json'))
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dirs.reports, f), 'utf8')) as VerificationReport))
}

const MIME: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' }

/** /files/figures/<id>/<name> → data/figures/<id>/<name>. 폴더 밖 경로는 막는다. */
export function figureFilePath(figuresDir: string, subPath: string): { file: string; mime: string } | null {
  const m = /^\/?figures\/(BT-[A-Z]-\d{3,4})\/([\w.-]+)$/.exec(decodeURIComponent(subPath))
  if (!m) return null
  const mime = MIME[path.extname(m[2]).toLowerCase()]
  if (!mime) return null
  return { file: path.join(figuresDir, m[1], m[2]), mime }
}
