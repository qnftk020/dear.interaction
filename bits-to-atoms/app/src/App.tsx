import { Layout } from './components/Layout.tsx'
import { useArchive } from './hooks/useArchive.ts'
import { useHashRoute } from './hooks/useHashRoute.ts'
import { COLLECTIONS, collectionRoute, inCollection } from './lib/collections.ts'
import { casesOf } from './lib/types.ts'
import { countsTowardArchive } from './lib/validate.ts'
import { Archive } from './pages/Archive.tsx'
import { CaseDetail, type CaseTab } from './pages/CaseDetail.tsx'
import { Ideas } from './pages/Ideas.tsx'
import { Overview } from './pages/Overview.tsx'
import { Pipeline } from './pages/Pipeline.tsx'
import { PublicSite } from './pages/PublicSite.tsx'

/** `vite build --mode public`으로 만든 정적 포트폴리오인지 여부 */
const IS_PUBLIC_BUILD = import.meta.env.MODE === 'public'

export function App() {
  const route = useHashRoute()
  const { state, reload, save } = useArchive(IS_PUBLIC_BUILD)

  if (state.status === 'loading') return <p className="status-screen">LOADING ARCHIVE…</p>
  if (state.status === 'error') {
    return (
      <div className="status-screen">
        <p>ERR — {state.error}</p>
        <button type="button" onClick={() => void reload()}>다시 시도</button>
      </div>
    )
  }

  const allCases = casesOf(state.entries)
  if (IS_PUBLIC_BUILD) return <PublicSite cases={allCases} route={route} base="" />

  // 컬렉션마다 사례·검증(중복 번호 등)·통계를 따로 본다.
  const { collection, sub } = collectionRoute(route)
  const { base } = COLLECTIONS[collection]
  const cases = inCollection(allCases, collection)
  const entries = state.entries.filter((e) => !e.case || cases.includes(e.case))

  if (sub.startsWith('/public')) return <PublicSite cases={inCollection(allCases, 'interaction')} route={sub} base="/public" />

  const caseMatch = /^\/case\/([^/]+)(?:\/(record|carousel|export))?$/.exec(sub)
  const current = caseMatch ? cases.find((c) => c.id === caseMatch[1]) : undefined

  let page
  if (sub === '/pipeline') page = <Pipeline cases={cases} onSave={save} />
  else if (sub === '/archive') page = <Archive cases={cases} />
  else if (sub === '/ideas') page = <Ideas cases={cases} />
  else if (current) page = <CaseDetail key={current.id} original={current} all={cases} onSave={save} base={base} tab={(caseMatch?.[2] ?? 'record').toUpperCase() as CaseTab} />
  else if (caseMatch) page = <p className="status-screen">없는 사례입니다: {caseMatch[1]}</p>
  else page = <Overview entries={entries} cases={cases} base={base} />

  return (
    <Layout
      collection={collection}
      sub={sub}
      published={cases.filter((c) => c.stage === '게시됨').length}
      verified={cases.filter(countsTowardArchive).length}
      total={cases.length}
    >
      {page}
    </Layout>
  )
}
