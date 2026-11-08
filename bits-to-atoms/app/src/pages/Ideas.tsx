import { useState } from 'react'
import { Tag } from '../components/Bits.tsx'
import { SingleSlide } from '../components/Carousel.tsx'
import { href } from '../hooks/useHashRoute.ts'
import { WHAT_IF_DISCLAIMER } from '../lib/carousel.ts'
import { collectIdeas, contextOf, filterIdeas, IDEA_CONTEXTS, type IdeaFilter } from '../lib/ideas.ts'
import type { Case } from '../lib/schema.ts'

type View = 'CARD' | 'SLIDE'

const FIELDS = [
  ['audience', '누구에게'],
  ['action', '무엇을 하면'],
  ['response', '어떻게 반응하고'],
  ['message', '무엇이 남나'],
] as const

function IdeaCard({ c }: { c: Case }) {
  const w = c.what_if
  return (
    <article className="idea">
      <header className="idea-head">
        <Tag tone={w.context ? 'plain' : 'muted'}>{contextOf(c)}</Tag>
        <a href={href(`/case/${c.id}/carousel`)} className="idea-source">{c.title} ›</a>
      </header>
      <p className="idea-copy">{c.carousel.what_if || <span className="muted">05 원고가 아직 없어요</span>}</p>
      <dl className="idea-fields">
        {FIELDS.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{w[key] || <span className="muted">—</span>}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

export function Ideas({ cases }: { cases: Case[] }) {
  const [filter, setFilter] = useState<IdeaFilter>('ALL')
  const [view, setView] = useState<View>('CARD')
  const { ideas, missing, counts } = collectIdeas(cases)
  const shown = filterIdeas(ideas, filter)

  return (
    <div className="ideas">
      <section className="ideas-intro">
        <div>
          <h1>아이디어</h1>
          <p className="muted">레퍼런스마다 05 WHAT IF?만 모았어요. {WHAT_IF_DISCLAIMER.replace('※ ', '')}</p>
        </div>
        <div className="tabs" role="group" aria-label="보기 방식">
          <button type="button" className={view === 'CARD' ? 'tab on' : 'tab'} onClick={() => setView('CARD')}>카드</button>
          <button type="button" className={view === 'SLIDE' ? 'tab on' : 'tab'} onClick={() => setView('SLIDE')}>슬라이드</button>
        </div>
      </section>

      <div className="chips" role="group" aria-label="맥락으로 거르기">
        <button type="button" className={filter === 'ALL' ? 'chip on' : 'chip'} onClick={() => setFilter('ALL')}>전체 {ideas.length}</button>
        {IDEA_CONTEXTS.filter((k) => counts[k] > 0).map((k) => (
          <button key={k} type="button" className={filter === k ? 'chip on' : 'chip'} onClick={() => setFilter(k)}>{k} {counts[k]}</button>
        ))}
      </div>

      {shown.length === 0 && <p className="empty-state">이 맥락의 아이디어가 아직 없어요.</p>}
      {view === 'CARD' ? (
        <div className="idea-grid">{shown.map((c) => <IdeaCard key={c.id} c={c} />)}</div>
      ) : (
        <div className="carousel">
          {shown.map((c) => (
            <a key={c.id} href={href(`/case/${c.id}/carousel`)} className="idea-slide" aria-label={`${c.title} 05 WHAT IF`}>
              <SingleSlide c={c} no="05" />
              <span className="idea-slide-title">{c.title}</span>
            </a>
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <section className="ideas-missing">
          <h2 className="section-head">아직 05가 비어 있는 사례 {missing.length}</h2>
          <div className="chips">
            {missing.map((c) => <a key={c.id} className="chip" href={href(`/case/${c.id}/carousel`)}>{c.title}</a>)}
          </div>
        </section>
      )}
    </div>
  )
}
