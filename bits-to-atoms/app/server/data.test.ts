import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { COLLECTIONS, COLLECTION_KEYS, collectionOf } from '../src/lib/collections.ts'
import { loadCases } from './store.ts'

const DATA_ROOT = path.resolve(import.meta.dirname, '../../data')

describe.each(COLLECTION_KEYS)('real archive data — %s', (key) => {
  const dir = path.join(DATA_ROOT, COLLECTIONS[key].dir)

  test.skipIf(!existsSync(dir))('every case file passes the schema and matches its filename', async () => {
    const broken = (await loadCases(dir)).filter((e) => e.error)
    expect(broken).toEqual([])
  })

  test.skipIf(!existsSync(dir))('every case id belongs to this collection folder', async () => {
    const ids = (await loadCases(dir)).flatMap((e) => (e.case ? [e.case.id] : []))
    expect(ids.filter((id) => collectionOf(id) !== key)).toEqual([])
  })
})
