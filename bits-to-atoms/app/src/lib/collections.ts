/**
 * 컬렉션: 같은 스키마·검증·캐러셀을 쓰지만 데이터 폴더와 화면을 나눈 리서치 묶음.
 * - interaction: 기존 탠저블 인터랙션 아카이브 (data/cases, BT-A-…)
 * - entertech:   엔터테크 리서치 (data/entertech, BT-E-…)
 */
export const COLLECTIONS = {
  interaction: { label: '인터랙션', base: '', api: '/api/cases', dir: 'cases', idPrefix: 'BT-A-' },
  entertech: { label: '엔터테크', base: '/entertech', api: '/api/entertech', dir: 'entertech', idPrefix: 'BT-E-' },
} as const

export type CollectionKey = keyof typeof COLLECTIONS
export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[]

export function collectionOf(id: string): CollectionKey {
  return id.startsWith(COLLECTIONS.entertech.idPrefix) ? 'entertech' : 'interaction'
}

export function inCollection<T extends { id: string }>(cases: readonly T[], key: CollectionKey): T[] {
  return cases.filter((c) => collectionOf(c.id) === key)
}

export interface CollectionRoute {
  collection: CollectionKey
  /** 컬렉션 접두어를 뗀 나머지 경로 ('/', '/pipeline', '/case/…') */
  sub: string
}

const ENTERTECH_PREFIX = /^\/entertech(?=\/|$)/
const CASE_ROUTE = /^\/case\/([^/]+)/

export function collectionRoute(route: string): CollectionRoute {
  if (ENTERTECH_PREFIX.test(route)) {
    return { collection: 'entertech', sub: route.replace(ENTERTECH_PREFIX, '') || '/' }
  }
  const caseId = CASE_ROUTE.exec(route)?.[1]
  return { collection: caseId ? collectionOf(caseId) : 'interaction', sub: route }
}
