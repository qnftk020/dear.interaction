import { describe, expect, test } from 'vitest'
import { makeCase } from '../src/lib/fixtures.ts'
import { buildDraftPrompt, extractGuide, mergeDraft, needsDraft, parseDraft } from './draft.ts'

const DRAFT = {
  cover: '돌리면\n노래가 바뀝니다',
  work: '다이얼을 돌리면\n소리가 바뀌는 작품입니다.',
  why: '버튼 대신 손목을 씁니다.\n소리를 몸으로 고르게 됩니다.',
  what_if: '박물관 입구 다이얼을 돌리면\n그 시대 음악이 흐른다면?',
  ps: '오늘도 너에게\n한 바퀴 돌았어',
  caption: '다이얼 하나로 소리를 고르는 작품.',
  hashtags: ['#tangible', '#interaction', '#dearinteraction'],
}

describe('needsDraft', () => {
  test('원고 6칸이 모두 비어 있으면 생성이 필요하다', () => {
    expect(needsDraft(makeCase())).toBe(true)
  })
  test('한 칸이라도 써 둔 원고가 있으면 자동 생성하지 않는다', () => {
    expect(needsDraft(makeCase({ carousel: { cover: '이미 쓴 표지' } }))).toBe(false)
  })
})

describe('extractGuide', () => {
  test('지침에서 5절(글쓰기 톤)부터 6절(캐러셀 구조)까지만 잘라낸다', () => {
    const doc = '# 지침\n## 4. 검증\n검증 내용\n## 5. 글쓰기 톤\n톤 내용\n## 6. 캐러셀 고정 구조\n구조 내용\n## 7. 부록\n부록 내용'
    const guide = extractGuide(doc)
    expect(guide).toContain('톤 내용')
    expect(guide).toContain('구조 내용')
    expect(guide).not.toContain('검증 내용')
    expect(guide).not.toContain('부록 내용')
  })
  test('절 제목을 못 찾으면 오류를 던진다', () => {
    expect(() => extractGuide('아무 내용')).toThrow('지침')
  })
})

describe('buildDraftPrompt', () => {
  test('사실 칸과 가이드를 넣고, 기존 원고 칸은 넣지 않는다', () => {
    const prompt = buildDraftPrompt(makeCase({ ad_insight: '손목으로 고르는 소리' }), '가이드 본문')
    expect(prompt).toContain('가이드 본문')
    expect(prompt).toContain('다이얼을 돌린다')
    expect(prompt).toContain('손목으로 고르는 소리')
    expect(prompt).not.toContain('carousel:')
  })
  test('조사에 없는 사실을 만들지 말라는 규칙을 포함한다', () => {
    expect(buildDraftPrompt(makeCase(), 'g')).toContain('조사 자료에 없는')
  })
})

describe('parseDraft', () => {
  test('올바른 JSON을 받아들인다', () => {
    expect(parseDraft(JSON.stringify(DRAFT)).cover).toBe(DRAFT.cover)
  })
  test('코드 블록으로 감싼 JSON도 받아들인다', () => {
    expect(parseDraft('```json\n' + JSON.stringify(DRAFT) + '\n```').ps).toBe(DRAFT.ps)
  })
  test('칸이 빠지면 읽을 수 있는 오류를 던진다', () => {
    const { cover: _omit, ...rest } = DRAFT
    expect(() => parseDraft(JSON.stringify(rest))).toThrow('cover')
  })
  test('JSON이 아니면 오류를 던진다', () => {
    expect(() => parseDraft('원고를 썼습니다!')).toThrow('JSON')
  })
})

describe('mergeDraft', () => {
  test('비어 있는 칸만 채우고 원본은 바꾸지 않는다', () => {
    const original = makeCase({ carousel: { ps: '내가 쓴 P.S.' }, caption: { text: '', hashtags: [] } })
    const merged = mergeDraft(original, DRAFT)
    expect(merged.carousel.cover).toBe(DRAFT.cover)
    expect(merged.carousel.ps).toBe('내가 쓴 P.S.')
    expect(merged.caption.text).toBe(DRAFT.caption)
    expect(merged.caption.hashtags).toEqual(DRAFT.hashtags)
    expect(original.carousel.cover).toBe('')
  })
  test('이미 있는 해시태그는 덮어쓰지 않는다', () => {
    const merged = mergeDraft(makeCase({ caption: { text: '', hashtags: ['#mine'] } }), DRAFT)
    expect(merged.caption.hashtags).toEqual(['#mine'])
  })
})
