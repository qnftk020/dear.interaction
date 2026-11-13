import { describe, expect, test } from 'vitest'
import { checkDaily, dailySchema, type Daily } from './daily.ts'

const item = (title: string) => ({
  title,
  category: '이머시브',
  source: { name: '출처', url: `https://example.com/${encodeURIComponent(title)}`, published: '2026-11-12' },
  happened: '2026-11-12',
  what: '무엇인지 한 줄',
  insight: '인사이트',
  insight_basis: '에디터가 읽어냄',
  idea: '아이디어',
  execution: ['관객이 하는 일'],
})
const daily = (over: Record<string, unknown> = {}): Daily =>
  dailySchema.parse({ date: '2026-11-13', covers: '2026-11-12', items: [item('가'), item('나'), item('다')], ...over })

describe('dailySchema', () => {
  test('accepts three complete items and defaults tech and unknown to empty lists', () => {
    const d = daily()

    expect(d.items).toHaveLength(3)
    expect(d.items[0].tech).toEqual([])
    expect(d.items[0].unknown).toEqual([])
  })

  test('rejects a day that does not have exactly three items', () => {
    const result = dailySchema.safeParse({ date: '2026-11-13', covers: '2026-11-12', items: [item('가'), item('나')] })

    expect(result.success).toBe(false)
  })

  test('rejects an item with no execution steps', () => {
    const result = dailySchema.safeParse({ date: '2026-11-13', covers: '2026-11-12', items: [item('가'), item('나'), { ...item('다'), execution: [] }] })

    expect(result.success).toBe(false)
  })

  test('rejects a category outside the fixed list', () => {
    const result = dailySchema.safeParse({ date: '2026-11-13', covers: '2026-11-12', items: [item('가'), item('나'), { ...item('다'), category: '광고' }] })

    expect(result.success).toBe(false)
  })
})

describe('checkDaily', () => {
  test('returns no problems for a well-formed day', () => {
    expect(checkDaily(daily(), '2026-11-13.yaml')).toEqual([])
  })

  test('reports a file name that differs from the date', () => {
    expect(checkDaily(daily(), '2026-11-14.yaml')).toHaveLength(1)
  })

  test('reports when covers is not the day before the upload date', () => {
    const problems = checkDaily(daily({ covers: '2026-11-11' }), '2026-11-13.yaml')

    expect(problems[0]).toContain('2026-11-12')
  })

  test('handles a month boundary when working out the previous day', () => {
    const d = daily({ date: '2026-12-01', covers: '2026-11-30' })

    expect(checkDaily(d, '2026-12-01.yaml')).toEqual([])
  })

  test('reports the same story listed twice', () => {
    const d = daily({ items: [item('가'), item('가'), item('다')] })

    expect(checkDaily(d, '2026-11-13.yaml')).toContain('같은 소식이 두 번 들어 있습니다')
  })
})
