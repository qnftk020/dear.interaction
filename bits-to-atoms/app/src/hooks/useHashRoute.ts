import { useEffect, useState } from 'react'

const read = (): string => window.location.hash.replace(/^#/, '') || '/'

/** 해시 라우팅. 정적 호스팅(공개 빌드)에서도 서버 설정 없이 동작한다. */
export function useHashRoute(): string {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export const href = (path: string): string => `#${path}`
