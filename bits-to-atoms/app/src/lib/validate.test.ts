import { describe, expect, test } from 'vitest'
import { makeCase, makeReadyCase } from './fixtures.ts'
import type { Case } from './schema.ts'
import { canEnterStage, checkCase, countsTowardArchive, isDiscoveryUrl, isPublishable, parseUrl } from './validate.ts'

const fieldsAt = (level: string, c: Case = makeCase(), all: Case[] = [c]) =>
  checkCase(c, all).filter((i) => i.level === level).map((i) => i.field)

describe('parseUrl / isDiscoveryUrl', () => {
  test('accepts only http(s) URLs', () => {
    expect(parseUrl('https://a.org')).not.toBeNull()
    expect(parseUrl('ftp://a.org')).toBeNull()
    expect(parseUrl('미확인')).toBeNull()
  })
  test('flags SNS and Pinterest hosts including subdomains', () => {
    expect(isDiscoveryUrl('https://www.instagram.com/p/x')).toBe(true)
    expect(isDiscoveryUrl('https://kr.pinterest.com/pin/1')).toBe(true)
    expect(isDiscoveryUrl('https://tangible.media.mit.edu/')).toBe(false)
  })
})

describe('fixtures', () => {
  test('a fresh candidate has no errors', () => {
    expect(fieldsAt('error')).toEqual([])
  })
  test('a ready case passes every error and warning rule', () => {
    const c = makeReadyCase()
    expect(checkCase(c, [c]).filter((i) => i.level !== 'info')).toEqual([])
  })
})

describe('sources and evidence', () => {
  test('missing or SNS primary source is an error', () => {
    expect(fieldsAt('error', makeCase({ source_primary: '미확인' }))).toContain('source_primary')
    expect(fieldsAt('error', makeCase({ source_primary: 'https://pinterest.com/pin/1' }))).toContain('source_primary')
  })
  test('marking a row 확인 without a link is an error', () => {
    const c = makeCase({ evidence: { identity: { status: '확인' } } })
    expect(fieldsAt('error', c)).toContain('evidence.identity')
  })
  test('확인 with a link that was not opened is a warning', () => {
    const c = makeCase({ evidence: { identity: { status: '확인', url: 'https://a.org' } } })
    expect(fieldsAt('warn', c)).toContain('evidence.identity')
  })
  test('invalid or SNS evidence links are warned', () => {
    expect(fieldsAt('warn', makeCase({ evidence: { context: { url: 'nope' } } }))).toContain('evidence.context')
    expect(fieldsAt('warn', makeCase({ evidence: { context: { url: 'https://x.com/a' } } }))).toContain('evidence.context')
  })
})

describe('verification gates', () => {
  test('검증 완료 without verified identity+interaction is "검증 부족 — 게시 보류"', () => {
    const issues = checkCase(makeCase({ stage: '검증 완료' }))
    expect(issues.some((i) => i.level === 'error' && i.message.startsWith('검증 부족'))).toBe(true)
  })
  test('writing a MECHANISM while technology is unverified is an error', () => {
    expect(fieldsAt('error', makeCase({ mechanism: '적외선 카메라' }))).toContain('mechanism')
  })
  test('verified technology allows a MECHANISM', () => {
    const c = makeReadyCase({ mechanism: '적외선 카메라', evidence: { ...makeReadyCase().evidence, technology: { url: 'https://a.org', status: '확인', link_opened: true } } })
    expect(fieldsAt('error', c)).not.toContain('mechanism')
  })
  test('AI tag without evidence is warned', () => {
    expect(fieldsAt('warn', makeCase({ tags: { input: ['ROTATE'], output: ['SOUND'], ai: ['AI-GENERATIVE'] } }))).toContain('ai_evidence')
  })
  test('hold/excluded cases cannot pass 검증 완료', () => {
    expect(fieldsAt('error', makeReadyCase({ scope: 'HOLD' }))).toContain('scope')
  })
})

describe('copy rules (원고 작성 이후)', () => {
  const drafting = (carousel: Record<string, string>, extra: Record<string, unknown> = {}) =>
    makeReadyCase({ stage: '원고 작성', carousel: { ...makeReadyCase().carousel, ...carousel }, ...extra })

  test('empty slides are warnings while drafting and errors when post-ready', () => {
    expect(fieldsAt('warn', drafting({ ps: '' }))).toContain('carousel.ps')
    expect(fieldsAt('error', makeReadyCase({ carousel: { ...makeReadyCase().carousel, ps: '' } }))).toContain('carousel.ps')
  })
  test('cover outside 10~20 chars is warned', () => {
    expect(fieldsAt('warn', drafting({ cover: '짧음' }))).toContain('carousel.cover')
    expect(fieldsAt('warn', drafting({ cover: '가'.repeat(30) }))).toContain('carousel.cover')
  })
  test('slides over two lines are warned', () => {
    expect(fieldsAt('warn', drafting({ work: '하나\n둘' }))).not.toContain('carousel.work')
    expect(fieldsAt('warn', drafting({ work: '하나\n둘\n셋' }))).toContain('carousel.work')
    expect(fieldsAt('warn', drafting({ why: '가'.repeat(33) }))).toContain('carousel.why')
  })
  test('cover over two big lines or 20 chars is warned', () => {
    expect(fieldsAt('warn', drafting({ cover: '표지 한 줄\n표지 둘\n셋' }))).toContain('carousel.cover')
    expect(fieldsAt('warn', drafting({ cover: '가'.repeat(21) }))).toContain('carousel.cover')
  })
  test('HOW IT WORKS rows longer than one slide line are warned', () => {
    expect(fieldsAt('warn', drafting({}, { input: '가'.repeat(17) }))).toContain('input')
    expect(fieldsAt('warn', drafting({}, { output: '가'.repeat(17) }))).toContain('output')
  })
  test('empty praise is warned', () => {
    expect(fieldsAt('warn', drafting({ why: '혁신적인 경험입니다.' }))).toContain('carousel.why')
  })
  test('unverified figures in WHY are warned', () => {
    expect(fieldsAt('warn', drafting({ why: '참여율이 30% 올랐습니다.' }))).toContain('carousel.why')
    expect(fieldsAt('warn', drafting({ why: '조회수가 많았다.' }))).toContain('carousel.why')
  })
  test('incomplete WHAT IF is flagged', () => {
    expect(fieldsAt('warn', drafting({}, { what_if: { context: '전시' } }))).toContain('what_if')
  })
})

describe('publish rules (게시 준비 이후)', () => {
  test('requires letter number, caption and manual checklist', () => {
    const c = makeReadyCase({ letter_no: null, caption: { text: '' }, checklist: {} })
    expect(fieldsAt('error', c)).toEqual(expect.arrayContaining(['letter_no', 'caption', 'checklist']))
  })
  test('hashtag and keyword counts outside 3~5 are warned', () => {
    const c = makeReadyCase({ caption: { text: 'x', hashtags: ['a'] }, keywords: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(fieldsAt('warn', c)).toEqual(expect.arrayContaining(['caption.hashtags', 'keywords']))
  })
  test('no media or no permitted media is warned as text-only', () => {
    expect(fieldsAt('warn', makeReadyCase({ media: [] }))).toContain('media')
    expect(fieldsAt('warn', makeReadyCase({ media: [{ url: 'https://a.org' }] }))).toContain('media')
  })
  test('허용 확인됨 without basis is an error; bad media URL is a warning', () => {
    expect(fieldsAt('error', makeCase({ media: [{ url: 'https://a.org', permission: '허용 확인됨' }] }))).toContain('media.0')
    expect(fieldsAt('warn', makeCase({ media: [{ url: 'not-url' }] }))).toContain('media.0')
  })
})

describe('scope and duplicates', () => {
  test('extended and held cases get info notes; missing tags warned', () => {
    expect(fieldsAt('info', makeCase({ scope: 'EXTENDED' }))).toContain('scope')
    expect(fieldsAt('info', makeCase({ scope: 'HOLD' }))).toContain('scope')
    expect(fieldsAt('warn', makeCase({ tags: {} }))).toContain('tags')
  })
  test('same title is warned, same letter number is an error', () => {
    const a = makeReadyCase()
    const b = makeReadyCase({ id: 'BT-A-902', title: 'test-piece!' })
    expect(fieldsAt('warn', a, [a, b])).toContain('title')
    expect(fieldsAt('error', a, [a, b])).toContain('letter_no')
  })
  test('reusing the same joke motif across posts is warned', () => {
    const a = makeCase({ carousel: { cover: '광고는 상을 줬고' } })
    const b = makeCase({ id: 'BT-A-902', title: 'b', carousel: { ps: '광고는 상을 줬지만' } })
    expect(fieldsAt('warn', a, [a, b])).toContain('carousel.cover')
  })
})

describe('stage movement and counting', () => {
  test('blocks entering 검증 완료 when unverified, allows 출처 확인 중', () => {
    expect(canEnterStage(makeCase(), '검증 완료', [])).not.toEqual([])
    expect(canEnterStage(makeCase(), '출처 확인 중', [])).toEqual([])
  })
  test('counts verified tangible and extended, not held', () => {
    expect(countsTowardArchive(makeReadyCase())).toBe(true)
    expect(countsTowardArchive(makeReadyCase({ scope: 'EXTENDED' }))).toBe(true)
    expect(countsTowardArchive(makeReadyCase({ scope: 'HOLD' }))).toBe(false)
    expect(countsTowardArchive(makeCase())).toBe(false)
  })
  test('only posted letters without errors are publishable', () => {
    const posted = makeReadyCase({ stage: '게시됨' })
    expect(isPublishable(posted, [posted])).toBe(true)
    expect(isPublishable(makeReadyCase(), [])).toBe(false)
    const broken = makeReadyCase({ stage: '게시됨', caption: { text: '' } })
    expect(isPublishable(broken, [broken])).toBe(false)
  })
})
