import type { Case } from '../lib/schema.ts'
import { selfCheck } from '../lib/selfcheck.ts'

interface SelfCheckListProps {
  c: Case
  all: readonly Case[]
  onToggle?: (key: keyof Case['checklist'], value: boolean) => void
}

const MANUAL_KEYS: Array<keyof Case['checklist']> = ['humor_linked', 'info_not_buried']

/** 지침 10절 완료 전 자체 점검. 자동 항목은 데이터로 판정, 수동 항목은 직접 체크. */
export function SelfCheckList({ c, all, onToggle }: SelfCheckListProps) {
  const items = selfCheck(c, all)
  let manualIndex = 0
  return (
    <ol className="selfcheck">
      {items.map((item) => {
        if (item.auto) {
          return (
            <li key={item.label} className={item.ok ? 'ok' : 'todo'}>
              <span className="mark" aria-hidden="true">{item.ok ? '■' : '□'}</span>
              <span>{item.label}</span>
              <span className="muted small">AUTO</span>
            </li>
          )
        }
        const key = MANUAL_KEYS[manualIndex++]
        return (
          <li key={item.label} className={item.ok ? 'ok' : 'todo'}>
            <input type="checkbox" checked={item.ok} disabled={!onToggle} onChange={(e) => onToggle?.(key, e.target.checked)} aria-label={item.label} />
            <span>{item.label}</span>
            <span className="muted small">직접 확인</span>
          </li>
        )
      })}
    </ol>
  )
}
