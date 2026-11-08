import type { Case } from './schema.ts'

/** 사례 파일 하나를 읽은 결과. 스키마 오류가 있으면 case 대신 error가 채워진다. */
export interface LoadedEntry {
  file: string
  case?: Case
  error?: string
}

export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
}

export const casesOf = (entries: LoadedEntry[]): Case[] => entries.flatMap((e) => (e.case ? [e.case] : []))
