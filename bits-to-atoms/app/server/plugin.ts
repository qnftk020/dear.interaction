import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { COLLECTIONS, COLLECTION_KEYS, type CollectionKey } from '../src/lib/collections.ts'
import { casesOf } from '../src/lib/types.ts'
import { isPublishable } from '../src/lib/validate.ts'
import type { Case } from '../src/lib/schema.ts'
import { HttpError, handleCasesRequest, readJsonBody, sendJson } from './api.ts'
import { runCodex } from './codex.ts'
import { buildDraftPrompt, extractGuide, parseDraft, type Draft } from './draft.ts'
import { loadCases } from './store.ts'
import { figureFilePath, loadReport, savePaperUpload, verifyCase, type VerifyDirs } from './verify.ts'
import type { IncomingMessage } from 'node:http'

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024

async function readRawBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'PDF가 너무 큽니다 (40MB 이하).')
    chunks.push(chunk as Buffer)
  }
  return new Uint8Array(Buffer.concat(chunks))
}

export const PUBLIC_DATA_FILE = 'public-cases.json'

export type CollectionDirs = Record<CollectionKey, string>

/** 지침 문서는 원고를 만들 때마다 새로 읽는다 (지침을 고치면 바로 반영). */
function codexDrafter(guideFile: string) {
  return async (c: Case): Promise<Draft> => {
    const guide = extractGuide(readFileSync(guideFile, 'utf8'))
    return parseDraft(await runCodex(buildDraftPrompt(c, guide)))
  }
}

/**
 * - dev: 컬렉션마다 API를 연다 (/api/cases → data/cases, /api/entertech → data/entertech).
 *   POST /:id/draft 는 로컬 Codex로 6장 원고·캡션을 써서 빈 칸만 채운다 (지침 5-1).
 *   데이터 폴더가 바뀌면 브라우저에 알린다.
 * - build --mode public: 기존 인터랙션 컬렉션에서 검증을 통과한 사례만 public-cases.json으로 내보낸다.
 */
export function archivePlugin(dirs: CollectionDirs, guideFile: string, verifyDirs: VerifyDirs): Plugin {
  let isPublicBuild = false
  return {
    name: 'bits-to-atoms-archive',
    configResolved(config) {
      isPublicBuild = config.mode === 'public' && config.command === 'build'
    },
    configureServer(server) {
      mkdirSync(verifyDirs.figures, { recursive: true })
      const verifier = { run: (c: Case) => verifyCase(c, verifyDirs), load: (id: string) => loadReport(verifyDirs, id) }
      // 논문에서 추출한 Figure·PDF 사본: /files/figures/<id>/<name>
      server.middlewares.use('/files', (req, res, next) => {
        const found = figureFilePath(verifyDirs.figures, (req.url ?? '').split('?')[0])
        if (!found || !existsSync(found.file)) return next()
        res.setHeader('Content-Type', found.mime)
        res.setHeader('Cache-Control', 'no-cache')
        createReadStream(found.file).pipe(res)
      })
      for (const key of COLLECTION_KEYS) {
        const dataDir = dirs[key]
        mkdirSync(dataDir, { recursive: true })
        const { api, idPrefix } = COLLECTIONS[key]
        const drafter = codexDrafter(guideFile)
        server.middlewares.use(api, (req, res) => {
          const subPath = (req.url ?? '/').split('?')[0] || '/'
          // PUT /:id/paper — 브라우저에서 받은 PDF를 올리고 바로 다시 검증한다 (출판사가 자동 접속을 막을 때)
          const paper = /^\/([^/]+)\/paper$/.exec(subPath)
          if (req.method === 'PUT' && paper) {
            const id = decodeURIComponent(paper[1])
            readRawBody(req)
              .then(async (bytes) => {
                if (!id.startsWith(idPrefix)) throw new HttpError(400, `이 컬렉션의 id는 ${idPrefix}로 시작해야 합니다.`)
                try {
                  await savePaperUpload(verifyDirs, id, bytes)
                } catch (e) {
                  throw new HttpError(400, e instanceof Error ? e.message : 'PDF 저장 실패')
                }
                return handleCasesRequest(dataDir, 'POST', `/${encodeURIComponent(id)}/verify`, undefined, { idPrefix, verifier })
              })
              .catch((e: unknown) => {
                const status = e instanceof HttpError ? e.status : 500
                return { status, body: { success: false, data: null, error: e instanceof Error ? e.message : '오류' } }
              })
              .then((result) => sendJson(res, result))
            return
          }
          readJsonBody(req)
            .then((body) => handleCasesRequest(dataDir, req.method ?? 'GET', subPath, body, { idPrefix, drafter, verifier }))
            .catch((e: unknown) => {
              const status = e instanceof HttpError ? e.status : 500
              return { status, body: { success: false, data: null, error: e instanceof Error ? e.message : '오류' } }
            })
            .then((result) => sendJson(res, result))
        })
        server.watcher.add(dataDir)
      }
      server.watcher.on('all', (_event, file) => {
        const changed = path.resolve(file)
        if (COLLECTION_KEYS.some((k) => changed.startsWith(dirs[k]))) {
          server.ws.send({ type: 'custom', event: 'archive:changed' })
        }
      })
    },
    async generateBundle() {
      if (!isPublicBuild) return
      const cases = casesOf(await loadCases(dirs.interaction))
      const published = cases.filter((c) => isPublishable(c, cases))
      // 재게시가 허용된 논문 Figure만 공개 빌드에 싣는다
      for (const m of published.flatMap((c) => c.media)) {
        if (!m.image || m.permission !== '허용 확인됨') continue
        const found = figureFilePath(verifyDirs.figures, m.image)
        if (found && existsSync(found.file)) this.emitFile({ type: 'asset', fileName: m.image, source: readFileSync(found.file) })
      }
      this.emitFile({
        type: 'asset',
        fileName: PUBLIC_DATA_FILE,
        source: JSON.stringify({ generatedAt: new Date().toISOString(), cases: published }, null, 2),
      })
    },
  }
}
