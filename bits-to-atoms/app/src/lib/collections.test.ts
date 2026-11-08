import { describe, expect, test } from 'vitest'
import { collectionOf, collectionRoute, inCollection } from './collections.ts'

describe('collectionOf', () => {
  test('BT-E- id는 엔터테크 컬렉션', () => {
    expect(collectionOf('BT-E-001')).toBe('entertech')
  })
  test('그 밖의 id는 기존 인터랙션 컬렉션', () => {
    expect(collectionOf('BT-A-001')).toBe('interaction')
    expect(collectionOf('BT-B-0001')).toBe('interaction')
  })
})

describe('inCollection', () => {
  test('컬렉션에 속한 사례만 남긴다', () => {
    const cases = [{ id: 'BT-A-001' }, { id: 'BT-E-001' }, { id: 'BT-E-002' }]
    expect(inCollection(cases, 'entertech').map((c) => c.id)).toEqual(['BT-E-001', 'BT-E-002'])
    expect(inCollection(cases, 'interaction').map((c) => c.id)).toEqual(['BT-A-001'])
  })
})

describe('collectionRoute', () => {
  test('/entertech 로 시작하면 엔터테크와 나머지 경로로 나눈다', () => {
    expect(collectionRoute('/entertech')).toEqual({ collection: 'entertech', sub: '/' })
    expect(collectionRoute('/entertech/pipeline')).toEqual({ collection: 'entertech', sub: '/pipeline' })
  })
  test('엔터테크 사례 상세는 엔터테크 컬렉션으로 본다', () => {
    expect(collectionRoute('/case/BT-E-003/carousel')).toEqual({ collection: 'entertech', sub: '/case/BT-E-003/carousel' })
  })
  test('그 밖의 경로는 기존 컬렉션 그대로', () => {
    expect(collectionRoute('/')).toEqual({ collection: 'interaction', sub: '/' })
    expect(collectionRoute('/archive')).toEqual({ collection: 'interaction', sub: '/archive' })
    expect(collectionRoute('/case/BT-A-001')).toEqual({ collection: 'interaction', sub: '/case/BT-A-001' })
  })
  test('/entertechx 같은 비슷한 경로는 엔터테크가 아니다', () => {
    expect(collectionRoute('/entertechx')).toEqual({ collection: 'interaction', sub: '/entertechx' })
  })
})
