import { REPOST_STATUSES, repostStatusOf, VERIFICATIONS, verificationOf } from './derive.ts'
import { SCOPES, STAGES, TAXONOMY, WHAT_IF_CONTEXTS, type Axis, type Case } from './schema.ts'
import { countsTowardArchive } from './validate.ts'

export const MILESTONES = [30, 100, 1000] as const

export function nextMilestone(count: number): number {
  return MILESTONES.find((m) => m > count) ?? MILESTONES[MILESTONES.length - 1]
}

/** keys 순서를 유지하면서 0으로 초기화한 뒤 센다. keys에 없는 값은 무시한다. */
export function countBy(cases: readonly Case[], keys: readonly string[], pick: (c: Case) => string | null | readonly string[]): Record<string, number> {
  const initial: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]))
  return cases.reduce((acc, c) => {
    const picked = pick(c)
    const values = picked === null ? [] : ([] as string[]).concat(picked)
    const hits = values.filter((v) => v in acc)
    return hits.length === 0 ? acc : { ...acc, ...Object.fromEntries(hits.map((v) => [v, acc[v] + 1])) }
  }, initial)
}

export function summarize(cases: readonly Case[]) {
  return {
    total: cases.length,
    counted: cases.filter(countsTowardArchive).length,
    published: cases.filter((c) => c.stage === '게시됨').length,
    byStage: countBy(cases, STAGES, (c) => c.stage),
    byScope: countBy(cases, SCOPES, (c) => c.scope),
    byVerification: countBy(cases, VERIFICATIONS, verificationOf),
    byRepost: countBy(cases, REPOST_STATUSES, repostStatusOf),
    byWhatIf: countBy(cases, WHAT_IF_CONTEXTS, (c) => c.what_if.context),
    byEra: countBy(cases, TAXONOMY.era.tags, (c) => c.tags.era),
  }
}

export interface CoverageMatrix {
  rows: readonly string[]
  cols: readonly string[]
  cells: number[][]
}

/** 두 분류 축의 조합별 사례 수(탠저블·확장). 빈 칸이 다음 탐색 후보다. */
export function coverage(cases: readonly Case[], rowAxis: Axis, colAxis: Axis): CoverageMatrix {
  const known = (axis: Axis) => TAXONOMY[axis].tags.filter((t) => t !== 'UNKNOWN')
  const rows = known(rowAxis)
  const cols = known(colAxis)
  const active = cases.filter((c) => c.scope === 'TANGIBLE' || c.scope === 'EXTENDED')
  const has = (c: Case, axis: Axis, tag: string) => (c.tags[axis] as readonly string[]).includes(tag)
  const cells = rows.map((r) => cols.map((col) => active.filter((c) => has(c, rowAxis, r) && has(c, colAxis, col)).length))
  return { rows, cols, cells }
}
