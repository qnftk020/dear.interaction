import { verificationOf, type Verification } from './derive.ts'
import type { Axis, Case, Scope, Stage } from './schema.ts'

export interface Filters {
  query: string
  axis: Axis | ''
  tag: string
  scope: Scope | 'ALL'
  verification: Verification | 'ALL'
  stage: Stage | 'ALL'
  /** 연도 하나, 연도를 알 수 없는 사례('UNKNOWN'), 또는 전체 */
  year: number | 'UNKNOWN' | 'ALL'
}

export const EMPTY_FILTERS: Filters = { query: '', axis: '', tag: '', scope: 'ALL', verification: 'ALL', stage: 'ALL', year: 'ALL' }

/** year 칸은 "2025 (… 보도)", "2024 첫 발표 · 2026 …"처럼 자유 문장이라, 처음 나오는 네 자리 연도를 그 사례의 연도로 본다. */
export function yearOf(c: Case): number | null {
  const m = /(?:^|\D)((?:19|20)\d{2})(?!\d)/.exec(c.year)
  return m ? Number(m[1]) : null
}

export interface YearCounts {
  /** 최신 연도부터 */
  years: Array<{ year: number; count: number }>
  unknown: number
}

export function yearCounts(cases: readonly Case[]): YearCounts {
  const counts = new Map<number, number>()
  let unknown = 0
  for (const c of cases) {
    const y = yearOf(c)
    if (y === null) unknown += 1
    else counts.set(y, (counts.get(y) ?? 0) + 1)
  }
  const years = [...counts].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year)
  return { years, unknown }
}

function matchesYear(c: Case, year: Filters['year']): boolean {
  if (year === 'ALL') return true
  const y = yearOf(c)
  return year === 'UNKNOWN' ? y === null : y === year
}

const SEARCH_FIELDS = ['id', 'title', 'creator', 'location', 'summary_ko', 'physical_object', 'input', 'output'] as const

export function filterCases(cases: readonly Case[], f: Filters): Case[] {
  const q = f.query.trim().toLowerCase()
  return cases.filter((c) => {
    if (f.scope !== 'ALL' && c.scope !== f.scope) return false
    if (f.stage !== 'ALL' && c.stage !== f.stage) return false
    if (f.verification !== 'ALL' && verificationOf(c) !== f.verification) return false
    if (!matchesYear(c, f.year)) return false
    if (f.axis && f.tag && !(c.tags[f.axis] as readonly string[]).includes(f.tag)) return false
    return !q || SEARCH_FIELDS.some((k) => c[k].toLowerCase().includes(q))
  })
}

/** 막대 칸 계산: █ = 채움, ░ = 빈 칸 */
export function bar(value: number, total: number, width = 20): string {
  const ratio = total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0
  const filled = Math.round(ratio * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
