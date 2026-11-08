import { describe, expect, test } from 'vitest'
import { pad } from './derive.ts'
import { makeCase, makeReadyCase } from './fixtures.ts'
import { EMPTY_FILTERS, bar, filterCases, yearCounts, yearOf, type Filters } from './filter.ts'

const cases = [
  makeCase({ id: 'BT-A-001', title: 'Bottle Piece', tags: { input: ['ROTATE'] } }),
  makeReadyCase({ id: 'BT-A-002', title: 'Block Table', scope: 'EXTENDED', tags: { input: ['PLACE'] } }),
]
const ids = (f = EMPTY_FILTERS) => filterCases(cases, f).map((c) => c.id)

describe('filterCases', () => {
  test('empty filters return everything', () => {
    expect(ids()).toEqual(['BT-A-001', 'BT-A-002'])
  })
  test('free text matches case-insensitively', () => {
    expect(ids({ ...EMPTY_FILTERS, query: 'bottle' })).toEqual(['BT-A-001'])
  })
  test('axis + tag filter; axis alone does not filter', () => {
    expect(ids({ ...EMPTY_FILTERS, axis: 'input', tag: 'PLACE' })).toEqual(['BT-A-002'])
    expect(ids({ ...EMPTY_FILTERS, axis: 'input' })).toHaveLength(2)
  })
  test('scope, stage and derived verification filters', () => {
    expect(ids({ ...EMPTY_FILTERS, scope: 'TANGIBLE' })).toEqual(['BT-A-001'])
    expect(ids({ ...EMPTY_FILTERS, stage: '게시 준비' })).toEqual(['BT-A-002'])
    expect(ids({ ...EMPTY_FILTERS, verification: '확인' })).toEqual(['BT-A-002'])
  })
})

describe('year', () => {
  const byYear = [
    makeCase({ id: 'BT-A-001', year: '2025 (sixteen-nine 2025-10-30 보도)' }),
    makeCase({ id: 'BT-A-002', year: "2024 첫 발표(C&C '24) · 2026 박물관 전시" }),
    makeCase({ id: 'BT-A-003', year: 2024 }),
    makeCase({ id: 'BT-A-004', year: '미확인' }),
  ]
  test('yearOf takes the first four-digit year, null when unknown', () => {
    expect(byYear.map(yearOf)).toEqual([2025, 2024, 2024, null])
  })
  test('yearCounts lists years newest first, unknown counted separately', () => {
    expect(yearCounts(byYear)).toEqual({ years: [{ year: 2025, count: 1 }, { year: 2024, count: 2 }], unknown: 1 })
  })
  test('year filter picks one year or the unknown ones', () => {
    const pick = (year: Filters['year']) => filterCases(byYear, { ...EMPTY_FILTERS, year }).map((c) => c.id)
    expect(pick('ALL')).toHaveLength(4)
    expect(pick(2024)).toEqual(['BT-A-002', 'BT-A-003'])
    expect(pick('UNKNOWN')).toEqual(['BT-A-004'])
  })
})

describe('format helpers', () => {
  test('bar clamps and handles zero totals', () => {
    expect(bar(5, 10, 4)).toBe('██░░')
    expect(bar(50, 10, 4)).toBe('████')
    expect(bar(1, 0, 4)).toBe('░░░░')
  })
  test('pad', () => {
    expect(pad(7)).toBe('007')
    expect(pad(12, 4)).toBe('0012')
  })
})
