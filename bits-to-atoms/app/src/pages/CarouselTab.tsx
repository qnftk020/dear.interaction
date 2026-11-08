import { useState } from 'react'
import { Carousel } from '../components/Carousel.tsx'
import { SelfCheckList } from '../components/SelfCheckList.tsx'
import { COVER_LINE_CHARS, lineCount, parseList, sentenceCount, SLIDE_LINE_CHARS, SLIDE_MAX_LINES } from '../lib/derive.ts'
import { WHAT_IF_CONTEXTS, type Case } from '../lib/schema.ts'
import type { Patch } from './RecordTab.tsx'

interface TabProps {
  draft: Case
  all: Case[]
  set: Patch
}

function Counter({ value, min, max, unit }: { value: number; min: number; max: number; unit: string }) {
  const ok = value >= min && value <= max
  return <span className={ok ? 'count ok' : 'count over'}>{value}{unit} · 권장 {min}~{max}</span>
}

interface SlideFieldProps {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  rows?: number
}

/** 슬라이드 본문: 줄바꿈 그대로 슬라이드에 찍힌다. 한 줄이 길면 접혀서 줄 수가 늘어난다. */
function SlideField({ label, hint, value, onChange, rows = 3 }: SlideFieldProps) {
  return (
    <label className="field wide">
      <span className="field-head">{label} <Counter value={lineCount(value)} min={1} max={SLIDE_MAX_LINES} unit={`줄 (한 줄 ${SLIDE_LINE_CHARS}자)`} /></span>
      <textarea rows={rows} value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

/** 해시태그·키워드: 입력 중 쉼표가 사라지지 않게 문자열을 따로 들고 있다. */
function ListField({ label, initial, onChange }: { label: string; initial: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(initial.join(', '))
  const count = parseList(text).length
  return (
    <label className="field">
      <span className="field-head">{label} <Counter value={count} min={3} max={5} unit="개" /></span>
      <input value={text} placeholder="쉼표로 구분" onChange={(e) => { setText(e.target.value); onChange(parseList(e.target.value)) }} />
    </label>
  )
}

export function CarouselTab({ draft, all, set }: TabProps) {
  const cv = draft.carousel
  const setSlide = (key: keyof Case['carousel']) => (v: string) => set({ carousel: { ...cv, [key]: v } })
  const setWhatIf = (patch: Partial<Case['what_if']>) => set({ what_if: { ...draft.what_if, ...patch } })
  const coverLen = [...cv.cover.replace(/\s+/g, ' ').trim()].length
  const coverLines = lineCount(cv.cover, COVER_LINE_CHARS)
  return (
    <div className="editor">
      <div className="editor-form">
        <h3 className="editor-sec">01 / LOVE LETTER — 유머 강하게, 정확성은 희생하지 않기</h3>
        <label className="field wide">
          <span className="field-head">표지 헤드라인 <span><Counter value={coverLen} min={10} max={COVER_LINE_CHARS * SLIDE_MAX_LINES} unit="자" /> <Counter value={coverLines} min={1} max={SLIDE_MAX_LINES} unit="줄" /></span></span>
          <textarea rows={2} value={cv.cover} placeholder="작품 특성에 연결된 짧은 한 줄 (한 줄 10자)" onChange={(e) => setSlide('cover')(e.target.value)} />
        </label>

        <h3 className="editor-sec">02 / THE WORK — 사실 중심, 비전문가도 이해하게</h3>
        <SlideField label="작품 소개" hint="이게 무엇인가? 작가·연도·맥락은 캡션과 조사 노트로" value={cv.work} onChange={setSlide('work')} />

        <h3 className="editor-sec">03 / HOW IT WORKS — 입력과 출력의 인과관계</h3>
        <div className="two">
          <label className="field"><span>INPUT</span><input value={draft.input} onChange={(e) => set({ input: e.target.value })} /></label>
          <label className="field"><span>OUTPUT</span><input value={draft.output} onChange={(e) => set({ output: e.target.value })} /></label>
        </div>
        <label className="field wide">
          <span>MECHANISM — 사용 기술 근거가 '미확인'이면 '미확인'으로 두세요 (현재: {draft.evidence.technology.status})</span>
          <input value={draft.mechanism} onChange={(e) => set({ mechanism: e.target.value })} />
        </label>

        <h3 className="editor-sec">04 / WHY IT WORKS — 경험을 설계하는 방식, 05에 쓸 원리 하나</h3>
        <label className="field wide">
          <span>광고/경험 인사이트 (DB용 한 줄, 에디터 해석)</span>
          <input value={draft.ad_insight} onChange={(e) => set({ ad_insight: e.target.value })} />
        </label>
        <SlideField label="원고" hint="막히는 지점 → 작품이 바꾼 한 가지 → 달라지는 경험 (효과는 '~수 있습니다'로)" value={cv.why} onChange={setSlide('why')} />

        <h3 className="editor-sec">05 / WHAT IF? — 원리를 추출해 다른 목적에 적용 (가상 제안)</h3>
        <div className="two">
          <label className="field">
            <span>맥락</span>
            <select value={draft.what_if.context ?? ''} onChange={(e) => setWhatIf({ context: (e.target.value || null) as Case['what_if']['context'] })}>
              <option value="">선택</option>
              {WHAT_IF_CONTEXTS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className="field"><span>대상 관객</span><input value={draft.what_if.audience} onChange={(e) => setWhatIf({ audience: e.target.value })} /></label>
          <label className="field"><span>관객의 행동</span><input value={draft.what_if.action} onChange={(e) => setWhatIf({ action: e.target.value })} /></label>
          <label className="field"><span>반응</span><input value={draft.what_if.response} onChange={(e) => setWhatIf({ response: e.target.value })} /></label>
          <label className="field wide"><span>전달하고 싶은 경험/메시지</span><input value={draft.what_if.message} onChange={(e) => setWhatIf({ message: e.target.value })} /></label>
        </div>
        <SlideField label="원고" hint="구체적인 적용 아이디어 1개" value={cv.what_if} onChange={setSlide('what_if')} />

        <h3 className="editor-sec">06 / P.S. I STILL LOVE YOU — 내용과 연결된 1~3문장</h3>
        <SlideField label="마무리" hint="작품에서 발견한 매력 / 디자인 인사이트" value={cv.ps} onChange={setSlide('ps')} rows={2} />

        <h3 className="editor-sec">A. 인스타그램 캡션</h3>
        <label className="field wide">
          <span className="field-head">캡션 <Counter value={sentenceCount(draft.caption.text)} min={3} max={6} unit="문장" /></span>
          <textarea rows={5} value={draft.caption.text} placeholder="후킹 한 줄 + 사례 핵심 + 광고/경험 관점 + 크레딧" onChange={(e) => set({ caption: { ...draft.caption, text: e.target.value } })} />
        </label>
        <div className="two">
          <ListField label="해시태그" initial={draft.caption.hashtags} onChange={(hashtags) => set({ caption: { ...draft.caption, hashtags } })} />
          <ListField label="아카이브 DB 태그" initial={draft.keywords} onChange={(keywords) => set({ keywords })} />
        </div>

        <h3 className="editor-sec">완료 전 자체 점검</h3>
        <SelfCheckList c={draft} all={all} onToggle={(k, v) => set({ checklist: { ...draft.checklist, [k]: v } })} />
      </div>
      <aside className="editor-preview" aria-label="캐러셀 미리보기">
        <Carousel c={draft} />
      </aside>
    </div>
  )
}
