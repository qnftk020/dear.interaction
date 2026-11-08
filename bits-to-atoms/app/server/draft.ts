/**
 * 원고 자동 생성 (지침 5-1: 조사는 Claude, 글은 Codex).
 * 여기는 순수 로직만 둔다 — 프롬프트 만들기, Codex 응답 검증, 빈 칸만 채우기.
 * Codex 실행은 codex.ts.
 */
import { stringify } from 'yaml'
import { z } from 'zod'
import { isCarouselEmpty } from '../src/lib/carousel.ts'
import type { Case } from '../src/lib/schema.ts'

const CAROUSEL_KEYS = ['cover', 'work', 'why', 'what_if', 'ps'] as const

/** Codex가 돌려줘야 하는 모양. codex --output-schema에도 같은 내용을 넘긴다. */
export const draftSchema = z.object({
  cover: z.string().trim().min(1),
  work: z.string().trim().min(1),
  why: z.string().trim().min(1),
  what_if: z.string().trim().min(1),
  ps: z.string().trim().min(1),
  caption: z.string().trim().min(1),
  hashtags: z.array(z.string()).min(3).max(5),
})
export type Draft = z.infer<typeof draftSchema>

export const DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...CAROUSEL_KEYS, 'caption', 'hashtags'],
  properties: {
    ...Object.fromEntries(CAROUSEL_KEYS.map((k) => [k, { type: 'string' }])),
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5 },
  },
} as const

/** 원고 칸이 하나도 안 채워졌을 때만 자동 생성한다 (사람이 쓴 원고 보호). */
export const needsDraft = (c: Case): boolean => isCarouselEmpty(c)

/** 지침 문서에서 '## 5.'(글쓰기 톤)부터 '## 7.' 직전(6장 구조)까지 잘라낸다. */
export function extractGuide(doc: string): string {
  const start = doc.search(/^## 5\./m)
  const end = doc.search(/^## 7\./m)
  if (start < 0 || end < 0 || end <= start) throw new Error('지침 문서에서 5~6절(글쓰기 톤·캐러셀 구조)을 찾지 못했습니다.')
  return doc.slice(start, end).trim()
}

/** 원고 칸·점수·체크리스트는 빼고, Codex가 근거로 삼을 사실·해석 칸만 넘긴다. */
function factsOf(c: Case) {
  return {
    id: c.id, title: c.title, creator: c.creator, year: c.year, location: c.location, context: c.context,
    status: c.status, summary_ko: c.summary_ko, physical_object: c.physical_object,
    input: c.input, output: c.output, mechanism: c.mechanism, scope: c.scope,
    evidence: c.evidence, ad_insight: c.ad_insight, what_if: c.what_if, notes: c.notes, keywords: c.keywords,
  }
}

export function buildDraftPrompt(c: Case, guide: string): string {
  return [
    '너는 인스타그램 계정 dear.interaction의 카피라이터다. 아래 [가이드]를 지켜 사례 하나의 6장 캐러셀 원고와 캡션을 쓴다.',
    '',
    '규칙:',
    '- 아래 [사례 YAML]만 근거로 쓴다. 조사 자료에 없는 사실·수치·효과·인용은 절대 만들지 않는다.',
    "- '미확인'인 내용은 단정하지 않는다. 03 HOW IT WORKS는 자동 생성되므로 쓰지 않는다.",
    '- 슬라이드 본문은 장당 최대 2줄, 한 줄 16자 안팎. 표지(cover)는 한 줄 10자 안팎, 전체 10~20자. 줄바꿈(\\n)으로 나눈다.',
    "- why(04): 1줄 '막히던 지점 대신 작품이 바꾼 한 가지' + 1줄 '달라지는 경험(가설)'.",
    '- what_if(05): 실제 프로젝트가 아닌 가설임이 드러나게 쓴다. what_if 칸이 있으면 그것을 따른다.',
    '- hashtags는 3~5개, # 포함.',
    '- 파일을 만들거나 명령을 실행하지 말고, 지정된 JSON 하나만 최종 답으로 낸다.',
    '',
    '[가이드]',
    guide,
    '',
    '[사례 YAML]',
    stringify(factsOf(c), { lineWidth: 0 }),
  ].join('\n')
}

/** Codex 최종 메시지를 검증한다. ```json 코드 블록으로 감싸 와도 받아들인다. */
export function parseDraft(raw: string): Draft {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Codex 응답이 JSON이 아닙니다: ${text.slice(0, 120)}`)
  }
  const result = draftSchema.safeParse(data)
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.') || '(root)').join(', ')
    throw new Error(`Codex 원고에 빠지거나 잘못된 칸이 있습니다: ${fields}`)
  }
  return result.data
}

const fill = (current: string, next: string) => (current.trim() === '' ? next : current)

/** 비어 있는 칸만 채운 새 사례를 돌려준다. 원본은 바꾸지 않는다. */
export function mergeDraft(c: Case, d: Draft): Case {
  return {
    ...c,
    carousel: Object.fromEntries(CAROUSEL_KEYS.map((k) => [k, fill(c.carousel[k], d[k])])) as Case['carousel'],
    caption: {
      text: fill(c.caption.text, d.caption),
      hashtags: c.caption.hashtags.length > 0 ? c.caption.hashtags : d.hashtags,
    },
  }
}
