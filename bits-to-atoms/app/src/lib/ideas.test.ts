import { describe, expect, test } from 'vitest'
import { makeCase, makeReadyCase } from './fixtures.ts'
import { collectIdeas, filterIdeas } from './ideas.ts'

const idea = (id: string, context: string | null, copy = '아이디어 원고') =>
  makeCase({ id, title: id, what_if: { context, audience: '관람객' }, carousel: { what_if: copy } })

describe('collectIdeas', () => {
  test('keeps cases that have 05 copy or a context, in archive order', () => {
    const { ideas } = collectIdeas([idea('BT-A-902', '전시'), makeReadyCase(), idea('BT-A-903', null, '')])
    expect(ideas.map((i) => i.id)).toEqual(['BT-A-901', 'BT-A-902'])
  })
  test('cases without any 05 content are listed as missing', () => {
    const { missing } = collectIdeas([makeCase(), idea('BT-A-902', '전시')])
    expect(missing.map((c) => c.id)).toEqual(['BT-A-901'])
  })
  test('excluded cases are left out entirely', () => {
    const { ideas, missing } = collectIdeas([idea('BT-A-902', '전시'), makeCase({ id: 'BT-A-903', scope: 'EXCLUDED' })])
    expect(ideas).toHaveLength(1)
    expect(missing).toHaveLength(0)
  })
  test('counts ideas per context, unset context as 맥락 미정', () => {
    const { counts } = collectIdeas([idea('BT-A-902', '전시'), idea('BT-A-903', '전시'), idea('BT-A-904', null)])
    expect(counts['전시']).toBe(2)
    expect(counts['맥락 미정']).toBe(1)
    expect(counts['박물관 아카이브']).toBe(0)
  })
})

describe('filterIdeas', () => {
  const { ideas } = collectIdeas([idea('BT-A-902', '전시'), idea('BT-A-903', null)])
  test('ALL keeps everything', () => {
    expect(filterIdeas(ideas, 'ALL')).toHaveLength(2)
  })
  test('filters by context, including 맥락 미정', () => {
    expect(filterIdeas(ideas, '전시').map((i) => i.id)).toEqual(['BT-A-902'])
    expect(filterIdeas(ideas, '맥락 미정').map((i) => i.id)).toEqual(['BT-A-903'])
  })
})
