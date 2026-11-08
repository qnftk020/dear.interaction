import { useState } from 'react'
import { ExtLink } from '../components/Bits.tsx'
import { Carousel } from '../components/Carousel.tsx'
import { EvidenceTable, MediaList } from '../components/CaseParts.tsx'
import { href } from '../hooks/useHashRoute.ts'
import { letterLabel, pad } from '../lib/derive.ts'
import { SCOPE_LABELS, type Case } from '../lib/schema.ts'
import { isPublishable } from '../lib/validate.ts'

/** 포트폴리오에서 보여주고 싶은 역량 */
const METHOD = ['자료 발견', '정의와 분류', '신뢰성 검증', '상호작용 분석', '문화 경험 디자인으로의 응용']

interface PublicSiteProps {
  cases: Case[]
  route: string
  /** 워크벤치 안에서 미리볼 때는 '/public', 공개 빌드에서는 '' */
  base: string
}

function IndexCard({ c, base }: { c: Case; base: string }) {
  return (
    <a className="pcard" href={href(`${base}/case/${c.id}`)}>
      <span className="letter-no" aria-hidden="true">{c.letter_no === null ? '—' : pad(c.letter_no)}</span>
      <span className="pcard-no">LOVE LETTER {letterLabel(c)}</span>
      <strong className="pcard-title">{c.carousel.cover}</strong>
      <span className="pcard-to">{c.title}</span>
      <span className="pcard-line"><b>INPUT</b> {c.input}</span>
      <span className="pcard-meta">{c.creator} · {c.year}{c.scope === 'EXTENDED' && ' · 확장 사례'}</span>
    </a>
  )
}

function PublicIndex({ cases, base }: { cases: Case[]; base: string }) {
  const [scope, setScope] = useState<'ALL' | 'TANGIBLE' | 'EXTENDED'>('ALL')
  const shown = scope === 'ALL' ? cases : cases.filter((c) => c.scope === scope)
  return (
    <>
      <section className="hero">
        <p className="hero-kicker">dear.interaction — 1,000 LOVE LETTERS TO INTERACTION</p>
        <p className="hero-greeting">Dear, Interaction.</p>
        <h1>경험을 설계하는 방식으로 첫사랑, 인터랙션을 탐구합니다.</h1>
        <div className="hero-body">
          <p>인터랙션 디자인이 첫사랑이었습니다. 그러다 광고와도 사랑에 빠졌고, 그곳에서 상도 받았습니다. 그래도 인터랙션이 잊히지 않아 돌아왔습니다.</p>
          <p>이제 광고에서 익힌 시선 — 관심, 감정, 기억 — 으로 다시 봅니다. 사람이 무엇을 하고, 작품이 어떻게 반응하고, 그 경험이 무엇을 남기는지. 매번 같은 형식으로, 출처를 확인한 것만 씁니다.</p>
        </div>
        <p className="hero-ps">P.S. 광고는 상을 줬고, 인터랙션은 미련을 줬습니다.</p>
        <p className="hero-count"><span>{pad(cases.length)}</span> / 1000 letters sent</p>
      </section>
      <ol className="method">
        {METHOD.map((m, i) => <li key={m}><span className="muted">{pad(i + 1, 2)}</span> {m}</li>)}
      </ol>
      <div className="chips" role="group" aria-label="분류로 거르기">
        {(['ALL', 'TANGIBLE', 'EXTENDED'] as const).map((s) => (
          <button key={s} type="button" className={scope === s ? 'chip on' : 'chip'} onClick={() => setScope(s)}>
            {s === 'ALL' ? '전체' : SCOPE_LABELS[s]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty-state">아직 게시된 러브레터가 없습니다. 출처를 확인한 사례부터 한 통씩 씁니다.</p>
      ) : (
        <div className="pgrid">{shown.map((c) => <IndexCard key={c.id} c={c} base={base} />)}</div>
      )}
    </>
  )
}

function PublicCase({ c, base }: { c: Case; base: string }) {
  return (
    <article className="pdetail wide">
      <a href={href(base || '/')} className="back">← 목록</a>
      <p className="pcard-no">LOVE LETTER {letterLabel(c)} · {SCOPE_LABELS[c.scope]}</p>
      <h1>{c.title}</h1>
      <p className="detail-meta">{c.creator} · {c.year} · {c.location} · {c.context}</p>
      <Carousel c={c} />
      <section>
        <h2 className="panel-title">CAPTION</h2>
        <p className="pre">{c.caption.text}</p>
        <p className="muted">{c.caption.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}</p>
      </section>
      <section><h2 className="panel-title">리서치 근거</h2><EvidenceTable evidence={c.evidence} /><p className="caption">공식 출처: <ExtLink url={c.source_primary} /> · 04는 에디터 해석, 05는 가상 제안입니다.</p></section>
      <section><h2 className="panel-title">이미지·영상 소스와 재게시 권리</h2><MediaList media={c.media} /></section>
    </article>
  )
}

export function PublicSite({ cases, route, base }: PublicSiteProps) {
  const published = cases.filter((c) => isPublishable(c, cases)).sort((a, b) => (a.letter_no ?? 0) - (b.letter_no ?? 0))
  const sub = route.slice(base.length) || '/'
  const match = /^\/case\/(.+)$/.exec(sub)
  const selected = match ? published.find((c) => c.id === match[1]) : undefined
  return (
    <div className="public">
      {base && <p className="preview-banner">PUBLIC PREVIEW — 공개 빌드에는 '게시됨' 러브레터만 포함됩니다 · <a href={href('/')}>워크벤치로</a></p>}
      {match && !selected && <p className="empty-state">공개되지 않았거나 없는 러브레터입니다.</p>}
      {selected ? <PublicCase c={selected} base={base} /> : !match && <PublicIndex cases={published} base={base} />}
      <footer className="foot">
        <span>dear.interaction · Love Letters to Interaction</span>
        <span>모든 사례는 1차 출처로 확인하며, 사실과 에디터 해석을 구분해 기록합니다.</span>
      </footer>
    </div>
  )
}
