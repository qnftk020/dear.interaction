import { describe, expect, test } from 'vitest'
import { makeCase, makeReadyCase } from './fixtures.ts'
import { countBy, coverage, nextMilestone, summarize } from './stats.ts'

describe('nextMilestone', () => {
  test('steps through 30 → 100 → 1000 and caps at 1000', () => {
    expect(nextMilestone(0)).toBe(30)
    expect(nextMilestone(30)).toBe(100)
    expect(nextMilestone(1200)).toBe(1000)
  })
})

describe('countBy', () => {
  test('keeps key order, counts arrays, ignores nulls and unknown keys', () => {
    const cases = [makeCase({ tags: { era: ['1990s'] } }), makeCase({ tags: { era: ['1990s', '2000s'] } }), makeCase()]
    expect(countBy(cases, ['2000s', '1990s'], (c) => c.tags.era)).toEqual({ '2000s': 1, '1990s': 2 })
    expect(countBy(cases, ['전시'], (c) => c.what_if.context)).toEqual({ 전시: 0 })
  })
})

describe('summarize', () => {
  test('separates verified, published and candidate cases', () => {
    const cases = [
      makeReadyCase(),
      makeReadyCase({ id: 'BT-A-902', title: 'b', letter_no: 2, stage: '게시됨' }),
      makeCase({ id: 'BT-A-903', title: 'c' }),
      makeReadyCase({ id: 'BT-A-904', title: 'd', letter_no: 4, scope: 'HOLD', stage: '발견' }),
    ]
    const s = summarize(cases)
    expect(s.total).toBe(4)
    expect(s.counted).toBe(2)
    expect(s.published).toBe(1)
    expect(s.byScope.HOLD).toBe(1)
    expect(s.byVerification['검증 부족']).toBe(1)
    expect(s.byWhatIf['박물관 아카이브']).toBe(3)
  })
})

describe('coverage', () => {
  test('counts tangible+extended per tag pair, excludes UNKNOWN and held cases', () => {
    const cases = [
      makeCase({ tags: { input: ['ROTATE'], context: ['MUSEUM'] } }),
      makeCase({ scope: 'EXTENDED', tags: { input: ['ROTATE', 'PRESS'], context: ['MUSEUM'] } }),
      makeCase({ scope: 'EXCLUDED', tags: { input: ['ROTATE'], context: ['MUSEUM'] } }),
    ]
    const m = coverage(cases, 'input', 'context')
    expect(m.rows).not.toContain('UNKNOWN')
    expect(m.cells[m.rows.indexOf('ROTATE')][m.cols.indexOf('MUSEUM')]).toBe(2)
    expect(m.cells[m.rows.indexOf('PRESS')][m.cols.indexOf('MUSEUM')]).toBe(1)
  })
})
