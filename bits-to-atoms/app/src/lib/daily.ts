import { z } from 'zod'

/**
 * 데일리 기록: 전날 나온 엔터테크·이머시브·인터랙션·로봇·버추얼 소식 3건을
 * 인사이트 → 아이디어 → 엑스큐션 → 기술 순으로 정리해 다음 날 아침에 올린다.
 * 아이디어는 에디터의 제안이 아니라 그 콘텐츠 자체의 아이디어다. (작성 규칙: ../../DAILY.md)
 */
export const DAILY_ITEMS_PER_DAY = 3
export const DAILY_CATEGORIES = ['엔터테크', '이머시브', '인터랙션', '로봇', '버추얼'] as const
/** 인사이트가 기사에 적혀 있었는지, 에디터가 콘텐츠에서 읽어낸 것인지 구분한다. */
export const INSIGHT_BASES = ['기사에 명시', '에디터가 읽어냄'] as const
export const UNKNOWN_DATE = '미확인'

const DAY_MS = 86_400_000
const text = z.string().trim().min(1, '빈 칸입니다')
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD')
const dayOrUnknown = z.union([day, z.literal(UNKNOWN_DATE)])

export const dailyItemSchema = z.object({
  title: text,
  category: z.enum(DAILY_CATEGORIES),
  source: z.object({ name: text, url: z.string().url('출처 URL이 올바르지 않습니다'), published: dayOrUnknown }),
  /** 공개·개막 등 실제로 일어난 날 */
  happened: dayOrUnknown,
  /** 무엇인지 한 줄 */
  what: text,
  /** 이 콘텐츠가 딛고 선 관객·시장에 대한 통찰 */
  insight: text,
  insight_basis: z.enum(INSIGHT_BASES),
  /** 그 인사이트에서 나온, 콘텐츠 자체의 아이디어 */
  idea: text,
  /** 그 아이디어를 실제로 어떻게 구현했는지 (관객이 겪는 순서대로) */
  execution: z.array(text).min(1, '엑스큐션을 한 줄 이상 적어주세요'),
  /** 기사에 이름이 나온 기술만 */
  tech: z.array(text).default([]),
  /** 기사에 없어 확인하지 못한 것 */
  unknown: z.array(text).default([]),
})

export const dailySchema = z.object({
  /** 올리는 날 (파일명과 같다) */
  date: day,
  /** 다루는 날 = 올리는 날의 전날 */
  covers: day,
  items: z.array(dailyItemSchema).length(DAILY_ITEMS_PER_DAY, `하루 ${DAILY_ITEMS_PER_DAY}건입니다`),
})

export type Daily = z.output<typeof dailySchema>
export type DailyItem = Daily['items'][number]

const previousDay = (iso: string): string => new Date(Date.parse(`${iso}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)

/** 스키마 밖의 규칙: 파일명, 다루는 날, 출처 중복. 문제를 문장으로 돌려준다. */
export function checkDaily(d: Daily, fileName: string): string[] {
  const problems: string[] = []
  if (fileName !== `${d.date}.yaml`) problems.push(`파일명은 날짜와 같아야 합니다: ${d.date}.yaml`)
  if (d.covers !== previousDay(d.date)) problems.push(`covers는 올리는 날의 전날(${previousDay(d.date)})이어야 합니다`)
  const titles = d.items.map((i) => i.title)
  if (new Set(titles).size !== titles.length) problems.push('같은 소식이 두 번 들어 있습니다')
  d.items.forEach((item, n) => {
    if (item.insight_basis === '기사에 명시' && item.source.published === UNKNOWN_DATE && item.happened === UNKNOWN_DATE) {
      problems.push(`${n + 1}번: 게재일과 일어난 날이 모두 미확인입니다 — 전날 소식인지 확인할 수 없습니다`)
    }
  })
  return problems
}
