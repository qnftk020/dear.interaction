import type { ReactNode } from 'react'
import { href } from '../hooks/useHashRoute.ts'
import { COLLECTIONS, COLLECTION_KEYS, type CollectionKey } from '../lib/collections.ts'
import { pad } from '../lib/derive.ts'

const GOAL = 1000

/** 컬렉션 안의 메뉴. 경로는 컬렉션 접두어(base) 뒤에 붙는다. */
const SECTIONS = [
  { path: '/', label: '홈' },
  { path: '/pipeline', label: '파이프라인' },
  { path: '/archive', label: '아카이브' },
  { path: '/ideas', label: '아이디어' },
]

function isActive(sub: string, path: string): boolean {
  if (path === '/') return sub === '/'
  if (path === '/archive') return sub.startsWith('/archive') || sub.startsWith('/case/')
  return sub.startsWith(path)
}

interface SummaryProps {
  published: number
  verified: number
  total: number
}

interface LayoutProps extends SummaryProps {
  collection: CollectionKey
  sub: string
  children: ReactNode
}

function Summary({ published, verified, total }: SummaryProps) {
  const progress = Math.min(100, (published / GOAL) * 100)
  return (
    <section className="summary" aria-label="진행 현황">
      <div className="summary-card lead">
        <span className="summary-label">게시한 러브레터</span>
        <span className="summary-num">{pad(published)}<small>/ {GOAL.toLocaleString()}</small></span>
        <div className="summary-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="summary-card">
        <span className="summary-label">검증된 사례</span>
        <span className="summary-num">{verified}</span>
        <span className="summary-sub">작품 정체·입력·출력 확인</span>
      </div>
      <div className="summary-card">
        <span className="summary-label">전체 사례</span>
        <span className="summary-num">{total}</span>
        <span className="summary-sub">발견부터 게시까지</span>
      </div>
    </section>
  )
}

export function Layout({ collection, sub, published, verified, total, children }: LayoutProps) {
  const { base, dir } = COLLECTIONS[collection]
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <a href={href('/')} className="brand" aria-label="dear.interaction 홈">
            <span className="brand-mark" aria-hidden="true">d.i</span>
            <span className="brand-name">dear.interaction</span>
          </a>
          <div className="collection-switch" role="tablist" aria-label="리서치 컬렉션">
            {COLLECTION_KEYS.map((k) => (
              <a
                key={k}
                role="tab"
                aria-selected={k === collection}
                href={href(COLLECTIONS[k].base || '/')}
                className={k === collection ? 'on' : ''}
              >
                {COLLECTIONS[k].label}
              </a>
            ))}
          </div>
          <nav className="nav" aria-label="주 메뉴">
            {SECTIONS.map((n) => (
              <a key={n.path} href={href(`${base}${n.path === '/' && base ? '' : n.path}`)} className={isActive(sub, n.path) ? 'active' : ''}>{n.label}</a>
            ))}
            {collection === 'interaction' && <a href={href('/public')}>공개 화면</a>}
          </nav>
        </div>
      </header>
      {sub === '/' && <Summary published={published} verified={verified} total={total} />}
      <main>{children}</main>
      <footer className="foot">
        <span>원본 데이터 <code>future/bits-to-atoms/data/{dir}/*.yaml</code></span>
        <span>검사 <code>npm run validate</code></span>
      </footer>
    </div>
  )
}
