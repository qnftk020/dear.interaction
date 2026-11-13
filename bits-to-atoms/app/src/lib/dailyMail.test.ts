import { describe, expect, test } from 'vitest'
import { dailySchema } from './daily.ts'
import { dayLabel, renderDailyMail } from './dailyMail.ts'

const item = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  category: '로봇',
  source: { name: '출처 매체', url: 'https://example.com/a?x=1&y=2', published: '2026-11-12' },
  happened: '2026-11-12',
  what: '무엇인지 한 줄',
  insight: '인사이트 문장',
  insight_basis: '기사에 명시',
  idea: '아이디어 문장',
  execution: ['첫 단계', '둘째 단계'],
  tech: ['강화학습', 'LED'],
  ...over,
})
const daily = (items = [item('첫 소식'), item('둘째 소식'), item('셋째 소식')]) =>
  dailySchema.parse({ date: '2026-11-13', covers: '2026-11-12', items })
const URL = 'https://example.com/dash'

describe('dayLabel', () => {
  test('formats a date with its Korean weekday', () => {
    expect(dayLabel('2026-11-13')).toBe('11월 13일 (금)')
  })
})

describe('renderDailyMail', () => {
  test('puts the upload date, first title and remaining count in the subject', () => {
    const mail = renderDailyMail(daily(), URL)

    expect(mail.subject).toBe('[dear.interaction] 11월 13일 (금) 데일리 — 첫 소식 외 2건')
  })

  test('lists every item with insight, idea, execution and technology in the text body', () => {
    const mail = renderDailyMail(daily(), URL)

    expect(mail.text).toContain('3. [로봇] 셋째 소식')
    expect(mail.text).toContain('- 인사이트 (기사에 명시): 인사이트 문장')
    expect(mail.text).toContain('- 아이디어: 아이디어 문장')
    expect(mail.text).toContain('  2) 둘째 단계')
    expect(mail.text).toContain('- 기술: 강화학습, LED')
    expect(mail.text).toContain(URL)
  })

  test('escapes HTML in titles and ampersands in links', () => {
    const mail = renderDailyMail(daily([item('<b>굵게</b> & 소식'), item('나'), item('다')]), URL)

    expect(mail.html).toContain('&lt;b&gt;굵게&lt;/b&gt; &amp; 소식')
    expect(mail.html).not.toContain('<b>굵게</b>')
    expect(mail.html).toContain('href="https://example.com/a?x=1&amp;y=2"')
  })

  test('says the article named no technology when the list is empty', () => {
    const mail = renderDailyMail(daily([item('가', { tech: [] }), item('나'), item('다')]), URL)

    expect(mail.text).toContain('- 기술: 기사에 없음')
  })

  test('omits the published date when it is unknown', () => {
    const unknown = { name: '출처 매체', url: 'https://example.com/b', published: '미확인' }
    const mail = renderDailyMail(daily([item('가', { source: unknown }), item('나'), item('다')]), URL)

    expect(mail.html.split('게재').length - 1).toBe(2)
  })
})
