import type { Case } from './lib/schema.ts'
import { COLLECTIONS, COLLECTION_KEYS, collectionOf } from './lib/collections.ts'
import type { ApiEnvelope, LoadedEntry } from './lib/types.ts'
import type { VerificationReport } from './lib/scholar.ts'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  let body: ApiEnvelope<T>
  try {
    body = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new Error(`서버 응답을 읽지 못했습니다 (HTTP ${res.status}). npm run dev로 실행 중인지 확인하세요.`)
  }
  if (!res.ok || !body.success || body.data === null) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body.data
}

/** 모든 컬렉션(인터랙션·엔터테크)의 사례를 한 목록으로 읽는다. 화면에서 컬렉션별로 거른다. */
export async function fetchEntries(): Promise<LoadedEntry[]> {
  const lists = await Promise.all(
    COLLECTION_KEYS.map(async (k) => (await request<{ entries: LoadedEntry[] }>(COLLECTIONS[k].api)).entries),
  )
  return lists.flat()
}

/** 공개 빌드는 빌드 시점에 내보낸 정적 JSON만 읽는다. */
export async function fetchPublicEntries(): Promise<LoadedEntry[]> {
  const res = await fetch('./public-cases.json')
  if (!res.ok) throw new Error('공개 데이터를 불러오지 못했습니다.')
  const data = (await res.json()) as { cases: Case[] }
  return data.cases.map((c) => ({ file: `${c.id}.yaml`, case: c }))
}

/** id 접두어로 어느 컬렉션 폴더에 저장할지 정한다. */
export async function putCase(c: Case): Promise<Case> {
  const { api } = COLLECTIONS[collectionOf(c.id)]
  const data = await request<{ case: Case }>(`${api}/${encodeURIComponent(c.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  })
  return data.case
}

/** 로컬 Codex로 6장 원고·캡션을 써서 빈 칸만 채운다. 1~3분쯤 걸린다. */
export async function requestDraft(id: string): Promise<Case> {
  const { api } = COLLECTIONS[collectionOf(id)]
  const data = await request<{ case: Case }>(`${api}/${encodeURIComponent(id)}/draft`, { method: 'POST' })
  return data.case
}

/** 저장된 자동 검증 결과 (없으면 null) */
export async function fetchVerification(id: string): Promise<VerificationReport | null> {
  const { api } = COLLECTIONS[collectionOf(id)]
  const data = await request<{ report: VerificationReport | null }>(`${api}/${encodeURIComponent(id)}/verify`)
  return data.report
}

/** Crossref·DOI·PDF 자동 검증을 새로 돌린다. 10~40초쯤 걸린다. */
export async function runVerification(id: string): Promise<VerificationReport> {
  const { api } = COLLECTIONS[collectionOf(id)]
  const data = await request<{ report: VerificationReport }>(`${api}/${encodeURIComponent(id)}/verify`, { method: 'POST' })
  return data.report
}

/** 브라우저에서 받은 논문 PDF를 올리고 다시 검증한다. */
export async function uploadPaper(id: string, file: File): Promise<VerificationReport> {
  const { api } = COLLECTIONS[collectionOf(id)]
  const data = await request<{ report: VerificationReport }>(`${api}/${encodeURIComponent(id)}/paper`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  })
  return data.report
}

/** data/ 아래 파일(figures/BT-A-005/fig-1.jpg)의 주소. 공개 빌드는 같은 경로로 함께 내보낸다. */
export const fileUrl = (rel: string): string => (import.meta.env.MODE === 'public' ? `./${rel}` : `/files/${rel}`)
