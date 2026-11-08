import { useCallback, useEffect, useState } from 'react'
import { fetchEntries, fetchPublicEntries, putCase } from '../api.ts'
import type { Case } from '../lib/schema.ts'
import type { LoadedEntry } from '../lib/types.ts'

export type ArchiveState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; entries: LoadedEntry[] }

const messageOf = (e: unknown) => (e instanceof Error ? e.message : '알 수 없는 오류')

export function useArchive(isPublic: boolean) {
  const [state, setState] = useState<ArchiveState>({ status: 'loading' })

  const reload = useCallback(async () => {
    try {
      const entries = isPublic ? await fetchPublicEntries() : await fetchEntries()
      setState({ status: 'ready', entries })
    } catch (e) {
      setState({ status: 'error', error: messageOf(e) })
    }
  }, [isPublic])

  useEffect(() => {
    void reload()
  }, [reload])

  // 제가(Claude) data/cases에 파일을 쓰면 dev 서버가 알려주고, 화면이 바로 갱신된다.
  useEffect(() => {
    if (!import.meta.hot) return
    const onChange = () => void reload()
    import.meta.hot.on('archive:changed', onChange)
    return () => import.meta.hot?.off('archive:changed', onChange)
  }, [reload])

  const save = useCallback(async (next: Case): Promise<Case> => {
    const saved = await putCase(next)
    setState((prev) =>
      prev.status !== 'ready'
        ? prev
        : { status: 'ready', entries: prev.entries.map((e) => (e.case?.id === saved.id ? { ...e, case: saved } : e)) },
    )
    return saved
  }, [])

  return { state, reload, save }
}
