import { useEffect, useState } from 'react'
import { fetchVerification } from '../api.ts'
import { Tag } from '../components/Bits.tsx'
import { href } from '../hooks/useHashRoute.ts'
import { letterLabel, repostStatusOf, verificationOf } from '../lib/derive.ts'
import { SCOPE_LABELS, type Case } from '../lib/schema.ts'
import { VERDICT_LABELS, type VerificationReport } from '../lib/scholar.ts'
import { canEnterStage, stageIndex } from '../lib/validate.ts'
import { CarouselTab } from './CarouselTab.tsx'
import { ExportTab } from './ExportTab.tsx'
import { RecordTab } from './RecordTab.tsx'

interface CaseDetailProps {
  original: Case
  all: Case[]
  onSave: (c: Case) => Promise<Case>
  tab: CaseTab
  /** 컬렉션 접두어 ('' 또는 '/entertech') — 뒤로 가기 링크용 */
  base?: string
}

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; lines: string[] }
const TABS = ['RECORD', 'CAROUSEL', 'EXPORT'] as const
export type CaseTab = (typeof TABS)[number]
const TAB_LABELS: Record<CaseTab, string> = { RECORD: '기록', CAROUSEL: '캐러셀', EXPORT: '내보내기' }

/**
 * 탭은 URL(#/case/ID/carousel)에 있어 링크로 공유할 수 있다.
 * key={id}로 렌더되므로 다른 사례로 이동하면 초안이 새로 만들어지고, 탭 이동에는 초안이 유지된다.
 */
export function CaseDetail({ original, all, onSave, tab, base = '' }: CaseDetailProps) {
  const [draft, setDraft] = useState<Case>(original)
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [report, setReport] = useState<VerificationReport | null>(null)
  useEffect(() => {
    let alive = true
    fetchVerification(original.id).then((r) => alive && setReport(r)).catch(() => undefined)
    return () => { alive = false }
  }, [original.id])
  const isDirty = JSON.stringify(draft) !== JSON.stringify(original)
  // 규칙은 다른 사례와 비교하므로, 목록 속 원본 자리에 초안을 끼워 넣는다.
  const others = all.map((c) => (c.id === draft.id ? draft : c))

  const set = (patch: Partial<Case>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSave({ kind: 'idle' })
  }

  async function handleSave() {
    const movingUp = stageIndex(draft.stage) > stageIndex(original.stage)
    const blocking = movingUp ? canEnterStage(draft, draft.stage, others) : []
    if (blocking.length > 0) return setSave({ kind: 'error', lines: blocking })
    setSave({ kind: 'saving' })
    try {
      await onSave(draft)
      setSave({ kind: 'saved' })
    } catch (e) {
      setSave({ kind: 'error', lines: (e instanceof Error ? e.message : '저장 실패').split('\n') })
    }
  }

  const verification = verificationOf(draft)
  return (
    <article className="detail">
      <a href={href(`${base}/archive`)} className="back">← 아카이브</a>
      <header className="detail-head">
        <span className="detail-id">{draft.id} · LOVE LETTER {letterLabel(draft)}</span>
        <h1>{draft.title}</h1>
        <p className="detail-meta">{draft.creator} · {draft.year} · {draft.location} · {draft.context} · {draft.status}</p>
        <p className="detail-summary">{draft.summary_ko}</p>
        <div className="kcard-tags">
          <Tag>{SCOPE_LABELS[draft.scope]}</Tag>
          <Tag tone="muted">{draft.stage}</Tag>
          <Tag tone={verification === '확인' ? 'ok' : verification === '부분 확인' ? 'warn' : 'error'}>
            {verification === '검증 부족' ? '검증 부족 — 게시 보류' : `검증 ${verification}`}
          </Tag>
          <Tag tone={repostStatusOf(draft) === '허용 확인됨' ? 'ok' : 'warn'}>재게시 {repostStatusOf(draft)}</Tag>
          {report && (
            <Tag tone={report.verdict === 'published' ? 'ok' : report.verdict === 'not-found' ? 'muted' : 'warn'}>
              {report.verdict === 'published' && report.publication ? `${report.publication.publisher} 게재 확인 · ${report.publication.venue}` : VERDICT_LABELS[report.verdict]}
            </Tag>
          )}
        </div>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <a key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'tab on' : 'tab'} href={href(`/case/${draft.id}/${t.toLowerCase()}`)}>
            {TAB_LABELS[t]}
          </a>
        ))}
      </div>

      {tab === 'RECORD' && <RecordTab draft={draft} all={others} set={set} report={report} onReport={setReport} />}
      {tab === 'CAROUSEL' && <CarouselTab draft={draft} all={others} set={set} />}
      {tab === 'EXPORT' && <ExportTab draft={draft} all={others} />}

      <div className="save-bar" role="region" aria-label="저장">
        <button type="button" className="primary" disabled={!isDirty || save.kind === 'saving'} onClick={() => void handleSave()}>
          {save.kind === 'saving' ? '저장 중…' : '저장'}
        </button>
        <button type="button" disabled={!isDirty} onClick={() => { setDraft(original); setSave({ kind: 'idle' }) }}>되돌리기</button>
        {isDirty && save.kind === 'idle' && <span className="muted">저장하지 않은 수정이 있습니다</span>}
        {save.kind === 'saved' && <span className="ok-line">✓ data/cases/{draft.id}.yaml 저장됨</span>}
        {save.kind === 'error' && <ul className="issues">{save.lines.map((l) => <li key={l} className="issue issue-error"><span /><span>{l}</span></li>)}</ul>}
      </div>
    </article>
  )
}
