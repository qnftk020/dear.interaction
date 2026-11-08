import { readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import type { ZodError } from 'zod'
import { caseSchema, ID_PATTERN, type Case } from '../src/lib/schema.ts'
import type { LoadedEntry } from '../src/lib/types.ts'

const CASE_FILE = /\.ya?ml$/

export function formatZodError(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
}

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** id를 검증한 뒤에만 경로를 만든다. data 폴더 밖으로 나가는 경로를 막는다. */
export function caseFilePath(dir: string, id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`잘못된 id입니다: ${id}`)
  return path.join(dir, `${id}.yaml`)
}

async function loadOne(dir: string, file: string): Promise<LoadedEntry> {
  try {
    const raw = await readFile(path.join(dir, file), 'utf8')
    const result = caseSchema.safeParse(parse(raw))
    if (!result.success) return { file, error: formatZodError(result.error) }
    if (path.parse(file).name !== result.data.id) {
      return { file, error: `파일명은 id와 같아야 합니다: ${result.data.id}.yaml` }
    }
    return { file, case: result.data }
  } catch (e) {
    return { file, error: `YAML을 읽지 못했습니다: ${errorMessage(e)}` }
  }
}

/** `_`로 시작하는 파일(템플릿)은 건너뛴다. */
export async function loadCases(dir: string): Promise<LoadedEntry[]> {
  const files = (await readdir(dir)).filter((f) => CASE_FILE.test(f) && !f.startsWith('_')).sort()
  return Promise.all(files.map((f) => loadOne(dir, f)))
}

/** 스키마로 검증한 뒤 임시 파일에 쓰고 rename해서, 쓰다가 실패해도 원본이 깨지지 않게 한다. */
export async function saveCase(dir: string, input: unknown): Promise<Case> {
  const parsed = caseSchema.parse(input)
  const file = caseFilePath(dir, parsed.id)
  const tmp = `${file}.tmp`
  await writeFile(tmp, stringify(parsed, { lineWidth: 0 }), 'utf8')
  await rename(tmp, file)
  return parsed
}
