import { describe, expect, it } from 'vitest'
import { buildSlides } from './carousel.ts'
import { makeCase } from './fixtures.ts'
import {
  authorOverlap, figureCaptions, findDoi, interactionQuotes, licenseConditions, licenseLabel, sentences, sourceKind,
  suggestPatch, summarizePatch, techQuotes, titleMatch, verdictOf, type VerificationReport, type VerifyCheck,
} from './scholar.ts'

const PAGE1 = `Dream Brush: Generative Painting with Chinese Calligraphy
Chuanqi Sun
Figure 1: Dream Brush is a tangible AI-driven system that turns Chinese calligraphy writing into a Chinese painting.
Abstract
Dream Brush is an interactivity demo that explores how embodied writing can guide generative image-making.
We built a physical installation where partici-
pants write Chinese characters with water on a canvas and watch the system transform each mark into motifs with sound.`

const PAGE2 = `3.2 System and implementation
On each stroke, the handwritten character is captured as an image and recognized with a vision model.
The hardware consists of a metal easel and semi-translucent matte canvas for back-projection, an infrared sensing setup surrounding the canvas for brush detection, and a speaker for sound.
Dream Brush similarly uses Chinese character inscription as the sampled substance, a stroke that is both gesture and concept.
Figure 3: Example of a session with multiple inscriptions and
evolving composition. The user writes a character first.
otherwise separated into tool selection, prompt phrasing, and parameter adjustment.`

describe('titleMatch', () => {
  it('부제 생략은 같은 작품으로 본다', () => {
    expect(titleMatch('Dream Brush', 'Dream Brush: Generative Painting with Chinese Calligraphy')).toBe('prefix')
    expect(titleMatch('dream brush', 'Dream Brush')).toBe('exact')
    expect(titleMatch('Dream Brush', 'Flaring brush and ink')).toBe('none')
  })
})

describe('authorOverlap', () => {
  it('소속 괄호를 무시하고 성으로 맞추며, 기록에 없는 저자를 알려준다', () => {
    const r = authorOverlap('Chuanqi Sun, Yuhan Wang, Quincy Kuang (MIT Media Lab, Tangible Media Group)',
      ['Chuanqi Sun', 'Yuhan Wang', 'Quincy Kuang', 'Hiroshi Ishii'])
    expect(r.matched).toHaveLength(3)
    expect(r.missing).toEqual(['Hiroshi Ishii'])
  })
  it('소속 이름 속 단어를 저자로 착각하지 않는다', () => {
    expect(authorOverlap('Someone (Media Lab)', ['Ann Lab']).matched).toEqual([])
  })
})

describe('findDoi', () => {
  it('URL과 본문에서 DOI를 뽑는다', () => {
    expect(findDoi('https://dl.acm.org/doi/10.1145/3802974.3808682')).toBe('10.1145/3802974.3808682')
    expect(findDoi('https://dl.acm.org/doi/pdf/10.1145/3802974.3808682')).toBe('10.1145/3802974.3808682')
    expect(findDoi('see https://doi.org/10.1145/3802974.3808682.')).toBe('10.1145/3802974.3808682')
    expect(findDoi('https://tangible.media.mit.edu/project/dream-brush/')).toBeNull()
  })
})

describe('license', () => {
  it('CC 라이선스를 이름과 조건으로 바꾼다', () => {
    const url = 'https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode'
    expect(licenseLabel(url)).toBe('CC BY-NC-ND 4.0')
    expect(licenseConditions(url).join(' ')).toMatch(/비상업.*변형 금지/)
  })
})

describe('PDF 본문 분석', () => {
  it('캡션은 섹션 제목·문장 끝에서 끊고, 옆 단 본문을 붙이지 않는다', () => {
    const [c1] = figureCaptions(PAGE1)
    expect(c1).toMatchObject({ no: 1, caption: 'Dream Brush is a tangible AI-driven system that turns Chinese calligraphy writing into a Chinese painting.' })
    const [c3] = figureCaptions(PAGE2)
    expect(c3.no).toBe(3)
    expect(c3.caption).toContain('evolving composition')
    expect(c3.caption).not.toContain('otherwise separated')
  })
  it('하이픈 분철을 잇고 섹션 제목을 문장에 섞지 않는다', () => {
    const s = sentences(PAGE1)
    expect(s.some((x) => x.includes('participants write'))).toBe(true)
    expect(sentences(PAGE2).some((x) => x.startsWith('3.2'))).toBe(false)
  })
  it('기술 인용은 하드웨어 문장을 우선하고, 부분 일치(sampled→LED)는 세지 않는다', () => {
    const q = techQuotes(['', PAGE2])
    expect(q[0].text).toMatch(/infrared/)
    expect(q.every((x) => x.page === 2)).toBe(true)
    expect(q.some((x) => x.text.includes('sampled'))).toBe(false)
  })
  it('인터랙션 인용은 사람+행동 문장', () => {
    expect(interactionQuotes([PAGE1])[0].text).toMatch(/participants write/)
  })
})

const pass = (key: string): VerifyCheck => ({ key, label: key, state: 'pass', detail: '' })

function report(over: Partial<VerificationReport> = {}): VerificationReport {
  return {
    id: 'BT-A-001',
    checkedAt: '2026-11-08T08:00:00.000Z',
    verdict: 'published',
    headline: '',
    publication: {
      doi: '10.1145/3802974.3808682', doiUrl: 'https://doi.org/10.1145/3802974.3808682',
      title: 'Dream Brush: Generative Painting with Chinese Calligraphy', authors: ['Chuanqi Sun', 'Yuhan Wang', 'Hiroshi Ishii'],
      venue: "DIS '26 Companion", container: 'Companion Publication of DIS 2026', publisher: 'ACM', type: 'proceedings-article',
      published: '2026-06-12', year: 2026, pages: '661-663',
      license: { url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode', label: 'CC BY-NC-ND 4.0' }, foundBy: 'crossref-search',
    },
    pdf: { url: 'https://example.edu/paper.pdf', source: 'lab', file: 'figures/BT-A-001/paper.pdf', pages: 3, titleFound: true, doiFound: true },
    checks: ['doi', 'title', 'authors', 'doi-link'].map(pass),
    figures: [
      { no: 1, caption: 'overview', page: 1, file: 'figures/BT-A-001/fig-1.jpg', width: 1600, height: 700 },
      { no: 2, caption: 'setup', page: 3, file: 'figures/BT-A-001/fig-2.jpg', width: 1600, height: 700 },
    ],
    techQuotes: [{ text: 'An infrared sensing setup surrounds the canvas.', page: 2 }],
    interactionQuotes: [],
    missingAuthors: ['Hiroshi Ishii'],
    ...over,
  }
}

describe('verdictOf', () => {
  it('DOI·제목·저자·DOI 연결이 맞으면 게재 확인', () => {
    const r = report()
    expect(verdictOf(r.checks, r.publication)).toBe('published')
  })
  it('DOI가 없으면 기록 없음, 저자가 하나도 안 맞으면 다른 논문', () => {
    expect(verdictOf([], null)).toBe('not-found')
    const checks = [...report().checks.filter((c) => c.key !== 'authors'), { ...pass('authors'), state: 'fail' as const }]
    expect(verdictOf(checks, report().publication)).toBe('mismatch')
  })
  it('DOI 연결을 확인하지 못하면 일부만 확인', () => {
    const checks = report().checks.filter((c) => c.key !== 'doi-link')
    expect(verdictOf(checks, report().publication)).toBe('partial')
  })
})

describe('sourceKind', () => {
  it('연구실 페이지는 출판 증거가 아니다', () => {
    expect(sourceKind('https://tangible.media.mit.edu/project/dream-brush/').strength).toBe('medium')
    expect(sourceKind('https://doi.org/10.1145/1').strength).toBe('strong')
  })
})

describe('suggestPatch', () => {
  const c = makeCase({
    title: 'Dream Brush', creator: 'Chuanqi Sun, Yuhan Wang (MIT Media Lab)', year: '2025',
    source_primary: 'https://tangible.media.mit.edu/project/dream-brush/',
  })

  it('작품 정체·기술 행을 확인으로, 공식 출처를 DOI로, 빠진 저자를 채운다', () => {
    const p = suggestPatch(c, report(), ['figures/BT-A-001/fig-2.jpg'])
    expect(p.evidence?.identity).toMatchObject({ status: '확인', url: 'https://doi.org/10.1145/3802974.3808682', link_opened: true })
    expect(p.evidence?.technology.status).toBe('확인')
    expect(p.evidence?.context.url).toBe('https://tangible.media.mit.edu/project/dream-brush/')
    expect(p.source_primary).toBe('https://doi.org/10.1145/3802974.3808682')
    expect(p.creator).toBe('Chuanqi Sun, Yuhan Wang, Hiroshi Ishii (MIT Media Lab)')
    expect(p.year).toBe("2026 (DIS '26 Companion)")
    expect(p.media?.[0]).toMatchObject({ image: 'figures/BT-A-001/fig-2.jpg', permission: '허용 확인됨' })
    expect(p.media?.[0].permission_basis).toMatch(/CC BY-NC-ND/)
    expect(summarizePatch(c, p).length).toBeGreaterThan(3)
  })

  it('게재 확인이 아니면 아무것도 바꾸지 않는다', () => {
    expect(suggestPatch(c, report({ verdict: 'partial' }))).toEqual({})
  })

  it('반영한 뒤 다시 계산하면 바뀔 것이 없다', () => {
    const p = suggestPatch(c, report(), ['figures/BT-A-001/fig-1.jpg'])
    const after = { ...c, ...p }
    expect(summarizePatch(after, suggestPatch(after, report(), ['figures/BT-A-001/fig-1.jpg']))).toEqual([])
  })

  it('허용된 Figure는 02·03 슬라이드에 들어간다', () => {
    const p = suggestPatch(c, report(), ['figures/BT-A-001/fig-1.jpg', 'figures/BT-A-001/fig-2.jpg'])
    const slides = buildSlides({ ...c, ...p })
    expect(slides[1].image?.file).toBe('figures/BT-A-001/fig-1.jpg')
    expect(slides[2].image?.file).toBe('figures/BT-A-001/fig-2.jpg')
    expect(slides[0].image).toBeUndefined()
  })
})
