import { WHAT_IF_CONTEXTS, type Case } from './schema.ts'

/** 05 WHAT IF만 모아 보는 아이디어 탭용 */
export const NO_CONTEXT = '맥락 미정'
export type IdeaContext = (typeof WHAT_IF_CONTEXTS)[number] | typeof NO_CONTEXT
export const IDEA_CONTEXTS: readonly IdeaContext[] = [...WHAT_IF_CONTEXTS, NO_CONTEXT]
export type IdeaFilter = IdeaContext | 'ALL'

export interface IdeaCollection {
  /** 05 원고나 맥락이 하나라도 있는 사례, ID 순 */
  ideas: Case[]
  /** 05가 아직 비어 있는 사례 */
  missing: Case[]
  counts: Record<IdeaContext, number>
}

export const contextOf = (c: Case): IdeaContext => c.what_if.context ?? NO_CONTEXT

const hasIdea = (c: Case): boolean => c.carousel.what_if.trim() !== '' || c.what_if.context !== null

export function collectIdeas(cases: readonly Case[]): IdeaCollection {
  const pool = cases.filter((c) => c.scope !== 'EXCLUDED').sort((a, b) => a.id.localeCompare(b.id))
  const ideas = pool.filter(hasIdea)
  const counts = Object.fromEntries(IDEA_CONTEXTS.map((k) => [k, ideas.filter((c) => contextOf(c) === k).length])) as Record<IdeaContext, number>
  return { ideas, missing: pool.filter((c) => !hasIdea(c)), counts }
}

export function filterIdeas(ideas: readonly Case[], filter: IdeaFilter): Case[] {
  return filter === 'ALL' ? [...ideas] : ideas.filter((c) => contextOf(c) === filter)
}
