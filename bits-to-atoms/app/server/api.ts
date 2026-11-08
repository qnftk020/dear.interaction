import type { IncomingMessage, ServerResponse } from 'node:http'
import { ZodError } from 'zod'
import type { Case } from '../src/lib/schema.ts'
import type { VerificationReport } from '../src/lib/scholar.ts'
import type { ApiEnvelope } from '../src/lib/types.ts'
import { mergeDraft, needsDraft, type Draft } from './draft.ts'
import { formatZodError, loadCases, saveCase } from './store.ts'

const MAX_BODY_BYTES = 1_000_000

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export interface ApiResult {
  status: number
  body: ApiEnvelope<unknown>
}

const ok = (data: unknown): ApiResult => ({ status: 200, body: { success: true, data, error: null } })
const fail = (status: number, error: string): ApiResult => ({ status, body: { success: false, data: null, error } })

export interface CasesRequestOptions {
  /** 이 폴더에 저장할 수 있는 id 접두어 (예: 'BT-E-'). 다른 컬렉션 사례가 섞이는 걸 막는다. */
  idPrefix?: string
  /** 사례 → 원고. dev 서버에서는 Codex, 테스트에서는 가짜 함수를 넣는다. 없으면 draft 경로를 막는다. */
  drafter?: (c: Case) => Promise<Draft>
  /** 학술 출판 자동 검증 (Crossref·PDF). 없으면 verify 경로를 막는다. */
  verifier?: {
    run: (c: Case) => Promise<VerificationReport>
    load: (id: string) => Promise<VerificationReport | null>
  }
}

/** 같은 사례에 원고 생성이 겹치지 않게 한다 (화살표를 여러 번 눌러도 1번만). */
const drafting = new Set<string>()

async function handleDraft(dataDir: string, id: string, drafter: CasesRequestOptions['drafter']): Promise<ApiResult> {
  if (!drafter) return fail(404, '원고 자동 생성이 켜져 있지 않습니다.')
  const current = (await loadCases(dataDir)).find((e) => e.case?.id === id)?.case
  if (!current) return fail(404, `없는 사례입니다: ${id}`)
  if (!needsDraft(current)) return fail(409, '이미 쓴 원고가 있어 자동 생성하지 않았습니다. 원고 칸을 비우면 다시 생성할 수 있어요.')
  if (drafting.has(id)) return fail(409, '이 사례의 원고를 이미 생성하고 있습니다.')
  drafting.add(id)
  try {
    let draft: Draft
    try {
      draft = await drafter(current)
    } catch (e) {
      return fail(502, e instanceof Error ? e.message : '원고 생성 실패')
    }
    // Codex가 쓰는 동안 사용자가 고쳤을 수 있으니, 최신 파일에 빈 칸만 채운다.
    const latest = (await loadCases(dataDir)).find((e) => e.case?.id === id)?.case ?? current
    return ok({ case: await saveCase(dataDir, mergeDraft(latest, draft)) })
  } finally {
    drafting.delete(id)
  }
}

const verifying = new Set<string>()

async function handleVerify(dataDir: string, method: string, id: string, verifier: CasesRequestOptions['verifier']): Promise<ApiResult> {
  if (!verifier) return fail(404, '자동 검증이 켜져 있지 않습니다.')
  if (method === 'GET') return ok({ report: await verifier.load(id) })
  const current = (await loadCases(dataDir)).find((e) => e.case?.id === id)?.case
  if (!current) return fail(404, `없는 사례입니다: ${id}`)
  if (verifying.has(id)) return fail(409, '이 사례를 이미 검증하고 있습니다.')
  verifying.add(id)
  try {
    return ok({ report: await verifier.run(current) })
  } catch (e) {
    return fail(502, `자동 검증 실패: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    verifying.delete(id)
  }
}

/**
 * /api/cases 라우팅. HTTP 객체와 분리해 테스트할 수 있게 했다.
 * subPath는 마운트 지점 뒤의 경로다 ('/', '/BT-A-001', '/BT-A-001/draft', '/BT-A-001/verify').
 */
export async function handleCasesRequest(
  dataDir: string,
  method: string,
  subPath: string,
  body: unknown,
  options: CasesRequestOptions = {},
): Promise<ApiResult> {
  try {
    if (method === 'GET' && subPath === '/') return ok({ entries: await loadCases(dataDir) })
    const draftMatch = /^\/([^/]+)\/draft$/.exec(subPath)
    if (method === 'POST' && draftMatch) return await handleDraft(dataDir, decodeURIComponent(draftMatch[1]), options.drafter)
    const verifyMatch = /^\/([^/]+)\/verify$/.exec(subPath)
    if ((method === 'GET' || method === 'POST') && verifyMatch) {
      return await handleVerify(dataDir, method, decodeURIComponent(verifyMatch[1]), options.verifier)
    }
    const match = /^\/([^/]+)$/.exec(subPath)
    if (method === 'PUT' && match) {
      const id = decodeURIComponent(match[1])
      const bodyId = typeof body === 'object' && body !== null ? (body as { id?: unknown }).id : undefined
      if (bodyId !== id) return fail(400, 'URL의 id와 본문의 id가 다릅니다.')
      if (options.idPrefix && !id.startsWith(options.idPrefix)) {
        return fail(400, `이 컬렉션의 id는 ${options.idPrefix}로 시작해야 합니다: ${id}`)
      }
      return ok({ case: await saveCase(dataDir, body) })
    }
    return fail(404, '없는 경로입니다.')
  } catch (e) {
    if (e instanceof ZodError) return fail(400, formatZodError(e))
    if (e instanceof HttpError) return fail(e.status, e.message)
    console.error('[archive api]', e)
    return fail(500, '서버 오류가 발생했습니다. 터미널 로그를 확인하세요.')
  }
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== 'PUT' && req.method !== 'POST') return undefined
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, '요청 본문이 너무 큽니다.')
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'JSON 본문을 해석하지 못했습니다.')
  }
}

export function sendJson(res: ServerResponse, result: ApiResult): void {
  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(result.body))
}
