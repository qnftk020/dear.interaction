import { useState } from 'react'
import { Panel } from '../components/Bits.tsx'
import { toMarkdown } from '../lib/carousel.ts'
import type { Case } from '../lib/schema.ts'

export function CopyButton({ text, label = '복사' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('done')
    } catch {
      setState('fail')
    }
  }
  return (
    <button type="button" className="primary" onClick={() => void copy()}>
      {state === 'done' ? '복사됨 ✓' : state === 'fail' ? '복사 실패 — 직접 선택하세요' : label}
    </button>
  )
}

/** 지침 8절 출력 형식. 저장하지 않은 수정도 반영된다. */
export function ExportTab({ draft, all }: { draft: Case; all: Case[] }) {
  const md = toMarkdown(draft, all)
  return (
    <Panel title="EXPORT — 지침 8절 출력 형식 (캐러셀 → 캡션 → 근거 → 권리 → DB → 게시 전 확인)" className="span-all">
      <div className="toolbar">
        <CopyButton text={md} label="마크다운 복사" />
        <span className="caption">저장하지 않은 수정도 반영됩니다.</span>
      </div>
      <textarea className="export" readOnly value={md} rows={36} aria-label="내보낼 마크다운" />
    </Panel>
  )
}
