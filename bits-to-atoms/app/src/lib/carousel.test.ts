import { describe, expect, test } from 'vitest'
import { buildSlides, candidateTable, dbRow, DB_COLUMNS, toMarkdown, WHAT_IF_DISCLAIMER } from './carousel.ts'
import { makeCase, makeReadyCase } from './fixtures.ts'
import { lineCount, parseList, repostStatusOf, sentenceCount, verificationOf } from './derive.ts'
import { selfCheck } from './selfcheck.ts'

describe('buildSlides', () => {
  test('always six slides in the fixed order', () => {
    expect(buildSlides(makeCase()).map((s) => `${s.no} ${s.name}`)).toEqual([
      '01 LOVE LETTER', '02 THE WORK', '03 HOW IT WORKS', '04 WHY IT WORKS', '05 WHAT IF?', '06 P.S. I STILL LOVE YOU',
    ])
  })
  test('cover kicker and sign-off carry the letter number', () => {
    const [cover, , , , , ps] = buildSlides(makeReadyCase({ letter_no: 7 }))
    expect(cover.kicker).toBe('LOVE LETTER 007 / 1000')
    expect(ps.footer).toBe('Love Letter 007 / 1000 · Dear, Interaction.')
  })
  test('unassigned number reads 번호 미배정', () => {
    expect(buildSlides(makeCase())[0].kicker).toBe('LOVE LETTER 번호 미배정')
  })
  test('MECHANISM only appears when confirmed', () => {
    expect(buildSlides(makeCase())[2].rows.map(([k]) => k)).toEqual(['INPUT', 'OUTPUT'])
    expect(buildSlides(makeCase({ mechanism: 'RFID' }))[2].rows.map(([k]) => k)).toContain('MECHANISM')
  })
  test('THE WORK is addressed to the work title only', () => {
    expect(buildSlides(makeCase())[1].kicker).toBe('To. Test Piece')
  })
  test('WHAT IF is labelled as fiction and extended cases are labelled', () => {
    expect(buildSlides(makeCase())[4].note).toBe(WHAT_IF_DISCLAIMER)
    expect(buildSlides(makeCase({ scope: 'EXTENDED' }))[1].note).toContain('non-tangible')
  })
})

describe('toMarkdown', () => {
  test('follows the section order of the guideline, carousel first', () => {
    const md = toMarkdown(makeReadyCase(), [])
    const order = ['# LOVE LETTER 001 — Test Piece', '## 인스타 캐러셀 (6장)', '## 인스타 캡션', '## 리서치 근거', '## 이미지/영상 소스 및 재게시 권리', '## 아카이브 DB', '## 게시 전 확인할 항목']
    const positions = order.map((h) => md.indexOf(h))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(md).toContain('#TangibleInterface')
    expect(md).toContain('- 없음')
  })
  test('marks unopened links, missing media and pending items', () => {
    const md = toMarkdown(makeCase({ evidence: { identity: { url: 'https://a.org' } } }), [])
    expect(md).toContain('(접근 확인 못 함)')
    expect(md).toContain('후보 없음')
    expect(md).toContain('[점검]')
  })
  test('escapes pipes in table cells', () => {
    expect(toMarkdown(makeCase({ title: 'A|B' }), [])).toContain('A\\|B')
  })
})

describe('db row and candidate table', () => {
  test('db row matches the 14 guideline columns', () => {
    const r = dbRow(makeReadyCase())
    expect(r).toHaveLength(DB_COLUMNS.length)
    expect(r[0]).toBe('001')
    expect(r[10]).toContain('[박물관 아카이브]')
    expect(r[12]).toBe('허용 확인됨')
  })
  test('candidate table has one line per case', () => {
    const t = candidateTable([makeCase(), makeCase({ id: 'BT-A-902', scope: 'EXTENDED' })]).split('\n')
    expect(t).toHaveLength(4)
    expect(t[3]).toContain('확장 사례')
  })
})

describe('derive helpers', () => {
  test('verification needs both identity and interaction', () => {
    expect(verificationOf(makeReadyCase())).toBe('확인')
    expect(verificationOf(makeCase({ evidence: { identity: { status: '부분 확인' }, interaction: { status: '확인' } } }))).toBe('부분 확인')
    expect(verificationOf(makeCase())).toBe('검증 부족')
  })
  test('repost status', () => {
    expect(repostStatusOf(makeReadyCase())).toBe('허용 확인됨')
    expect(repostStatusOf(makeCase())).toBe('권한 확인 필요')
    expect(repostStatusOf(makeCase({ media: [{ url: 'https://a.org', permission: '재게시 불가' }] }))).toBe('재게시 불가')
  })
  test('parseList and sentenceCount', () => {
    expect(parseList('#a, b  c')).toEqual(['#a', 'b', 'c'])
    expect(sentenceCount('하나. 둘? 셋!')).toBe(3)
  })
  test('lineCount counts explicit breaks and wraps long lines', () => {
    expect(lineCount('')).toBe(0)
    expect(lineCount('짧은 한 줄')).toBe(1)
    expect(lineCount('첫 줄\n둘째 줄\n\n셋째 줄')).toBe(3)
    expect(lineCount('가'.repeat(16))).toBe(1)
    expect(lineCount('가'.repeat(17))).toBe(2)
    expect(lineCount('가'.repeat(25), 10)).toBe(3)
  })
})

describe('selfCheck', () => {
  test('ready case passes all eight checks', () => {
    const c = makeReadyCase()
    const items = selfCheck(c, [c])
    expect(items).toHaveLength(8)
    expect(items.every((i) => i.ok)).toBe(true)
  })
  test('fresh candidate fails verification and manual checks', () => {
    const items = selfCheck(makeCase(), [])
    expect(items.filter((i) => !i.ok).length).toBeGreaterThan(3)
    expect(items.filter((i) => !i.auto)).toHaveLength(2)
  })
})
