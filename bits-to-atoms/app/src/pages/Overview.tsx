import { Panel, StatRow } from '../components/Bits.tsx'
import { href } from '../hooks/useHashRoute.ts'
import { SCOPE_LABELS, type Case, type Scope } from '../lib/schema.ts'
import { MILESTONES, summarize } from '../lib/stats.ts'
import type { LoadedEntry } from '../lib/types.ts'
import { checkCase } from '../lib/validate.ts'
import { CoverageMap } from './CoverageMap.tsx'

function Distribution({ counts, total, labels }: { counts: Record<string, number>; total: number; labels?: Record<string, string> }) {
  return (
    <>
      {Object.entries(counts).map(([k, v]) => (
        <StatRow key={k} label={labels?.[k] ?? k} value={v} total={total} />
      ))}
    </>
  )
}

function Attention({ cases, broken }: { cases: readonly Case[]; broken: LoadedEntry[] }) {
  const flagged = cases
    .map((c) => ({ c, errors: checkCase(c, cases).filter((i) => i.level === 'error') }))
    .filter((x) => x.errors.length > 0)
  if (flagged.length === 0 && broken.length === 0) return <p className="ok-line">✓ 처리할 오류 없음</p>
  return (
    <ul className="attention">
      {broken.map((e) => (
        <li key={e.file}>
          <span className="issue-mark err">FILE</span>
          <code>{e.file}</code>
          <pre>{e.error}</pre>
        </li>
      ))}
      {flagged.map(({ c, errors }) => (
        <li key={c.id}>
          <span className="issue-mark err">ERR {errors.length}</span>
          <a href={href(`/case/${c.id}`)}>{c.id} {c.title}</a>
          <span className="muted">{errors[0].message}</span>
        </li>
      ))}
    </ul>
  )
}

export function Overview({ entries, cases, base = '' }: { entries: LoadedEntry[]; cases: Case[]; base?: string }) {
  const s = summarize(cases)
  const broken = entries.filter((e) => e.error)
  const total = Math.max(1, s.total)
  return (
    <div className="grid">
      <Panel title="러브레터 마일스톤" hint="1,000개 때문에 기준을 낮추지 않아요" className="span-2">
        {MILESTONES.map((m) => (
          <StatRow key={m} label={`게시 · ${m}`} value={s.published} total={m} width={40} suffix={<span className="muted">/{m}</span>} />
        ))}
        <StatRow label="검증된 사례" value={s.counted} total={MILESTONES[0]} width={40} suffix={<span className="muted">/{MILESTONES[0]}</span>} />
        <p className="caption">검증 = 작품 정체 + 입력·출력이 모두 '확인'인 탠저블·확장 사례</p>
      </Panel>

      <Panel title="분류" hint="탠저블 우선, 확장은 표기">
        {Object.entries(s.byScope).map(([k, v]) => (
          <StatRow key={k} label={SCOPE_LABELS[k as Scope]} value={v} total={total} />
        ))}
      </Panel>

      <Panel title="파이프라인">
        <Distribution counts={s.byStage} total={total} />
        <a className="more" href={href(`${base}/pipeline`)}>칸반 보기 ›</a>
      </Panel>
      <Panel title="검증 상태"><Distribution counts={s.byVerification} total={total} /></Panel>
      <Panel title="재게시 권리"><Distribution counts={s.byRepost} total={total} /></Panel>

      <Panel title="What if 맥락" hint="한쪽으로 쏠리지 않게"><Distribution counts={s.byWhatIf} total={total} /></Panel>
      <Panel title="시대 분포"><Distribution counts={s.byEra} total={total} /></Panel>
      <Panel title="확인이 필요한 사례"><Attention cases={cases} broken={broken} /></Panel>

      <CoverageMap cases={cases} />
    </div>
  )
}
