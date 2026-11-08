/**
 * 로컬 Codex CLI로 원고를 받는다: codex exec (읽기 전용 샌드박스, 세션 기록 안 남김).
 * 프롬프트는 stdin으로 넘기고, 최종 답은 --output-schema로 JSON 모양을 강제한다.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DRAFT_JSON_SCHEMA } from './draft.ts'

const DEFAULT_TIMEOUT_MS = 5 * 60_000
const STDERR_TAIL = 600
const IS_WINDOWS = process.platform === 'win32'
const AUTH_ERROR = /401 Unauthorized|not logged in/i

interface Command {
  file: string
  prefix: string[]
}

/**
 * 실행할 codex를 찾는다. BTA_CODEX_BIN으로 바꿀 수 있다.
 * Windows의 npm 전역 설치는 codex.cmd 셸 스크립트라, 셸을 거치지 않도록 그 안의 codex.js를 node로 직접 실행한다.
 */
function resolveCodex(): Command {
  if (process.env.BTA_CODEX_BIN) return { file: process.env.BTA_CODEX_BIN, prefix: [] }
  if (IS_WINDOWS && process.env.APPDATA) {
    const js = path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    if (existsSync(js)) return { file: process.execPath, prefix: [js] }
  }
  return { file: 'codex', prefix: [] }
}

function killTree(pid: number | undefined) {
  if (!pid) return
  if (IS_WINDOWS) spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  else process.kill(pid, 'SIGTERM')
}

function exitError(code: number | null, stderr: string): Error {
  if (AUTH_ERROR.test(stderr)) {
    return new Error("Codex 로그인이 필요합니다. 터미널에서 'codex login'을 한 번 실행한 뒤 다시 시도하세요.")
  }
  return new Error(`Codex가 오류로 끝났습니다 (exit ${code}).\n${stderr.trim()}`)
}

export async function runCodex(prompt: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bta-draft-'))
  const schemaFile = path.join(dir, 'schema.json')
  const outFile = path.join(dir, 'answer.txt')
  try {
    await writeFile(schemaFile, JSON.stringify(DRAFT_JSON_SCHEMA), 'utf8')
    const { file, prefix } = resolveCodex()
    const args = [...prefix, 'exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only',
      '--output-schema', schemaFile, '-o', outFile, '-']

    await new Promise<void>((resolve, reject) => {
      const child = spawn(file, args, { cwd: dir, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
      let stderr = ''
      const timer = setTimeout(() => {
        killTree(child.pid)
        reject(new Error(`Codex가 ${Math.round(timeoutMs / 60_000)}분 안에 끝나지 않아 중단했습니다.`))
      }, timeoutMs)
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL)
      })
      child.on('error', (e) => {
        clearTimeout(timer)
        reject(new Error(`Codex를 실행하지 못했습니다 (${e.message}). 'codex' 명령이 설치돼 있는지 확인하세요.`))
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(exitError(code, stderr))
      })
      child.stdin.end(prompt, 'utf8')
    })

    return await readFile(outFile, 'utf8')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
