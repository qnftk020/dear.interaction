'use strict'
/* dear.interaction 대시보드 — 읽기 전용 스냅샷. data.enc.json을 PIN으로 풀어서 그린다. */

const KINDS = {
  T1: { name: '핵심 탠저블', desc: '손으로 만지는 사물에서 바로 반응이 나옵니다.', cls: 'k1' },
  T2: { name: '탠저블 컨트롤러', desc: '사물은 조작기·열쇠이고, 반응은 화면이나 공간에서 나옵니다.', cls: 'k2' },
  E: { name: '몸으로 하는 인터랙션', desc: '사물 없이 몸짓·밟기·껴안기로 반응을 일으킵니다 (확장 사례).', cls: '' },
  A: { name: '아날로그 참여형', desc: '전자 장치 없이 사물 자체가 메시지입니다.', cls: '' },
  X: { name: '제외 후보', desc: '관객의 입력이나 시스템 반응이 없습니다.', cls: '' },
  보류: { name: '보류', desc: '관객이 무엇을 하는지 불분명하거나 화면 위주입니다.', cls: '' },
  '?': { name: '확인 필요', desc: '전자 장치가 들어 있는지 아직 모릅니다.', cls: '' },
}
const KIND_ORDER = ['T1', 'T2', 'E', 'A', 'X', '보류', '?']
const GROUPS = [
  { key: 'decide', title: '결정해 주세요', desc: '답을 채팅으로 알려 주시면 그대로 반영합니다.' },
  { key: 'pdf', title: 'PDF를 받아 주세요', desc: 'ACM은 자동 접속을 막아서 브라우저로만 받을 수 있습니다. 받은 파일을 주시면 그림 캡처와 원문 분석을 돌립니다.' },
  { key: 'find', title: '찾아 주세요', desc: '자동으로는 확인이 안 된 사실들입니다.' },
  { key: 'save', title: '링크를 보존해 주세요', desc: '기사가 사라지면 근거도 사라집니다. 버튼 한 번이면 archive.org에 저장됩니다.' },
  { key: 'open', title: '한 번 열어 봐 주세요', desc: '자동 접속만 막혔고 보존본은 있습니다. 급하지 않습니다.' },
]
const SLIDES = [['cover', '01 표지'], ['work', '02 THE WORK'], ['why', '04 WHY IT WORKS'], ['what_if', '05 WHAT IF'], ['ps', '06 P.S.']]
const KEY_STORE = 'di-dash-key', DONE_STORE = 'di-dash-done'

let DATA = null
const TABS = ['todo', 'cases', 'research', 'status']
const REGIONS = [['all', '국내외 전체'], ['domestic', '국내'], ['overseas', '해외']]
const ui = { tab: 'todo', onlyFirst: false, hideDone: false, q: '', filter: 'all', kind: '', region: 'all' }
let done = new Set()

const $ = (s) => document.querySelector(s)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const okUrl = (u) => /^https?:\/\//i.test(u || '')
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u || '' } }
const ext = (u, label, cls = 'line') => okUrl(u) ? `<a class="btn ${cls}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : ''
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const ls = (store) => ({
  get(k) { try { return store.getItem(k) } catch { return null } },
  set(k, v) { try { store.setItem(k, v) } catch { /* 비공개 창 */ } },
  del(k) { try { store.removeItem(k) } catch { /* noop */ } },
})
const session = ls(window.sessionStorage), local = ls(window.localStorage)

/* ── 복호화 ── */
let ENC = null
const loadEnc = async () => (ENC ??= await (await fetch('data.enc.json', { cache: 'no-store' })).json())
async function decryptWith(key) {
  const e = await loadEnc()
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(e.iv) }, key, b64(e.data))))
}
async function unlock(pin) {
  const e = await loadEnc()
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(e.salt), iterations: e.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['decrypt'])
  const data = await decryptWith(key)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  session.set(KEY_STORE, btoa(String.fromCharCode(...raw)) + '.' + e.salt)
  return data
}
async function tryStoredKey() {
  const v = session.get(KEY_STORE)
  if (!v) return null
  const [k, salt] = v.split('.')
  try {
    if (salt !== (await loadEnc()).salt) throw new Error('stale')
    return await decryptWith(await crypto.subtle.importKey('raw', b64(k), { name: 'AES-GCM' }, false, ['decrypt']))
  } catch { session.del(KEY_STORE); return null }
}

/* ── 데이터 도우미 ── */
const caseById = (id) => DATA.cases.find((c) => c.id === id)
const errorsOf = (c) => c.issues.filter((i) => i.level === 'error')
const isDone = (t) => Boolean(t.done) || done.has(t.id)
const tasksOf = (c) => DATA.tasks.filter((t) => t.cases?.includes(c.id) && !isDone(t))
const todoCount = (c) => tasksOf(c).length + errorsOf(c).length
const colLabel = (c) => DATA.collections.find((k) => k.key === c.collection)?.label ?? ''
const stageIdx = (c) => DATA.stages.indexOf(c.stage)
const steps = (c) => `<span class="steps" aria-label="${stageIdx(c) + 1}/6 ${esc(c.stage)}">${DATA.stages.map((_, i) => `<span class="${i <= stageIdx(c) ? 'on' : ''}"></span>`).join('')}</span>`
const kindTag = (c) => { const k = KINDS[c.cls.grade] ?? KINDS['?']; return `<span class="kind ${k.cls}">${esc(k.name)}${c.cls.verified ? ' ✓' : ''}</span>` }
function flag(c) {
  const e = errorsOf(c).length, n = todoCount(c)
  if (e) return `<span class="flag err"><i aria-hidden="true">✕</i>오류 ${e}</span>`
  if (n) return `<span class="flag todo"><i aria-hidden="true">!</i>할 일 ${n}</span>`
  return `<span class="flag ok"><i aria-hidden="true">✓</i>남은 일 없음</span>`
}

/* ── 화면: 내 할 일 ── */
function renderTodo() {
  const all = DATA.tasks
  const finished = all.filter(isDone).length
  const visible = all.filter((t) => (!ui.onlyFirst || t.pri === 1) && (!ui.hideDone || !isDone(t)))
  const taskHtml = (t) => {
    const fin = isDone(t)
    const cases = (t.cases ?? []).map((id) => caseById(id)).filter(Boolean)
    return `<article class="task${fin ? ' done' : ''}">
      <button type="button" class="tick" ${t.done ? 'disabled' : `data-tick="${esc(t.id)}"`} aria-pressed="${fin}" aria-label="${esc(t.title)} 완료 표시">✓</button>
      <div class="task-body">
        <p class="task-title">${t.pri === 1 ? '<span class="first">먼저</span>' : ''}${esc(t.title)}</p>
        ${t.done ? `<p class="task-result">✓ ${esc(t.done)}</p>` : `<p class="task-how">${esc(t.how)}</p>`}
        ${t.options ? `<p class="options">선택지 ${t.options.map((o) => `<span>${esc(o)}</span>`).join('')}</p>` : ''}
        ${(t.links?.length || cases.length) ? `<div class="task-row">${(t.links ?? []).map((l, i) => ext(l.url, l.label, i === 0 ? 'primary' : 'line')).join('')}${cases.map((c) => `<button type="button" class="case-link" data-open="${esc(c.id)}">${esc(c.title)}</button>`).join('')}</div>` : ''}
      </div></article>`
  }
  $('#view-todo').innerHTML = `
    <div class="page-head">
      <h1>직접 해 주셔야 할 일</h1>
      <p>자동으로는 끝까지 못 간 것들만 모았습니다. 끝난 일은 왼쪽 네모를 눌러 표시하세요 (이 브라우저에만 저장됩니다).</p>
      <div class="progress"><span class="progress-track"><span style="width:${(finished / Math.max(1, all.length)) * 100}%"></span></span><span><b>${finished}</b> / ${all.length} 완료</span></div>
    </div>
    <div class="chips">
      <button type="button" class="chip" data-toggle="onlyFirst" aria-pressed="${ui.onlyFirst}">‘먼저’만 보기</button>
      <button type="button" class="chip" data-toggle="hideDone" aria-pressed="${ui.hideDone}">완료한 일 숨기기</button>
    </div>
    ${GROUPS.map((g) => {
      const items = visible.filter((t) => t.group === g.key)
      if (!items.length) return ''
      return `<section class="group"><div class="group-head"><h2>${esc(g.title)}</h2><span class="n">${items.length}</span><p>${esc(g.desc)}</p></div>${items.map(taskHtml).join('')}</section>`
    }).join('') || '<p class="empty">보이는 할 일이 없습니다.</p>'}`
}

/* ── 화면: 사례 ── */
function casesFiltered() {
  const q = ui.q.trim().toLowerCase()
  return DATA.cases.filter((c) =>
    (ui.filter === 'all' || (ui.filter === 'todo' ? todoCount(c) > 0 : c.collection === ui.filter)) &&
    (!ui.kind || c.cls.grade === ui.kind) &&
    (!q || `${c.id} ${c.title} ${c.creator} ${c.input} ${c.output} ${c.stage}`.toLowerCase().includes(q)))
}
function renderCases(keepFocus = false) {
  const list = casesFiltered()
  const filters = [['all', `전체 ${DATA.cases.length}`], ['todo', `할 일 있는 사례 ${DATA.cases.filter((c) => todoCount(c) > 0).length}`],
    ...DATA.collections.map((k) => [k.key, `${k.label} ${DATA.cases.filter((c) => c.collection === k.key).length}`])]
  const cards = list.map((c) => `<button type="button" class="card" data-open="${esc(c.id)}">
      <span class="card-top"><span>${esc(colLabel(c))} · ${esc(c.stage)}</span>${steps(c)}</span>
      <h3>${esc(c.title)}</h3>
      <span class="io-line">${esc(c.input)} → ${esc(c.output)}</span>
      <span class="card-foot">${kindTag(c)}${flag(c)}</span></button>`).join('')
  if (keepFocus) { $('#cards').innerHTML = cards || '<p class="empty">조건에 맞는 사례가 없습니다.</p>'; $('#case-count').textContent = `${list.length}건`; return }
  $('#view-cases').innerHTML = `
    <div class="page-head"><h1>사례 <span class="note" id="case-count">${list.length}건</span></h1><p>카드를 누르면 작품 설명, 작동 방식, 근거, 남은 일이 한 화면에 나옵니다.</p></div>
    <div class="toolbar">
      <input class="search" id="q" type="search" placeholder="작품 이름, 작가, 동작(예: 돌린다)으로 찾기" value="${esc(ui.q)}" aria-label="검색" />
      <div class="chips">${filters.map(([k, l]) => `<button type="button" class="chip" data-filter="${esc(k)}" aria-pressed="${ui.filter === k}">${esc(l)}</button>`).join('')}</div>
      <div class="chips">${['', ...KIND_ORDER].map((k) => `<button type="button" class="chip" data-kind="${esc(k)}" aria-pressed="${ui.kind === k}">${k ? esc(KINDS[k].name) : '모든 분류'}</button>`).join('')}</div>
    </div>
    <div class="cards" id="cards">${cards || '<p class="empty">조건에 맞는 사례가 없습니다.</p>'}</div>`
}

/* ── 화면: 진행 현황 ── */
function renderStatus() {
  const cs = DATA.cases
  const counted = cs.filter((c) => c.counted).length
  const published = cs.filter((c) => c.stage === '게시됨').length
  const stageCounts = DATA.stages.map((s) => cs.filter((c) => c.stage === s).length)
  const kindCounts = KIND_ORDER.map((k) => cs.filter((c) => c.cls.grade === k).length)
  const maxK = Math.max(1, ...kindCounts)
  const papers = cs.filter((c) => c.find.status !== 'n/a')
  const got = papers.filter((c) => ['same', 'related'].includes(c.find.status)).length
  $('#view-status').innerHTML = `
    <div class="page-head"><h1>진행 현황</h1><p>숫자를 누르면 해당 사례 목록으로 갑니다.</p></div>
    <div class="big3">
      <div class="big"><p>모은 사례</p><b>${cs.length}</b><span>${DATA.collections.map((k) => `${k.label} ${cs.filter((c) => c.collection === k.key).length}`).join(' · ')}</span></div>
      <div class="big"><p>검증을 통과한 사례</p><b>${counted}</b><span>작품 정체·입력·출력을 ‘확인’으로 표시한 것 (자기 신고 기준)</span></div>
      <div class="big"><p>게시한 러브레터</p><b>${published}<small>/ ${DATA.goal.toLocaleString()}</small></b><span>논문 원문 확보 ${got} / ${papers.length}</span></div>
    </div>
    <section><h2 class="section-title">어느 단계에 몇 건 있나요</h2>
      <div class="stepper">${DATA.stages.map((s, i) => `<button type="button" class="stage${stageCounts[i] ? '' : ' zero'}" data-goto-stage="${esc(s)}"><small>${i + 1}단계</small><b>${stageCounts[i]}</b><span>${esc(s)}</span></button>`).join('')}</div>
    </section>
    <section><h2 class="section-title">어떤 종류의 인터랙션인가요 <small>분류 초안 · ✓ ${cs.filter((c) => c.cls.verified).length}건은 원문과 대조</small></h2>
      <div class="hbars">${KIND_ORDER.map((k, i) => `<button type="button" class="hbar" data-goto-kind="${esc(k)}" title="${esc(KINDS[k].desc)}"><span class="hbar-name">${esc(KINDS[k].name)}</span><span class="hbar-track"><span style="width:${(kindCounts[i] / maxK) * 100}%"></span></span><b>${kindCounts[i]}</b></button>`).join('')}</div>
    </section>`
}

/* ── 화면: 2026 리서치 (인사이트 → 아이디어 → 기술) ── */
const inRegion = (c) => ui.region === 'all' || c.region === ui.region
const caseChips = (ids) => ids.map((id) => caseById(id)).filter(Boolean).map((c) => `<button type="button" class="chip" data-open="${esc(c.id)}">${esc(c.title)}</button>`).join('')
const ideaLine = (i) => [i.audience, i.action, i.response].filter(Boolean).join(' → ')
function renderResearch() {
  const r = DATA.research
  if (!r) { $('#view-research').innerHTML = '<p class="empty">리서치 요약이 아직 없습니다.</p>'; return }
  const pool = DATA.cases.filter((c) => c.region && inRegion(c))
  const ids = new Set(pool.map((c) => c.id))
  const touches = (x) => ui.region === 'all' || x.cases.some((id) => ids.has(id))
  const count = (k) => DATA.cases.filter((c) => c.region && (k === 'all' || c.region === k)).length
  const insights = r.insights.filter(touches).map((x, n) => `<article class="r-card">
      <p class="r-no">인사이트 ${String(n + 1).padStart(2, '0')}</p><h3>${esc(x.title)}</h3><p>${esc(x.body)}</p>
      ${x.cases.length ? `<div class="chips">${caseChips(x.cases)}</div>` : ''}
      <p class="r-src">${x.sources.map((s) => okUrl(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>` : '').join(' · ')}</p></article>`).join('')
  const ideas = pool.filter((c) => c.idea?.action).map((c) => `<button type="button" class="r-card" data-open="${esc(c.id)}">
      <p class="r-no">${esc(c.idea.context ?? '기타')} · 가상 제안</p><h3>${esc(c.idea.message)}</h3><p>${esc(ideaLine(c.idea))}</p>
      <p class="r-src">원리를 가져온 곳: ${esc(c.title)}</p></button>`).join('')
  const tech = r.tech.filter(touches).map((x) => `<article class="r-card">
      <p class="r-no">기술 · ${esc(x.status)}</p><h3>${esc(x.name)}</h3><p>${esc(x.what)}</p><div class="chips">${caseChips(x.cases)}</div></article>`).join('')
  const none = '<p class="empty">이 범위에는 아직 없습니다.</p>'
  $('#view-research').innerHTML = `
    <div class="page-head"><h1>${esc(r.title)}</h1><p>${esc(r.note)} 출처 확인일 ${esc(r.checkedAt)}.</p></div>
    <div class="chips">${REGIONS.map(([k, l]) => `<button type="button" class="chip" data-region="${k}" aria-pressed="${ui.region === k}">${l} ${count(k)}</button>`).join('')}</div>
    <section><h2 class="section-title">1. 인사이트 <small>무엇이 사람을 움직였나 · 에디터 해석</small></h2><div class="r-grid">${insights || none}</div></section>
    <section><h2 class="section-title">2. 아이디어 <small>이 원리를 브랜드·전시에 옮긴다면 · 실제 프로젝트 아님</small></h2><div class="r-grid">${ideas || none}</div></section>
    <section><h2 class="section-title">3. 기술 <small>무엇으로 만들었나 · 공개 자료에서 확인된 것만</small></h2><div class="r-grid">${tech || none}</div></section>`
}

/* ── 상세 ── */
function openCase(id, push = true) {
  const c = caseById(id)
  if (!c) return
  const k = KINDS[c.cls.grade] ?? KINDS['?']
  const tasks = tasksOf(c), errs = errorsOf(c)
  const acc = c.access
  const srcState = !acc ? null : acc.http === 200 && acc.note === 'ok' ? ['ok', '✓', '자동 접속으로 열림'] : ['no', '✕', '자동 접속이 막힘 — 브라우저로 확인 필요']
  const evMark = (s) => s === '확인' ? ['ok', '✓'] : s === '부분 확인' ? ['part', '!'] : ['na', '?']
  const findLine = {
    same: ['ok', '✓', '논문 원문을 확보했습니다'], related: ['part', '!', '같은 작품을 다룬 다른 논문만 확보했습니다'],
    human: ['no', '✕', 'ACM에만 있어 브라우저로 받아야 합니다'],
  }[c.find.status]
  const figs = c.verify?.figures?.filter((f) => f.src) ?? []
  const body = `
    <div class="p-title"><p class="meta">${esc(c.id)} · ${esc(colLabel(c))}${c.letter ? ` · LOVE LETTER ${String(c.letter).padStart(3, '0')}` : ''}</p>
      <h2 id="p-title">${esc(c.title)}</h2><p class="sub">${esc(c.creator)} · ${esc(c.year)}</p>
      <p class="meta">${steps(c)} ${stageIdx(c) + 1}/6 ${esc(c.stage)}</p></div>
    ${tasks.length || errs.length ? `<div class="box attn"><h3>이 사례에 남은 일</h3><ul class="checklist">
      ${errs.map((e) => `<li><span class="mark no">✕</span><span>${esc(e.message)}</span></li>`).join('')}
      ${tasks.map((t) => `<li><span class="mark part">!</span><span>${esc(t.title)}<small>${esc(t.how)}</small>${(t.links ?? []).map((l) => ' ' + ext(l.url, l.label)).join('')}</span></li>`).join('')}</ul></div>` : ''}
    <div class="box"><h3>어떤 작품인가요</h3><p>${esc(c.summary)}</p></div>
    ${c.insight ? `<div class="box"><h3>인사이트 → 아이디어 → 기술</h3><dl class="facts">
      <dt>인사이트</dt><dd>${esc(c.insight)}</dd>
      <dt>아이디어</dt><dd>${c.idea?.action ? `${esc(ideaLine(c.idea))}<br /><span class="note">${esc(c.idea.context ?? '')} · ${esc(c.idea.message)}</span>` : '<span class="note">출처 확인 뒤에 씁니다.</span>'}</dd>
      <dt>기술</dt><dd>${esc(c.mechanism)}</dd></dl></div>` : ''}
    <div class="box"><h3>어떻게 작동하나요</h3>
      <div class="io"><div><small>사람이 하는 일</small>${esc(c.input)}</div><span class="arr" aria-hidden="true">→</span><div><small>돌아오는 반응</small>${esc(c.output)}</div></div>
      <dl class="facts"><dt>만지는 것</dt><dd>${esc(c.object)}</dd><dt>작동 원리</dt><dd>${esc(c.mechanism)}</dd></dl>
      ${c.quotes.length ? `<details class="more"><summary>원문에서 확인한 문장 ${c.quotes.length}개</summary>${c.quotes.map((q) => `<p class="quote">${esc(q.quote)}<small>원문 p.${esc(q.page)}</small></p>`).join('')}</details>` : ''}
    </div>
    <div class="box"><h3>분류</h3><p><span class="kind ${k.cls}">${esc(k.name)}${c.cls.verified ? ' ✓' : ''}</span></p><p>${esc(k.desc)}</p><p class="note">근거: ${esc(c.cls.basis)}${c.cls.verified ? ' (원문과 대조함)' : ' (초안 — 원문 대조 전)'}</p></div>
    <div class="box"><h3>근거 자료</h3><ul class="checklist">
      <li><span class="mark ${srcState ? srcState[0] : 'na'}">${srcState ? srcState[1] : '–'}</span><span>공식 출처 ${okUrl(c.source) ? `<a href="${esc(c.source)}" target="_blank" rel="noopener noreferrer">${esc(host(c.source))}</a>` : esc(c.source)}<small>${srcState ? esc(srcState[2]) : ''}${acc ? ` · 보존본 ${acc.wayback && acc.wayback !== '-' ? '있음' : '없음'}` : ''}</small></span></li>
      ${findLine ? `<li><span class="mark ${findLine[0]}">${findLine[1]}</span><span>${esc(findLine[2])}${okUrl(c.find.url) ? `<small><a href="${esc(c.find.url)}" target="_blank" rel="noopener noreferrer">${esc(host(c.find.url))}</a>${c.find.pages ? ` · ${c.find.pages}쪽` : ''}</small>` : ''}</span></li>` : ''}
      ${c.ars ? `<li><span class="mark ok">✓</span><span>Ars Electronica 공식 기록<small>${esc(c.ars.note)} · <a href="${esc(c.ars.url)}" target="_blank" rel="noopener noreferrer">열기</a></small></span></li>` : ''}
      ${c.evidence.map((e) => { const [m, i] = evMark(e.status); return `<li><span class="mark ${m}">${i}</span><span>${esc(e.label)} — ${esc(e.status)}${okUrl(e.url) ? `<small><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(host(e.url))}</a></small>` : ''}</span></li>` }).join('')}
    </ul></div>
    ${figs.length ? `<div class="box"><h3>논문 그림 ${figs.length}장</h3><div class="figs">${figs.map((f) => `<figure><img src="${f.src}" alt="${esc(f.caption || 'Figure')}" loading="lazy" /><figcaption>${f.no ? `Fig ${esc(f.no)} · ` : ''}${esc((f.caption || '').replace(/^Figure\s*\d+[:.]\s*/i, '').slice(0, 70))}</figcaption></figure>`).join('')}</div><p class="note">확인용입니다. 재게시 권리는 따로 확인해야 합니다.</p></div>` : ''}
    ${SLIDES.some(([s]) => c.carousel[s]) ? `<div class="box"><h3>캐러셀 원고</h3>${SLIDES.filter(([s]) => c.carousel[s]).map(([s, l]) => `<p class="slide"><small>${l}</small>${esc(c.carousel[s])}</p>`).join('')}${c.caption ? `<p class="slide"><small>캡션</small>${esc(c.caption)}</p>` : ''}</div>` : ''}
    <div class="box"><details class="more"><summary>자세한 검증 기록 보기</summary>
      ${c.verify ? `<p style="margin-bottom:8px"><b>${esc(c.verify.headline)}</b></p><ul class="checklist">${c.verify.checks.map((x) => { const m = { pass: ['ok', '✓'], warn: ['part', '!'], fail: ['no', '✕'] }[x.state] ?? ['na', '–']; return `<li><span class="mark ${m[0]}">${m[1]}</span><span>${esc(x.label)}<small>${esc(x.detail)}</small></span></li>` }).join('')}</ul>` : '<p class="note">자동 출판 검증을 돌린 적이 없습니다 (논문이 아닌 사례).</p>'}
      ${c.issues.length ? `<p class="note" style="margin-top:12px">검증 규칙 알림</p><ul class="checklist">${c.issues.map((i) => `<li><span class="mark ${i.level === 'error' ? 'no' : i.level === 'warn' ? 'part' : 'na'}">${i.level === 'error' ? '✕' : i.level === 'warn' ? '!' : 'i'}</span><span>${esc(i.message)}</span></li>`).join('')}</ul>` : ''}
    </details></div>`
  $('#p-body').innerHTML = body
  $('#p-body').scrollTop = 0
  $('#panel').hidden = false; $('#scrim').hidden = false
  document.body.style.overflow = 'hidden'
  if (push) history.replaceState(null, '', `#case/${encodeURIComponent(id)}`)
  $('#p-close').focus()
}
function closeCase() {
  $('#panel').hidden = true; $('#scrim').hidden = true
  document.body.style.overflow = ''
  history.replaceState(null, '', `#${ui.tab}`)
}

/* ── 탭 ── */
function setTab(tab) {
  ui.tab = tab
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab))
  for (const t of TABS) $(`#view-${t}`).hidden = t !== tab
  if (tab === 'todo') renderTodo()
  if (tab === 'cases') renderCases()
  if (tab === 'research') renderResearch()
  if (tab === 'status') renderStatus()
  if ($('#panel').hidden) history.replaceState(null, '', `#${tab}`)
  window.scrollTo(0, 0)
}
function refreshCounts() {
  $('#tab-todo-n').textContent = DATA.tasks.filter((t) => !isDone(t)).length
  $('#tab-cases-n').textContent = DATA.cases.length
}

function start(data) {
  DATA = data
  try { done = new Set(JSON.parse(local.get(DONE_STORE) || '[]')) } catch { done = new Set() }
  $('#lock').hidden = true; $('#app').hidden = false
  const when = new Date(DATA.generatedAt).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Seoul' })
  $('#foot').textContent = `읽기 전용 스냅샷 · ${when} 기준${DATA.commit ? ` · 커밋 ${DATA.commit}` : ''}. 수정은 로컬 워크벤치에서 합니다.`
  refreshCounts()
  const m = /^#(todo|cases|research|status)?(?:case\/(.+))?$/.exec(location.hash)
  setTab(m?.[1] || (m?.[2] ? 'cases' : 'todo'))
  if (m?.[2]) openCase(decodeURIComponent(m[2]), false)
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-open],[data-region],[data-tick],[data-toggle],[data-filter],[data-kind],[data-goto-stage],[data-goto-kind]')
  if (!t) return
  const d = t.dataset
  if (d.tab) return setTab(d.tab)
  if (d.open) return openCase(d.open)
  if (d.region) { ui.region = d.region; return renderResearch() }
  if (d.tick) {
    done.has(d.tick) ? done.delete(d.tick) : done.add(d.tick)
    local.set(DONE_STORE, JSON.stringify([...done]))
    refreshCounts(); renderTodo(); return
  }
  if (d.toggle) { ui[d.toggle] = !ui[d.toggle]; return renderTodo() }
  if (d.filter) { ui.filter = d.filter; return renderCases() }
  if (d.kind !== undefined) { ui.kind = d.kind; return renderCases() }
  if (d.gotoStage) { ui.filter = 'all'; ui.kind = ''; ui.q = d.gotoStage; return setTab('cases') }
  if (d.gotoKind) { ui.filter = 'all'; ui.q = ''; ui.kind = d.gotoKind; return setTab('cases') }
})
document.addEventListener('input', (e) => { if (e.target.id === 'q') { ui.q = e.target.value; renderCases(true) } })
$('#p-close').addEventListener('click', closeCase)
$('#scrim').addEventListener('click', closeCase)
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#panel').hidden) closeCase() })
$('#lock-btn').addEventListener('click', () => { session.del(KEY_STORE); location.hash = ''; location.reload() })
$('#lock-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const pin = $('#pin').value.trim(), msg = $('#lock-msg')
  if (!/^\d{8}$/.test(pin)) { msg.className = 'lock-msg err'; msg.textContent = '숫자 8자리를 넣어 주세요.'; return }
  $('#unlock').disabled = true; msg.className = 'lock-msg'; msg.textContent = '여는 중…'
  try { start(await unlock(pin)) } catch { msg.className = 'lock-msg err'; msg.textContent = 'PIN이 맞지 않습니다.'; $('#pin').select() } finally { $('#unlock').disabled = false }
})
tryStoredKey().then((d) => { if (d) start(d) })
