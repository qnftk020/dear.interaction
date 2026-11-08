import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { makeCase } from '../src/lib/fixtures.ts'
import { handleCasesRequest } from './api.ts'
import { caseFilePath, loadCases, saveCase } from './store.ts'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'bta-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('store', () => {
  test('save then load round-trips a case and leaves no temp file', async () => {
    const c = makeCase()
    await saveCase(dir, c)
    expect(await readdir(dir)).toEqual(['BT-A-901.yaml'])
    const [entry] = await loadCases(dir)
    expect(entry.case).toEqual(c)
  })
  test('rejects ids that could escape the data folder', () => {
    expect(() => caseFilePath(dir, '../evil')).toThrow()
    expect(() => caseFilePath(dir, 'BT-A-001/../../x')).toThrow()
  })
  test('reports schema errors, bad YAML and filename mismatch per file', async () => {
    await writeFile(path.join(dir, 'BT-A-001.yaml'), 'id: BT-A-001\ntitle: ""\n')
    await writeFile(path.join(dir, 'BT-A-002.yaml'), 'id: [unclosed\n')
    await saveCase(dir, makeCase({ id: 'BT-A-003' }))
    await writeFile(path.join(dir, 'BT-A-004.yaml'), await readFile(path.join(dir, 'BT-A-003.yaml'), 'utf8'))
    await writeFile(path.join(dir, '_template.yaml'), 'ignored: true\n')
    const entries = await loadCases(dir)
    expect(entries.map((e) => e.file)).toEqual(['BT-A-001.yaml', 'BT-A-002.yaml', 'BT-A-003.yaml', 'BT-A-004.yaml'])
    expect(entries[0].error).toContain('title')
    expect(entries[1].error).toContain('YAML')
    expect(entries[2].case?.id).toBe('BT-A-003')
    expect(entries[3].error).toContain('파일명')
  })
})

describe('handleCasesRequest', () => {
  test('GET / lists entries', async () => {
    await saveCase(dir, makeCase())
    const res = await handleCasesRequest(dir, 'GET', '/', undefined)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
  test('PUT saves a valid case', async () => {
    const res = await handleCasesRequest(dir, 'PUT', '/BT-A-901', makeCase({ ad_insight: '메모' }))
    expect(res.status).toBe(200)
    expect((await loadCases(dir))[0].case?.ad_insight).toBe('메모')
  })
  test('PUT with mismatched id is rejected', async () => {
    const res = await handleCasesRequest(dir, 'PUT', '/BT-A-999', makeCase())
    expect(res.status).toBe(400)
  })
  test('PUT with invalid body returns readable schema error', async () => {
    const res = await handleCasesRequest(dir, 'PUT', '/BT-A-901', { ...makeCase(), scope: '아마도' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('scope')
  })
  test('PUT with an id outside the collection prefix is rejected', async () => {
    const res = await handleCasesRequest(dir, 'PUT', '/BT-A-901', makeCase(), { idPrefix: 'BT-E-' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('BT-E-')
    expect(await loadCases(dir)).toHaveLength(0)
  })
  test('PUT inside the collection prefix is saved', async () => {
    const res = await handleCasesRequest(dir, 'PUT', '/BT-E-901', makeCase({ id: 'BT-E-901' }), { idPrefix: 'BT-E-' })
    expect(res.status).toBe(200)
    expect((await loadCases(dir))[0].case?.id).toBe('BT-E-901')
  })
  test('POST /:id/draft fills an empty carousel with the drafter result and saves it', async () => {
    await saveCase(dir, makeCase())
    const drafter = async () => ({
      cover: '표지', work: '작품', why: '이유', what_if: '만약', ps: '추신', caption: '캡션', hashtags: ['#a', '#b', '#c'],
    })
    const res = await handleCasesRequest(dir, 'POST', '/BT-A-901/draft', undefined, { drafter })
    expect(res.status).toBe(200)
    expect((await loadCases(dir))[0].case?.carousel.cover).toBe('표지')
  })
  test('POST /:id/draft refuses when a draft already exists', async () => {
    await saveCase(dir, makeCase({ carousel: { cover: '내 표지' } }))
    const res = await handleCasesRequest(dir, 'POST', '/BT-A-901/draft', undefined, { drafter: async () => { throw new Error('호출되면 안 됨') } })
    expect(res.status).toBe(409)
  })
  test('POST /:id/draft for a missing case is 404', async () => {
    const res = await handleCasesRequest(dir, 'POST', '/BT-A-999/draft', undefined, { drafter: async () => { throw new Error('x') } })
    expect(res.status).toBe(404)
  })
  test('POST /:id/draft reports drafter failure as 502 without touching the file', async () => {
    await saveCase(dir, makeCase())
    const res = await handleCasesRequest(dir, 'POST', '/BT-A-901/draft', undefined, { drafter: async () => { throw new Error('Codex 오류') } })
    expect(res.status).toBe(502)
    expect(res.body.error).toContain('Codex 오류')
    expect((await loadCases(dir))[0].case?.carousel.cover).toBe('')
  })
  test('unknown route is 404', async () => {
    expect((await handleCasesRequest(dir, 'DELETE', '/BT-A-901', undefined)).status).toBe(404)
  })
})
