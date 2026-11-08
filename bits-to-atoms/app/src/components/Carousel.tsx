import { fileUrl } from '../api.ts'
import { buildSlides, type Slide } from '../lib/carousel.ts'
import type { Case } from '../lib/schema.ts'

/** 02의 'To. 작품명'은 손글씨 'To.'와 작품명으로 나눠 그린다. */
function Kicker({ s }: { s: Slide }) {
  if (!s.kicker) return null
  if (s.kicker.startsWith('To. ')) {
    return <p className="slide-kicker"><span className="slide-to">To.</span> {s.kicker.slice(4)}</p>
  }
  return <p className="slide-kicker">{s.kicker}</p>
}

/** 변형 금지(ND) 라이선스가 많아 자르지 않고 원본 비율 그대로 넣는다. */
function SlideImage({ s }: { s: Slide }) {
  if (!s.image) return null
  return <img className="slide-img" src={fileUrl(s.image.file)} alt={s.image.credit} />
}

function SlideBody({ s }: { s: Slide }) {
  if (s.rows.length > 0) {
    return (
      <div className="slide-main">
      <SlideImage s={s} />
      <dl className="slide-rows">
        {s.rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      </div>
    )
  }
  return (
    <div className="slide-main">
      <SlideImage s={s} />
      <p className="slide-body">{s.body || <span className="muted">(원고 없음)</span>}</p>
    </div>
  )
}

function SlideCard({ s, index, total }: { s: Slide; index: number; total: number }) {
  return (
    <div className="slide-frame">
      <figure className={`slide slide-${s.no}${s.image ? ' has-img' : ''}`} aria-label={`${s.no} ${s.name}`}>
        <header className="slide-head">
          <span className="slide-chip">{s.no === '06' ? 'P.S.' : s.no} · {s.no === '06' ? 'I STILL LOVE YOU' : s.name}</span>
          <span className="slide-brand">dear.interaction</span>
        </header>
        <Kicker s={s} />
        <SlideBody s={s} />
        {s.no === '01' && <span className="seal" aria-hidden="true">d.i</span>}
        <footer className="slide-foot">
          {s.note && <span className="slide-note">{s.note}</span>}
          {s.image && <span className="slide-imgcredit">사진: {s.image.credit}</span>}
          {s.footer && <span className="slide-credit">{s.footer}</span>}
          <span className="slide-dots" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)}
          </span>
        </footer>
      </figure>
    </div>
  )
}

/** 캐러셀 중 한 장만 (아이디어 탭에서 05만 모아 볼 때) */
export function SingleSlide({ c, no }: { c: Case; no: string }) {
  const slides = buildSlides(c)
  const index = slides.findIndex((s) => s.no === no)
  if (index < 0) return null
  return <SlideCard s={slides[index]} index={index} total={slides.length} />
}

/** 4:5 인스타 캐러셀 6장 미리보기. 이미지는 권리 확인 전까지 넣지 않는다. */
export function Carousel({ c }: { c: Case }) {
  const slides = buildSlides(c)
  return (
    <div className="carousel">
      {slides.map((s, i) => <SlideCard key={s.no} s={s} index={i} total={slides.length} />)}
    </div>
  )
}
