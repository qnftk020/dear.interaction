import { LETTER_TOTAL, type Case } from './schema.ts'

export type Verification = '확인' | '부분 확인' | '검증 부족'
export const VERIFICATIONS: readonly Verification[] = ['확인', '부분 확인', '검증 부족']
export type RepostStatus = '허용 확인됨' | '권한 확인 필요' | '재게시 불가'
export const REPOST_STATUSES: readonly RepostStatus[] = ['허용 확인됨', '권한 확인 필요', '재게시 불가']

export const pad = (n: number, len = 3): string => String(n).padStart(len, '0')

/** 작품 정체와 입력·출력이 모두 '확인'이어야 검증된 사례다. 기술은 미확인이어도 된다(MECHANISM을 비우면 됨). */
export function verificationOf(c: Case): Verification {
  const { identity, interaction } = c.evidence
  if (identity.status === '확인' && interaction.status === '확인') return '확인'
  if (identity.status !== '미확인' && interaction.status !== '미확인') return '부분 확인'
  return '검증 부족'
}

export const isVerified = (c: Case): boolean => verificationOf(c) === '확인'

/** 하나라도 허용 확인된 자료가 있으면 이미지 게시 가능. */
export function repostStatusOf(c: Case): RepostStatus {
  if (c.media.some((m) => m.permission === '허용 확인됨')) return '허용 확인됨'
  if (c.media.length > 0 && c.media.every((m) => m.permission === '재게시 불가')) return '재게시 불가'
  return '권한 확인 필요'
}

/** LOVE LETTER 001 / 1000 */
export const letterLabel = (c: Case): string =>
  c.letter_no === null ? '번호 미배정' : `${pad(c.letter_no)} / ${LETTER_TOTAL}`

export const hasValue = (s: string): boolean => s.trim() !== '' && s.trim() !== '미확인'

/** 해시태그·키워드 입력란: 쉼표/공백으로 나눈다. */
export function parseList(input: string): string[] {
  return input
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 문장 수(대략): 마침표·물음표·느낌표·줄바꿈 기준 */
export function sentenceCount(s: string): number {
  return s.split(/[.?!。]+|\n+/).filter((p) => p.trim().length > 0).length
}

/** 슬라이드 한 장에 들어가는 줄 수 상한과, 본문 글씨 크기에서 한 줄에 들어가는 글자 수 */
export const SLIDE_MAX_LINES = 2
export const SLIDE_LINE_CHARS = 16
export const COVER_LINE_CHARS = 10

/** 슬라이드에서 차지할 줄 수: 줄바꿈으로 나눈 뒤, 한 줄 글자 수를 넘으면 접힌 만큼 더한다. */
export function lineCount(s: string, perLine = SLIDE_LINE_CHARS): number {
  return s
    .split('\n')
    .map((line) => [...line.trim()].length)
    .filter((len) => len > 0)
    .reduce((sum, len) => sum + Math.ceil(len / perLine), 0)
}