import { ExtLink, IssueList, Panel } from '../components/Bits.tsx'
import { EvidenceTable, LogicDiagram, MediaList, NotesBlock, ScoreEditor, TagGrid } from '../components/CaseParts.tsx'
import { SelfCheckList } from '../components/SelfCheckList.tsx'
import { VerificationPanel } from '../components/VerificationPanel.tsx'
import type { VerificationReport } from '../lib/scholar.ts'
import { LETTER_TOTAL, SCOPE_LABELS, SCOPES, STAGES, type Case } from '../lib/schema.ts'
import { checkCase } from '../lib/validate.ts'

export type Patch = (patch: Partial<Case>) => void

interface TabProps {
  draft: Case
  all: Case[]
  set: Patch
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd className={value === '미확인' ? 'muted' : ''}>{value}</dd>
    </div>
  )
}

function CurationFields({ draft, set }: Omit<TabProps, 'all'>) {
  const onLetterNo = (raw: string) => {
    const n = Number(raw)
    set({ letter_no: raw === '' || !Number.isInteger(n) ? null : Math.min(Math.max(n, 1), LETTER_TOTAL) })
  }
  return (
    <div className="curation-fields">
      <label className="field">
        <span>stage</span>
        <select value={draft.stage} onChange={(e) => set({ stage: e.target.value as Case['stage'] })}>
          {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="field">
        <span>분류</span>
        <select value={draft.scope} onChange={(e) => set({ scope: e.target.value as Case['scope'] })}>
          {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>LOVE LETTER 번호 (비우면 번호 미배정)</span>
        <input type="number" min={1} max={LETTER_TOTAL} value={draft.letter_no ?? ''} onChange={(e) => onLetterNo(e.target.value)} />
      </label>
      <label className="field">
        <span>출처 확인일</span>
        <input type="date" value={draft.source_checked_at} onChange={(e) => set({ source_checked_at: e.target.value })} />
      </label>
      <label className="field wide">
        <span>web.archive.org 스냅샷</span>
        <input value={draft.archive_snapshot} placeholder="https://web.archive.org/..." onChange={(e) => set({ archive_snapshot: e.target.value })} />
      </label>
    </div>
  )
}

interface RecordTabProps extends TabProps {
  report: VerificationReport | null
  onReport: (r: VerificationReport) => void
}

export function RecordTab({ draft, all, set, report, onReport }: RecordTabProps) {
  return (
    <div className="grid">
      <Panel title="출판 검증 — DOI·PDF 원문 자동 대조" className="span-all">
        <VerificationPanel draft={draft} report={report} onReport={onReport} set={set} />
      </Panel>

      <Panel title="INTERACTION" className="span-2"><LogicDiagram c={draft} /></Panel>
      <Panel title="RULES"><IssueList issues={checkCase(draft, all)} /></Panel>

      <Panel title="근거 및 사실 검증표 — 열어본 링크만 '확인'" className="span-all">
        <EvidenceTable evidence={draft.evidence} onChange={(k, patch) => set({ evidence: { ...draft.evidence, [k]: { ...draft.evidence[k], ...patch } } })} />
        <p className="caption">공식 출처: <ExtLink url={draft.source_primary} /> · 작품 정체와 입력·출력이 모두 '확인'이어야 검증 완료로 넘어갈 수 있습니다.</p>
      </Panel>

      <Panel title="RECORD" className="span-2">
        <dl className="kvs">
          <Field label="summary_ko" value={draft.summary_ko} />
          <Field label="location" value={draft.location} />
          <Field label="context" value={draft.context} />
          <Field label="status" value={draft.status} />
          <Field label="physical_object" value={draft.physical_object} />
          <Field label="mechanism" value={draft.mechanism} />
        </dl>
      </Panel>
      <Panel title="SELF-CHECK — 지침 10절"><SelfCheckList c={draft} all={all} onToggle={(k, v) => set({ checklist: { ...draft.checklist, [k]: v } })} /></Panel>

      <Panel title="이미지·영상 후보와 사용 권한 — 출처 표기 ≠ 재게시 허가" className="span-2">
        <MediaList media={draft.media} onChange={(media) => set({ media })} />
      </Panel>
      <Panel title="TAXONOMY"><TagGrid c={draft} /></Panel>

      <Panel title="FACT / INTERPRETATION / SPECULATION" className="span-all"><NotesBlock c={draft} /></Panel>

      <Panel title="CURATION" className="span-2"><CurationFields draft={draft} set={set} /></Panel>
      <Panel title="ASSESSMENT">
        <ScoreEditor scores={draft.scores} onChange={(k, v) => set({ scores: { ...draft.scores, [k]: v } })} />
      </Panel>
    </div>
  )
}
