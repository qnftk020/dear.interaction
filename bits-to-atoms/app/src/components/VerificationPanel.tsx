import { useEffect, useState } from 'react'
import { fileUrl, runVerification, uploadPaper } from '../api.ts'
import type { Case } from '../lib/schema.ts'
import {
  isOpenLicense, licenseConditions, sourceKind, suggestPatch, summarizePatch, VERDICT_LABELS,
  type CheckState, type Quote, type VerificationReport,
} from '../lib/scholar.ts'
import { ExtLink, Tag } from './Bits.tsx'

const STATE_MARK: Record<CheckState, string> = { pass: '✓', warn: '!', fail: '✗', skip: '·' }
const VERDICT_TONE = { published: 'ok', partial: 'warn', mismatch: 'error', 'not-found': 'muted' } as const

interface Props {
  draft: Case
  report: VerificationReport | null
  onReport: (r: VerificationReport) => void
  set: (patch: Partial<Case>) => void
}

function QuoteList({ title, quotes, pdf }: { title: string; quotes: Quote[]; pdf: string | null }) {
  if (quotes.length === 0) return null
  return (
    <div className="vf-quotes">
      <h4>{title}</h4>
      <ul>
        {quotes.map((q) => (
          <li key={q.text}>
            <blockquote>{q.text}</blockquote>
            {pdf ? <a href={`${fileUrl(pdf)}#page=${q.page}`} target="_blank" rel="noopener noreferrer" className="vf-page">PDF p.{q.page} ↗</a> : <span className="vf-page">p.{q.page}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 사람이 링크를 열어 보지 않아도: 판정 → 근거 비교 → 단계별 체크 → 원문 인용 → Figure 순서로 읽힌다. */
export function VerificationPanel({ draft, report, onReport, set }: Props) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<string[]>(() => draft.media.flatMap((m) => (m.image ? [m.image] : [])))
  const [applied, setApplied] = useState(false)
  // 보고서가 나중에 도착해도, 아직 고른 그림이 없으면 앞의 두 장(02·03용)을 기본으로 고른다.
  const reportKey = report?.checkedAt
  useEffect(() => {
    if (!report) return
    setPicked((p) => (p.length > 0 ? p : report.figures.slice(0, 2).map((f) => f.file)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey])

  async function run() {
    setRunning(true)
    setError('')
    setApplied(false)
    try {
      const r = await runVerification(draft.id)
      onReport(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : '검증 실패')
    } finally {
      setRunning(false)
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return
    setRunning(true)
    setError('')
    setApplied(false)
    try {
      onReport(await uploadPaper(draft.id, file))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF 올리기 실패')
    } finally {
      setRunning(false)
    }
  }

  const toggle = (file: string) =>
    setPicked((p) => (p.includes(file) ? p.filter((f) => f !== file) : p.length >= 3 ? p : [...p, file]))

  const runButton = (
    <button type="button" className={report ? '' : 'primary'} disabled={running} onClick={() => void run()}>
      {running ? '검증 중… (Crossref·DOI·PDF, 10~40초)' : report ? '다시 검증' : '자동 검증 실행'}
    </button>
  )

  if (!report) {
    return (
      <div className="vf vf-empty">
        <p>
          아직 자동 검증을 하지 않았습니다. 제목·저자로 <b>출판사가 등록한 DOI</b>를 찾고, doi.org 연결과 PDF 원문을 대조해
          "실제로 출판된 논문인지"를 판정합니다. PDF가 열리면 기술 설명 문장과 Figure 사진도 가져옵니다.
        </p>
        {runButton}
        {error && <p className="err">{error}</p>}
      </div>
    )
  }

  const pub = report.publication
  const publisherPage = report.checks.find((c) => c.key === 'publisher-page')?.url
  const recorded = sourceKind(draft.source_primary)
  const patch = suggestPatch(draft, report, picked)
  const changes = summarizePatch(draft, patch)
  const lic = pub?.license

  return (
    <div className="vf">
      <div className={`vf-verdict vf-${VERDICT_TONE[report.verdict]}`}>
        <span className="vf-badge">{report.verdict === 'published' ? '✓' : report.verdict === 'not-found' ? '?' : '!'}</span>
        <div>
          <strong>{VERDICT_LABELS[report.verdict]}</strong>
          <p>{report.headline}</p>
          <p className="vf-when">{report.checkedAt.slice(0, 16).replace('T', ' ')} 자동 검증 · 사람이 링크를 열지 않아도 아래 근거로 판단할 수 있습니다</p>
        </div>
        {runButton}
      </div>
      {error && <p className="err">{error}</p>}

      <div className="vf-compare">
        <div className={`vf-src vf-src-${recorded.strength}`}>
          <span className="vf-src-head">기록된 공식 출처</span>
          <ExtLink url={draft.source_primary} />
          <span>{recorded.label}</span>
        </div>
        <span className="vf-arrow" aria-hidden="true">→</span>
        <div className={`vf-src vf-src-${pub ? 'strong' : 'weak'}`}>
          <span className="vf-src-head">자동 검증이 찾은 출판 근거</span>
          {pub ? <ExtLink url={pub.doiUrl} label={`doi.org/${pub.doi}`} /> : <span className="muted">없음</span>}
          <span>{pub ? `${pub.publisher} 등록 DOI — 출판의 1차 증거` : '학술 DOI 없음 (작품 웹 출처로 검증)'}</span>
        </div>
      </div>

      {pub && (
        <div className="vf-paper">
          <p className="vf-paper-title">{pub.title}</p>
          <p className="vf-paper-authors">
            {pub.authors.map((a, i) => (
              <span key={a} className={report.missingAuthors.includes(a) ? 'vf-missing' : ''} title={report.missingAuthors.includes(a) ? '기록(creator)에 없는 저자' : undefined}>
                {a}{i < pub.authors.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
          <p className="vf-paper-venue">
            {pub.venue}{pub.venue !== pub.container && pub.container ? ` · ${pub.container}` : ''} · {pub.publisher} · {pub.published}{pub.pages ? ` · pp.${pub.pages}` : ''}
          </p>
          <div className="vf-links">
            <ExtLink url={pub.doiUrl} label="DOI" />
            {publisherPage && <ExtLink url={publisherPage} label="출판사 페이지" />}
            {report.pdf && <a href={fileUrl(report.pdf.file)} target="_blank" rel="noopener noreferrer" className="ext">PDF 사본 ({report.pdf.pages}쪽) ↗</a>}
            {report.pdf && <ExtLink url={report.pdf.url} label="PDF 원본 위치" />}
            {lic && <Tag tone={isOpenLicense(lic.url) ? 'ok' : 'warn'}>{lic.label}</Tag>}
          </div>
        </div>
      )}

      {!report.pdf && (
        <div className="vf-upload">
          <p>
            <b>PDF를 자동으로 받지 못했습니다.</b> 출판사(ACM 등)는 자동 접속을 막지만 브라우저로는 열립니다.
            {pub && <> <ExtLink url={pub.doiUrl} label="DOI 페이지 열기" />에서 PDF를 받아 아래에 올리면, 원문 대조·기술 인용·Figure 추출을 이어서 합니다.</>}
          </p>
          <label className="vf-file">
            <input type="file" accept="application/pdf,.pdf" disabled={running} onChange={(e) => void upload(e.target.files?.[0])} />
            <span>{running ? '검증 중…' : 'PDF 직접 올리기'}</span>
          </label>
        </div>
      )}

      <ol className="vf-checks">
        {report.checks.map((c) => (
          <li key={c.key} className={`vf-check vf-check-${c.state}`}>
            <span className="vf-mark" aria-label={c.state}>{STATE_MARK[c.state]}</span>
            <span className="vf-label">{c.label}</span>
            <span className="vf-detail">{c.detail} {c.url && <ExtLink url={c.url} label="근거" />}</span>
          </li>
        ))}
      </ol>

      {(report.techQuotes.length > 0 || report.interactionQuotes.length > 0) && (
        <div className="vf-quote-grid">
          <QuoteList title="원문 인용 — 인터랙션 입력·출력" quotes={report.interactionQuotes} pdf={report.pdf?.file ?? null} />
          <QuoteList title="원문 인용 — 사용 기술" quotes={report.techQuotes} pdf={report.pdf?.file ?? null} />
        </div>
      )}

      {report.figures.length > 0 && (
        <div className="vf-figs">
          <h4>
            논문 Figure — 캐러셀에 쓸 사진 고르기 (최대 3장, 첫 장 → 02, 둘째 → 03)
            {lic && <span className="muted"> · {licenseConditions(lic.url).join(' · ')}</span>}
          </h4>
          <div className="vf-fig-grid">
            {report.figures.map((f) => {
              const on = picked.includes(f.file)
              return (
                <label key={f.file} className={on ? 'vf-fig on' : 'vf-fig'}>
                  <img src={fileUrl(f.file)} alt={f.caption || `p.${f.page} 이미지`} loading="lazy" />
                  <span className="vf-fig-meta">
                    <input type="checkbox" checked={on} onChange={() => toggle(f.file)} />
                    <b>{f.no ? `Figure ${f.no}` : '캡션 없음'}</b> · p.{f.page}
                    {on && <Tag tone="plain">{picked.indexOf(f.file) === 0 ? '02 THE WORK' : picked.indexOf(f.file) === 1 ? '03 HOW IT WORKS' : '후보'}</Tag>}
                  </span>
                  <span className="vf-fig-cap">{f.caption || '캡션을 찾지 못했습니다 — 페이지 번호로 확인하세요.'}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {applied && changes.length === 0 && <p className="ok-line">✓ 검증 결과를 반영했습니다 — 아래 저장을 눌러 data/ 파일에 쓰세요.</p>}
      {changes.length > 0 && (
        <div className="vf-apply">
          <h4>기록에 반영할 내용</h4>
          <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
          <button type="button" className="primary" onClick={() => { set(patch); setApplied(true) }}>
            검증 결과 기록에 반영
          </button>
        </div>
      )}
    </div>
  )
}
