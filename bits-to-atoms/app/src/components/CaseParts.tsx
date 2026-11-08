import { hasValue } from '../lib/derive.ts'
import {
  AXES, CHECK_STATUSES, EVIDENCE_ROWS, MEDIA_PERMISSIONS, SCORE_LABELS, TAXONOMY,
  type Case, type CheckStatus, type EvidenceKey, type MediaItem, type MediaPermission, type ScoreKey,
} from '../lib/schema.ts'
import { isDiscoveryUrl } from '../lib/validate.ts'
import { fileUrl } from '../api.ts'
import { ExtLink, Tag } from './Bits.tsx'

/** INPUT → MECHANISM → OUTPUT. 모든 사례를 같은 틀로 비교한다. */
export function LogicDiagram({ c }: { c: Case }) {
  return (
    <div className="logic">
      <div className="logic-cell">
        <span className="logic-head">INPUT</span>
        <strong>{c.input}</strong>
        <span className="muted">{c.physical_object}</span>
      </div>
      <span className="logic-arrow" aria-hidden="true">→</span>
      <div className="logic-cell">
        <span className="logic-head">MECHANISM</span>
        <strong className={hasValue(c.mechanism) ? '' : 'muted'}>{c.mechanism}</strong>
        <span className="muted">기술 근거 · {c.evidence.technology.status}</span>
      </div>
      <span className="logic-arrow" aria-hidden="true">→</span>
      <div className="logic-cell">
        <span className="logic-head">OUTPUT</span>
        <strong>{c.output}</strong>
      </div>
    </div>
  )
}

export function TagGrid({ c }: { c: Case }) {
  return (
    <dl className="taggrid">
      {AXES.map((axis) => (
        <div key={axis} className="taggrid-row">
          <dt>{TAXONOMY[axis].label}</dt>
          <dd>
            {c.tags[axis].length === 0 ? (
              <span className="muted">—</span>
            ) : (
              c.tags[axis].map((t) => (
                <Tag key={t} tone={t === 'UNKNOWN' ? 'muted' : 'plain'}>{t === 'UNKNOWN' ? '미확인' : t}</Tag>
              ))
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const STATUS_TONE: Record<CheckStatus, 'ok' | 'warn' | 'muted'> = { 확인: 'ok', '부분 확인': 'warn', 미확인: 'muted' }

interface EvidenceTableProps {
  evidence: Case['evidence']
  onChange?: (key: EvidenceKey, patch: Partial<Case['evidence'][EvidenceKey]>) => void
}

/** 지침 7-B 근거 및 사실 검증표. onChange가 없으면 읽기 전용. */
export function EvidenceTable({ evidence, onChange }: EvidenceTableProps) {
  const keys = Object.keys(EVIDENCE_ROWS) as EvidenceKey[]
  return (
    <div className="scroll-x">
      <table className="table evidence">
        <thead>
          <tr><th>항목</th><th>조사 내용</th><th>근거 링크</th><th>링크 열어봄</th><th>확인 상태</th></tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const r = evidence[k]
            return (
              <tr key={k}>
                <th scope="row">{EVIDENCE_ROWS[k]}</th>
                <td>
                  {onChange ? <textarea rows={2} value={r.note} onChange={(e) => onChange(k, { note: e.target.value })} aria-label={`${EVIDENCE_ROWS[k]} 조사 내용`} /> : r.note || '—'}
                </td>
                <td>
                  {onChange ? <input value={r.url} placeholder="https://" onChange={(e) => onChange(k, { url: e.target.value })} aria-label={`${EVIDENCE_ROWS[k]} 근거 링크`} /> : <ExtLink url={r.url} />}
                  {isDiscoveryUrl(r.url) && <Tag tone="error">SNS · 근거 약함</Tag>}
                </td>
                <td>
                  {onChange ? (
                    <input type="checkbox" checked={r.link_opened} onChange={(e) => onChange(k, { link_opened: e.target.checked })} aria-label="링크를 열어 확인함" />
                  ) : r.link_opened ? '✓' : '—'}
                </td>
                <td>
                  {onChange ? (
                    <select value={r.status} onChange={(e) => onChange(k, { status: e.target.value as CheckStatus })} aria-label="확인 상태">
                      {CHECK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface MediaListProps {
  media: MediaItem[]
  onChange?: (media: MediaItem[]) => void
}

const EMPTY_MEDIA: MediaItem = { url: '', credit: '', permission: '권한 확인 필요', permission_basis: '', image: '' }

/** 지침 7-C 이미지·영상 후보 1~3개와 이용 조건. 출처 표기는 허가가 아니다. */
export function MediaList({ media, onChange }: MediaListProps) {
  const update = (i: number, patch: Partial<MediaItem>) => onChange?.(media.map((m, j) => (j === i ? { ...m, ...patch } : m)))
  if (!onChange) {
    if (media.length === 0) return <p className="muted">후보 없음 — 공식 이미지/영상 링크 필요</p>
    return (
      <ul className="sources">
        {media.map((m, i) => (
          <li key={i}>{m.image && <img className="media-thumb" src={fileUrl(m.image)} alt={m.credit} />}<ExtLink url={m.url} /> <span>{m.credit || '크레딧 미확인'}</span> <Tag tone={m.permission === '허용 확인됨' ? 'ok' : 'warn'}>{m.permission}</Tag></li>
        ))}
      </ul>
    )
  }
  return (
    <div className="media-edit">
      {media.map((m, i) => (
        <div key={i} className={m.image ? 'media-row has-image' : 'media-row'}>
          {m.image && <img className="media-thumb" src={fileUrl(m.image)} alt={m.credit} title={m.image} />}
          <input value={m.url} placeholder="공식 이미지/영상 페이지 URL" onChange={(e) => update(i, { url: e.target.value })} aria-label="자료 URL" />
          <input value={m.credit} placeholder="크레딧 (원작자/촬영자)" onChange={(e) => update(i, { credit: e.target.value })} aria-label="크레딧" />
          <select value={m.permission} onChange={(e) => update(i, { permission: e.target.value as MediaPermission })} aria-label="이용 조건">
            {MEDIA_PERMISSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input value={m.permission_basis} placeholder="허용 근거 (라이선스·허락 내역)" onChange={(e) => update(i, { permission_basis: e.target.value })} aria-label="허용 근거" />
          <button type="button" onClick={() => onChange(media.filter((_, j) => j !== i))} aria-label="삭제">×</button>
        </div>
      ))}
      {media.length < 3 && <button type="button" onClick={() => onChange([...media, EMPTY_MEDIA])}>+ 자료 추가</button>}
    </div>
  )
}

const NOTE_SECTIONS = [
  { key: 'fact', label: '확인된 근거' },
  { key: 'interpretation', label: '에디터 해석' },
  { key: 'speculation', label: '미검증 전망' },
] as const

export function NotesBlock({ c }: { c: Case }) {
  return (
    <div className="notes">
      {NOTE_SECTIONS.map((s) => (
        <div key={s.key} className={`note note-${s.key}`}>
          <h4>{s.label}</h4>
          {c.notes[s.key].length === 0 ? <p className="muted">—</p> : (
            <ul>{c.notes[s.key].map((line, i) => <li key={i}>{line}</li>)}</ul>
          )}
        </div>
      ))}
    </div>
  )
}

interface ScoreEditorProps {
  scores: Case['scores']
  onChange?: (key: ScoreKey, value: number | null) => void
}

/** onChange가 없으면 읽기 전용(공개 뷰). */
export function ScoreEditor({ scores, onChange }: ScoreEditorProps) {
  const keys = Object.keys(SCORE_LABELS) as ScoreKey[]
  return (
    <div className="scores">
      {keys.map((k) => (
        <div key={k} className="score-row">
          <span className="score-label">{SCORE_LABELS[k]}</span>
          <span className="score-dots" aria-label={SCORE_LABELS[k]}>
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = scores[k] !== null && n <= (scores[k] ?? 0)
              if (!onChange) return <span key={n} className={filled ? 'dot on' : 'dot'}>{filled ? '■' : '□'}</span>
              return (
                <button key={n} type="button" className={filled ? 'dot on' : 'dot'} aria-label={`${n}점`} aria-pressed={scores[k] === n}
                  onClick={() => onChange(k, scores[k] === n ? null : n)}>
                  {filled ? '■' : '□'}
                </button>
              )
            })}
          </span>
          <span className="score-num">{scores[k] ?? '–'}/5</span>
        </div>
      ))}
      <p className="caption">※ 점수는 큐레이터의 판단이며 공식 사실이 아닙니다.</p>
    </div>
  )
}
