import type { ReactNode } from 'react'
import { bar } from '../lib/filter.ts'
import type { Issue } from '../lib/validate.ts'
import { parseUrl } from '../lib/validate.ts'

interface StatRowProps {
  label: ReactNode
  value: number
  total: number
  width?: number
  suffix?: ReactNode
}

/** 칸 단위 막대: 채운 칸 ■, 빈 칸은 테두리만. 텍스트 글리프(░)는 폰트마다 다르게 그려져서 CSS로 그린다. */
export function StatRow({ label, value, total, width = 16, suffix }: StatRowProps) {
  const cells = bar(value, total, width)
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-bar" aria-hidden="true">
        {[...cells].map((ch, i) => (
          <i key={i} className={ch === '█' ? 'on' : ''} />
        ))}
      </span>
      <span className="stat-value">
        {value}
        {suffix}
      </span>
    </div>
  )
}

interface PanelProps {
  title: string
  /** 제목 아래 한 줄 원칙·설명 */
  hint?: string
  children: ReactNode
  className?: string
}

export function Panel({ title, hint, children, className = '' }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      <h2 className={hint ? 'panel-title has-hint' : 'panel-title'}>{title}</h2>
      {hint && <p className="panel-hint">{hint}</p>}
      {children}
    </section>
  )
}

export function Tag({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'muted' | 'error' | 'warn' | 'ok' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>
}

/** http(s)만 링크로 만든다. 그 외 값은 텍스트로 보여준다. */
export function ExtLink({ url, label }: { url: string; label?: string }) {
  const parsed = parseUrl(url)
  if (!parsed) return <span className="muted">{url || '—'}</span>
  return (
    <a href={parsed.href} target="_blank" rel="noopener noreferrer" className="ext">
      {label ?? parsed.hostname.replace(/^www\./, '')} ↗
    </a>
  )
}

const LEVEL_MARK = { error: 'ERR', warn: 'WARN', info: 'INFO' } as const

export function IssueList({ issues }: { issues: readonly Issue[] }) {
  if (issues.length === 0) return <p className="ok-line">✓ 검증 규칙 위반 없음</p>
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={`${i.field}-${n}`} className={`issue issue-${i.level}`}>
          <span className="issue-mark">{LEVEL_MARK[i.level]}</span>
          <span className="issue-field">{i.field}</span>
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  )
}

export function IssueCount({ issues }: { issues: readonly Issue[] }) {
  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.filter((i) => i.level === 'warn').length
  if (!errors && !warns) return <Tag tone="ok">OK</Tag>
  return (
    <>
      {errors > 0 && <Tag tone="error">ERR {errors}</Tag>}
      {warns > 0 && <Tag tone="warn">WARN {warns}</Tag>}
    </>
  )
}
