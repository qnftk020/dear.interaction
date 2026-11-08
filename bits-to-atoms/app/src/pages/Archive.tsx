import { useState } from 'react'
import { ExtLink, IssueCount } from '../components/Bits.tsx'
import { href } from '../hooks/useHashRoute.ts'
import { candidateTable } from '../lib/carousel.ts'
import { letterLabel, repostStatusOf, VERIFICATIONS, verificationOf } from '../lib/derive.ts'
import { EMPTY_FILTERS, filterCases, yearCounts, type Filters } from '../lib/filter.ts'
import { AXES, SCOPE_LABELS, SCOPES, STAGES, TAXONOMY, type Axis, type Case } from '../lib/schema.ts'
import { checkCase } from '../lib/validate.ts'
import { CopyButton } from './ExportTab.tsx'

function Select<T extends string>({ value, onChange, all, options, label, format }: {
  value: T | 'ALL'
  onChange: (v: T | 'ALL') => void
  all: string
  options: readonly T[]
  label: string
  format?: (v: T) => string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T | 'ALL')} aria-label={label}>
      <option value="ALL">{all}</option>
      {options.map((o) => <option key={o} value={o}>{format ? format(o) : o}</option>)}
    </select>
  )
}

function FilterBar({ f, onChange }: { f: Filters; onChange: (f: Filters) => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch })
  return (
    <div className="toolbar">
      <input type="search" placeholder="검색: 작품명 · 작가 · 장소 · 행동" value={f.query} onChange={(e) => set({ query: e.target.value })} aria-label="검색" />
      <select value={f.axis} onChange={(e) => set({ axis: e.target.value as Axis | '', tag: '' })} aria-label="분류 축">
        <option value="">분류 축 전체</option>
        {AXES.map((a) => <option key={a} value={a}>{TAXONOMY[a].label}</option>)}
      </select>
      {f.axis && (
        <select value={f.tag} onChange={(e) => set({ tag: e.target.value })} aria-label="태그">
          <option value="">태그 전체</option>
          {TAXONOMY[f.axis].tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      <Select label="분류" all="분류 전체" value={f.scope} options={SCOPES} format={(s) => SCOPE_LABELS[s]} onChange={(scope) => set({ scope })} />
      <Select label="단계" all="단계 전체" value={f.stage} options={STAGES} onChange={(stage) => set({ stage })} />
      <Select label="검증" all="검증 전체" value={f.verification} options={VERIFICATIONS} onChange={(verification) => set({ verification })} />
      <button type="button" onClick={() => onChange(EMPTY_FILTERS)}>초기화</button>
    </div>
  )
}

/** 연도 칩: 전체 사례 기준 개수라 다른 필터를 바꿔도 칩이 사라지지 않는다. */
function YearChips({ cases, value, onChange }: { cases: Case[]; value: Filters['year']; onChange: (y: Filters['year']) => void }) {
  const { years, unknown } = yearCounts(cases)
  const chip = (key: Filters['year'], label: string, count: number) => (
    <button key={String(key)} type="button" className={value === key ? 'chip on' : 'chip'} aria-pressed={value === key} onClick={() => onChange(key)}>
      {label} <span className="chip-count">{count}</span>
    </button>
  )
  return (
    <div className="chips year-chips" role="group" aria-label="연도로 거르기">
      {chip('ALL', '전체 연도', cases.length)}
      {years.map(({ year, count }) => chip(year, String(year), count))}
      {unknown > 0 && chip('UNKNOWN', '연도 미확인', unknown)}
    </div>
  )
}

const tags = (list: readonly string[]) => (list.length ? list.join(' · ') : '—')

function DbTable({ rows, all }: { rows: Case[]; all: Case[] }) {
  return (
    <table className="table">
      <thead>
        <tr><th>No.</th><th>작품명</th><th>제작자 · 연도</th><th>분류</th><th>INPUT</th><th>OUTPUT</th><th>공식 출처</th><th>검증</th><th>권리</th><th>단계</th><th>규칙</th></tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td><a href={href(`/case/${c.id}`)}>{c.letter_no === null ? c.id : letterLabel(c).split(' ')[0]}</a></td>
            <td><a href={href(`/case/${c.id}`)}><strong>{c.title}</strong></a><br /><span className="muted small">{tags(c.tags.input)}</span></td>
            <td>{c.creator} · {c.year}</td>
            <td>{SCOPE_LABELS[c.scope]}</td>
            <td>{c.input}</td>
            <td>{c.output}</td>
            <td><ExtLink url={c.source_primary} /></td>
            <td>{verificationOf(c)}</td>
            <td>{repostStatusOf(c)}</td>
            <td>{c.stage}</td>
            <td><IssueCount issues={checkCase(c, all)} /></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={11} className="muted">조건에 맞는 사례가 없습니다.</td></tr>}
      </tbody>
    </table>
  )
}

/** 지침 9절 "10개 찾아줘"의 1단계 후보 표 */
function CandidateView({ rows }: { rows: Case[] }) {
  return (
    <>
      <div className="toolbar">
        <CopyButton text={candidateTable(rows)} label="후보 표 마크다운 복사" />
        <span className="caption">작품명 | 작가·연도 | 한 줄 인터랙션 | 탠저블 여부 | 공식 출처</span>
      </div>
      <table className="table">
        <thead><tr><th>작품명</th><th>작가·연도</th><th>한 줄 인터랙션</th><th>탠저블 여부</th><th>공식 출처</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td><a href={href(`/case/${c.id}`)}><strong>{c.title}</strong></a></td>
              <td>{c.creator} · {c.year}</td>
              <td>{c.input} → {c.output}</td>
              <td>{SCOPE_LABELS[c.scope]}</td>
              <td><ExtLink url={c.source_primary} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function Archive({ cases }: { cases: Case[] }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [mode, setMode] = useState<'db' | 'candidates'>('db')
  const rows = filterCases(cases, filters)
  return (
    <div>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'db'} className={mode === 'db' ? 'tab on' : 'tab'} onClick={() => setMode('db')}>아카이브 DB</button>
        <button type="button" role="tab" aria-selected={mode === 'candidates'} className={mode === 'candidates' ? 'tab on' : 'tab'} onClick={() => setMode('candidates')}>후보 표</button>
      </div>
      <FilterBar f={filters} onChange={setFilters} />
      <YearChips cases={cases} value={filters.year} onChange={(year) => setFilters({ ...filters, year })} />
      <p className="caption">{rows.length} / {cases.length} 사례</p>
      <div className="scroll-x">
        {mode === 'db' ? <DbTable rows={rows} all={cases} /> : <CandidateView rows={rows} />}
      </div>
    </div>
  )
}
