import { useState } from 'react'
import { requestDraft } from '../api.ts'
import { IssueCount, Tag } from '../components/Bits.tsx'
import { href } from '../hooks/useHashRoute.ts'
import { isCarouselEmpty } from '../lib/carousel.ts'
import { letterLabel, pad } from '../lib/derive.ts'
import { SCOPE_LABELS, STAGES, type Case } from '../lib/schema.ts'
import { canEnterStage, checkCase, stageIndex } from '../lib/validate.ts'

interface PipelineProps {
  cases: Case[]
  onSave: (c: Case) => Promise<Case>
}

/** 이 칸에 들어오면 Codex가 원고를 자동으로 쓴다 */
const DRAFT_STAGE = '원고 작성'

/** 사례별 원고 자동 생성 상태 */
type DraftStatus = { kind: 'running' } | { kind: 'done' } | { kind: 'error'; message: string }

function DraftBadge({ status }: { status?: DraftStatus }) {
  if (!status) return null
  if (status.kind === 'running') return <p className="draft-badge running" role="status">✍️ Codex가 원고 쓰는 중… (1~3분)</p>
  if (status.kind === 'done') return <p className="draft-badge done" role="status">✓ 원고 초안 완성 — 캐러셀 탭에서 확인</p>
  return <p className="draft-badge error" role="alert">원고 생성 실패: {status.message}</p>
}

interface Blocked {
  id: string
  reasons: string[]
}

function Card({ c, all, onMove, draft }: { c: Case; all: Case[]; onMove?: (c: Case, dir: -1 | 1) => void; draft?: DraftStatus }) {
  const idx = stageIndex(c.stage)
  return (
    <article className="kcard">
      {c.letter_no !== null && <span className="letter-no" title={`LOVE LETTER ${letterLabel(c)}`}>{pad(c.letter_no)}</span>}
      <a href={href(`/case/${c.id}`)} className="kcard-title">
        <span className="muted">{c.id}</span>
        <strong>{c.title}</strong>
      </a>
      <span className="muted small">{c.creator} · {c.year}</span>
      <div className="kcard-tags">
        {c.scope === 'EXTENDED' && <Tag tone="muted">확장</Tag>}
        <IssueCount issues={checkCase(c, all)} />
      </div>
      <DraftBadge status={draft} />
      {onMove && (
        <div className="kcard-move">
          <button type="button" disabled={idx === 0} onClick={() => onMove(c, -1)} aria-label="이전 단계로">←</button>
          <button type="button" disabled={idx === STAGES.length - 1} onClick={() => onMove(c, 1)} aria-label="다음 단계로">→</button>
        </div>
      )}
    </article>
  )
}

export function Pipeline({ cases, onSave }: PipelineProps) {
  const [blocked, setBlocked] = useState<Blocked | null>(null)
  const [saveError, setSaveError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, DraftStatus>>({})
  const setDraft = (id: string, status: DraftStatus) => setDrafts((prev) => ({ ...prev, [id]: status }))

  /** 원고는 Codex가 쓴다(지침 5-1). 저장된 파일이 바뀌면 화면은 자동으로 다시 읽힌다. */
  async function draftFor(c: Case) {
    if (drafts[c.id]?.kind === 'running') return
    setDraft(c.id, { kind: 'running' })
    try {
      await requestDraft(c.id)
      setDraft(c.id, { kind: 'done' })
    } catch (e) {
      setDraft(c.id, { kind: 'error', message: e instanceof Error ? e.message : '알 수 없는 오류' })
    }
  }
  const active = cases.filter((c) => c.scope === 'TANGIBLE' || c.scope === 'EXTENDED')
  const side = cases.filter((c) => c.scope === 'HOLD' || c.scope === 'EXCLUDED')

  async function move(c: Case, dir: -1 | 1) {
    const target = STAGES[stageIndex(c.stage) + dir]
    if (!target) return
    const reasons = dir > 0 ? canEnterStage(c, target, cases) : []
    if (reasons.length > 0) {
      setBlocked({ id: c.id, reasons })
      return
    }
    setBlocked(null)
    setSaveError('')
    try {
      await onSave({ ...c, stage: target })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패')
      return
    }
    if (dir > 0 && target === DRAFT_STAGE && isCarouselEmpty(c)) void draftFor(c)
  }

  return (
    <div className="pipeline">
      <p className="caption">→ 화살표로 '{DRAFT_STAGE}' 칸에 넣으면, 원고가 비어 있는 사례는 Codex가 6장 원고·캡션 초안을 자동으로 씁니다 (써 둔 원고는 덮어쓰지 않아요).</p>
      {blocked && (
        <div className="alert" role="alert">
          <strong>{blocked.id} — 다음 단계로 옮길 수 없습니다</strong>
          <ul>{blocked.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <button type="button" onClick={() => setBlocked(null)}>닫기</button>
        </div>
      )}
      {saveError && <div className="alert" role="alert">{saveError}</div>}
      <div className="board">
        {STAGES.map((stage) => {
          const items = active.filter((c) => c.stage === stage)
          return (
            <section key={stage} className="col">
              <h3 className="col-head">{stage} <span className="muted">{items.length}</span></h3>
              {items.map((c) => <Card key={c.id} c={c} all={cases} onMove={move} draft={drafts[c.id]} />)}
            </section>
          )
        })}
      </div>
      <h3 className="section-head">보류 / 제외 — 검증 부족이거나 범위 밖</h3>
      <div className="side-lane">
        {side.length === 0 && <p className="muted">없음</p>}
        {side.map((c) => (
          <div key={c.id}>
            <Tag tone="muted">{SCOPE_LABELS[c.scope]}</Tag>
            <Card c={c} all={cases} />
          </div>
        ))}
      </div>
    </div>
  )
}
