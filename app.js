'use strict'
/* dear.interaction 대시보드 — 읽기 전용. data.enc.json을 PIN으로 복호화해 그린다. */

const GRADES = [
  { k: 'T1', name: '핵심 탠저블', desc: '만지는 곳과 반응하는 곳이 같음' },
  { k: 'T2', name: '탠저블 컨트롤러', desc: '사물이 조작기·열쇠, 반응은 화면·공간' },
  { k: 'E', name: '신체·환경 확장', desc: '맨몸 동작 — 밟기·껴안기·몸짓' },
  { k: 'A', name: '아날로그 참여형', desc: '디지털 시스템 없음' },
  { k: 'X', name: '제외', desc: '관객 입력이나 반응이 없음' },
  { k: '보류', name: '보류', desc: '인터랙션 불명 · 화면 위주' },
  { k: '?', name: '확인 필요', desc: '디지털 여부를 아직 모름' },
]
const SLIDES = [['cover', '01 표지'], ['work', '02 THE WORK'], ['why', '04 WHY IT WORKS'], ['what_if', '05 WHAT IF'], ['ps', '06 P.S.']]
const KEY_STORE = 'di-dash-key'

let DATA = null
const state = { col: 'all', stage: '', grade: '', q: '', todo: false }

const $ = (s) => document.querySelector(s)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '')
const link = (u, label) => (safeUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label || u)}</a>` : esc(label || u || '—'))
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u || '' } }
const st = (kind, icon, label) => `<span class="st ${kind}"><i aria-hidden="true">${icon}</i>${esc(label)}</span>`
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const store = {
  get() { try { return sessionStorage.getItem(KEY_STORE) } catch { return null } },
  set(v) { try { sessionStorage.setItem(KEY_STORE, v) } catch { /* 비공개 창 등 */ } },
  del() { try { sessionStorage.removeItem(KEY_STORE) } catch { /* noop */ } },
}

/* ── 복호화 ─────────────────────────────────────────── */
let ENC = null
async function loadEnc() {
  if (!ENC) ENC = await (await fetch('data.enc.json', { cache: 'no-store' })).json()
  return ENC
}
async function decryptWith(key) {
  const enc = await loadEnc()
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.data))
  return JSON.parse(new TextDecoder().decode(plain))
}
async function keyFromPin(pin) {
  const enc = await loadEnc()
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(enc.salt), iterations: enc.iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['decrypt'])
}
async function unlock(pin) {
  const key = await keyFromPin(pin)
  const data = await decryptWith(key)
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key))
  store.set(btoa(String.fromCharCode(...raw)) + '.' + (await loadEnc()).salt)
  return data
}
async function tryStoredKey() {
  const v = store.get()
  if (!v) return null
  const [k, salt] = v.split('.')
  try {
    if (salt !== (await loadEnc()).salt) throw new Error('stale')
    const key = await crypto.subtle.importKey('raw', b64(k), { name: 'AES-GCM' }, false, ['decrypt'])
    return await decryptWith(key)
  } catch { store.del(); return null }
}

/* ── 사례 상태 판정 ───────────────────────────────────── */
const errors = (c) => c.issues.filter((i) => i.level === 'error')
const warns = (c) => c.issues.filter((i) => i.level === 'warn')
const accessBlocked = (c) => c.access && !(c.access.http === 200 && c.access.note === 'ok')
const noSnapshot = (c) => c.access && c.access.wayback === '-'
const TODO = [
  { key: 'err', icon: '✕', kind: 'critical', title: '오류로 막힌 사례', desc: '검증 규칙의 오류 — 고치기 전에는 다음 단계로 못 갑니다.', test: (c) => errors(c).length > 0 },
  { key: 'pdf', icon: '!', kind: 'serious', title: '원문 PDF를 사람이 받아야 함', desc: 'ACM에만 있어 자동으로 못 받습니다. 브라우저로 받아 inbox에 넣으면 캡처·분석이 이어집니다.', test: (c) => c.find.status === 'human' },
  { key: 'blocked', icon: '✕', kind: 'critical', title: '출처 페이지 접근 막힘', desc: '봇 확인·403·시간 초과. 사람 브라우저나 Wayback 사본으로 확인하세요.', test: accessBlocked },
  { key: 'snap', icon: '!', kind: 'warning', title: '링크 보존(Wayback) 없음', desc: '기사가 사라지면 근거도 사라집니다. 스냅샷 저장이 필요합니다.', test: noSnapshot },
  { key: 'cls', icon: '?', kind: 'warning', title: '분류를 정해야 함', desc: '디지털 여부 미확인이거나 인터랙션이 불명확한 사례.', test: (c) => c.cls.grade === '?' || c.cls.grade === '보류' },
]
const hasTodo = (c) => TODO.some((t) => t.test(c))

function findStatus(c) {
  const f = c.find
  if (f.status === 'same') return st('good', '✓', '원문 확보')
  if (f.status === 'related') return st('warning', '!', '관련 논문')
  if (f.status === 'human') return st('serious', '!', '사람이 받기')
  return st('none', '–', '해당 없음')
}
function srcStatus(c) {
  if (!c.access) return `<span class="note" aria-label="해당 없음">—</span>`
  if (accessBlocked(c)) return st('critical', '✕', '막힘')
  if (noSnapshot(c)) return st('warning', '!', '보존 없음')
  return st('good', '✓', '열림')
}
function issueStatus(c) {
  const e = errors(c).length, w = warns(c).length
  if (e) return st('critical', '✕', `오류 ${e}`)
  if (w) return st('warning', '!', `경고 ${w}`)
  return st('good', '✓', '문제 없음')
}
const gradeChip = (c) => {
  const g = c.cls.grade
  const cls = g === 'T1' ? 't1' : g === 'T2' ? 't2' : ''
  return `<span class="gchip ${cls}" title="${esc(GRADES.find((x) => x.k === g)?.name || g)}">${esc(g)}${c.cls.verified ? '<small aria-label="원문 대조">✓</small>' : ''}</span>`
}

/* ── 그리기 ───────────────────────────────────────────── */
const inCol = () => DATA.cases.filter((c) => state.col === 'all' || c.collection === state.col)
function filtered() {
  const q = state.q.trim().toLowerCase()
  return inCol().filter((c) =>
    (!state.stage || c.stage === state.stage) &&
    (!state.grade || c.cls.grade === state.grade) &&
    (!state.todo || hasTodo(c)) &&
    (!q || `${c.id} ${c.title} ${c.creator}`.toLowerCase().includes(q)))
}

function renderCollections() {
  const counts = Object.fromEntries(DATA.collections.map((k) => [k.key, DATA.cases.filter((c) => c.collection === k.key).length]))
  const opts = [{ key: 'all', label: `전체 ${DATA.cases.length}` }, ...DATA.collections.map((k) => ({ key: k.key, label: `${k.label} ${counts[k.key]}` }))]
  $('#collections').innerHTML = opts.map((o) => `<button type="button" role="tab" aria-selected="${state.col === o.key}" data-col="${o.key}">${esc(o.label)}</button>`).join('')
}

function renderTiles() {
  const cs = inCol()
  const counted = cs.filter((c) => c.counted).length
  const published = cs.filter((c) => c.stage === '게시됨').length
  const todo = cs.filter(hasTodo).length
  const papers = cs.filter((c) => c.find.status !== 'n/a')
  const got = papers.filter((c) => c.find.status === 'same' || c.find.status === 'related').length
  $('#tiles').innerHTML = [
    `<div class="tile"><span class="tile-label">전체 사례</span><span class="tile-num">${cs.length}</span><span class="tile-sub">${DATA.collections.map((k) => `${k.label} ${cs.filter((c) => c.collection === k.key).length}`).join(' · ')}</span></div>`,
    `<div class="tile"><span class="tile-label">게시한 러브레터</span><span class="tile-num">${published}<small>/ ${DATA.goal.toLocaleString()}</small></span><div class="track" aria-hidden="true"><span style="width:${Math.max(0.2, (published / DATA.goal) * 100)}%"></span></div><span class="tile-sub">아카이브 산입(검증) ${counted}건</span></div>`,
    `<div class="tile"><span class="tile-label">논문 원문 확보</span><span class="tile-num">${got}<small>/ ${papers.length}</small></span><span class="tile-sub">나머지는 ACM 전용 — 사람이 받기</span></div>`,
    `<div class="tile alert"><span class="tile-label">할 일이 남은 사례</span><span class="tile-num">${todo}</span><span class="tile-sub">오른쪽 ‘지금 할 일’에서 확인</span></div>`,
  ].join('')
}

function renderFlow() {
  const cs = inCol()
  const counts = DATA.stages.map((s) => cs.filter((c) => c.stage === s).length)
  const max = Math.max(1, ...counts)
  $('#flow').innerHTML = DATA.stages.map((s, i) =>
    `<button type="button" class="bar-row${state.stage === s ? ' on' : ''}" data-stage="${esc(s)}" title="${esc(s)} · ${counts[i]}건">
      <span class="bar-label"><span class="bar-step">${i + 1}</span>${esc(s)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(counts[i] / max) * 100}%"></span></span>
      <span class="bar-val">${counts[i]}</span></button>`).join('')
}

function renderTodo() {
  const cs = inCol()
  $('#todo').innerHTML = TODO.map((t) => {
    const hit = cs.filter(t.test)
    if (!hit.length) return `<div class="todo-group"><span class="done-line">${st('good', '✓', `${t.title} — 없음`)}</span></div>`
    return `<details class="todo-group"${t.key === 'err' || t.key === 'pdf' ? ' open' : ''}>
      <summary>${st(t.kind, t.icon, t.title)}<span class="count">${hit.length}</span></summary>
      <p class="todo-desc">${esc(t.desc)}</p>
      <div class="chips">${hit.map((c) => `<button type="button" class="chip-btn" data-open="${esc(c.id)}">${esc(c.title)}</button>`).join('')}</div>
    </details>`
  }).join('')
}

function renderCls() {
  const cs = inCol()
  const max = Math.max(1, ...GRADES.map((g) => cs.filter((c) => c.cls.grade === g.k).length))
  const verified = cs.filter((c) => c.cls.verified).length
  $('#cls-hint').textContent = `초안 · ✓ 원문과 대조한 사례 ${verified}건 · 누르면 목록이 좁혀집니다`
  $('#cls').innerHTML = GRADES.map((g) => {
    const n = cs.filter((c) => c.cls.grade === g.k).length
    return `<button type="button" class="cls-item${state.grade === g.k ? ' on' : ''}" data-grade="${esc(g.k)}" title="${esc(g.name)} ${n}건">
      <span class="cls-top"><span class="grade">${esc(g.k)}</span><span class="cls-num">${n}</span></span>
      <span class="mini-track" aria-hidden="true"><span style="width:${(n / max) * 100}%"></span></span>
      <span class="cls-name">${esc(g.name)}</span><span class="cls-desc">${esc(g.desc)}</span></button>`
  }).join('')
}

function renderFilters() {
  $('#f-stage').innerHTML = `<option value="">모든 단계</option>` + DATA.stages.map((s) => `<option${state.stage === s ? ' selected' : ''}>${esc(s)}</option>`).join('')
  $('#f-grade').innerHTML = `<option value="">모든 등급</option>` + GRADES.map((g) => `<option value="${esc(g.k)}"${state.grade === g.k ? ' selected' : ''}>${esc(g.k)} · ${esc(g.name)}</option>`).join('')
  $('#f-todo').checked = state.todo
  $('#q').value = state.q
}

function renderList() {
  const rows = filtered()
  $('#list-count').textContent = `${rows.length}건 표시`
  const head = `<div class="row head" role="presentation"><span>ID</span><span>사례</span><span class="c-stage">단계</span><span>등급</span><span class="c-find">논문 원문</span><span class="c-src">출처 링크</span><span class="c-issue">검증 규칙</span></div>`
  $('#list').innerHTML = head + (rows.length ? rows.map((c) =>
    `<button type="button" class="row" role="listitem" data-open="${esc(c.id)}">
      <span class="r-id">${esc(c.id)}</span>
      <span class="r-title"><b>${esc(c.title)}</b><span>${esc(c.creator)}</span></span>
      <span class="c-stage"><span class="pill">${esc(c.stage)}</span></span>
      <span>${gradeChip(c)}</span>
      <span class="c-find">${findStatus(c)}</span>
      <span class="c-src">${srcStatus(c)}</span>
      <span class="c-issue r-issues">${issueStatus(c)}</span>
    </button>`).join('') : `<p class="empty">조건에 맞는 사례가 없습니다.</p>`)
}

function renderAll() {
  renderCollections(); renderTiles(); renderFlow(); renderTodo(); renderCls(); renderFilters(); renderList()
}

/* ── 상세 패널 ───────────────────────────────────────── */
function section(title, body) { return body ? `<section class="sec"><h3>${title}</h3>${body}</section>` : '' }
const CHECK_KIND = { pass: ['good', '✓'], warn: ['warning', '!'], fail: ['critical', '✕'], skip: ['none', '–'] }
const KIND_LABEL = { sensing: '감지', output: '출력', action: '행동', ai: 'AI' }

function openCase(id, push = true) {
  const c = DATA.cases.find((x) => x.id === id)
  if (!c) return
  $('#d-id').textContent = `${c.id} · ${DATA.collections.find((k) => k.key === c.collection)?.label}${c.letter ? ` · LOVE LETTER ${String(c.letter).padStart(3, '0')}` : ''}`
  $('#d-title').textContent = c.title
  $('#d-meta').textContent = [c.creator, c.year, c.status].filter(Boolean).join(' · ')
  const g = GRADES.find((x) => x.k === c.cls.grade)
  const body = [
    `<section class="sec"><p style="margin:0 0 12px">${esc(c.summary)}</p>
      <div class="io"><div><span class="k">INPUT · 사람이 하는 일</span>${esc(c.input)}</div><span class="arrow" aria-hidden="true">→</span><div><span class="k">OUTPUT · 시스템 반응</span>${esc(c.output)}</div></div>
      <dl class="kv" style="margin-top:12px"><dt>조작하는 사물</dt><dd>${esc(c.object)}</dd><dt>작동 원리</dt><dd>${esc(c.mechanism)}</dd><dt>단계</dt><dd>${esc(c.stage)}</dd><dt>맥락</dt><dd>${esc(c.context)} · ${esc(c.location)}</dd></dl></section>`,
    section(`분류 ${gradeChip(c)}`, `<p style="margin:0"><b>${esc(g?.name || c.cls.grade)}</b> — ${esc(g?.desc || '')}</p><p class="note">근거: ${esc(c.cls.basis)}${c.cls.verified ? ' · ✓ 원문과 대조함' : ' · 초안(원문 대조 전)'}</p>`),
    section('논문 원문', c.find.status === 'n/a' ? '' :
      `<p style="margin:0">${findStatus(c)}</p>
       ${c.find.url ? `<p class="note">${c.find.via ? esc(c.find.via) + ' · ' : ''}${link(c.find.url, host(c.find.url))}${c.find.pages ? ` · ${c.find.pages}쪽` : ''}</p>` : ''}
       ${c.find.status === 'related' ? '<p class="note">같은 작품을 다룬 다른 논문입니다. 원래 논문은 따로 확보해야 합니다.</p>' : ''}
       ${c.quotes.length ? `<div style="margin-top:8px">${c.quotes.map((q) => `<p class="quote"><span class="pg">${esc(KIND_LABEL[q.kind] || q.kind)} · p.${esc(q.page)}</span>${esc(q.quote)}</p>`).join('')}</div>` : ''}
       ${c.captured ? `<p class="note">원문에서 Figure ${c.captured}장 캡처함 (비공개 보관 · 이 페이지에는 싣지 않음)</p>` : ''}`),
    c.ars ? section('Ars Electronica 기록', `<p style="margin:0">${esc(c.ars.note)}</p><p class="note">${link(c.ars.url, host(c.ars.url))}</p>`) : '',
    c.verify ? section('자동 출판 검증 (기존 보고서)', `<p style="margin:0 0 10px"><b>${esc(c.verify.headline)}</b>${c.verify.doi ? ` · ${link('https://doi.org/' + c.verify.doi, 'DOI ' + c.verify.doi)}` : ''}${c.verify.license ? ` · ${esc(c.verify.license)}` : ''}</p>
      <ul class="checks">${c.verify.checks.map((k) => { const [kind, icon] = CHECK_KIND[k.state] || CHECK_KIND.skip; return `<li>${st(kind, icon, '')}<span>${esc(k.label)}<small>${esc(k.detail)}</small></span></li>` }).join('')}</ul>`) : '',
    c.verify?.figures?.some((f) => f.src) ? section('논문 그림 (저장소에 있는 것)', `<div class="figs">${c.verify.figures.filter((f) => f.src).map((f) => `<figure><img src="${f.src}" alt="${esc(f.caption || 'Figure')}" loading="lazy" /><figcaption>${f.no ? `Fig ${esc(f.no)} · ` : ''}p.${esc(f.page)} ${esc((f.caption || '').slice(0, 90))}</figcaption></figure>`).join('')}</div><p class="note">권리 확인 전 그림이 섞여 있습니다. 게시용이 아니라 확인용입니다.</p>`) : '',
    section('출처', `<dl class="kv"><dt>공식 출처</dt><dd>${link(c.source, host(c.source))}</dd>
       ${c.access ? `<dt>접근</dt><dd>${srcStatus(c)} <span class="note">HTTP ${esc(c.access.http)}${c.access.note && c.access.note !== 'ok' ? ' · ' + esc(c.access.note) : ''}</span></dd><dt>Wayback</dt><dd>${c.access.wayback && c.access.wayback !== '-' ? `${esc(c.access.wayback.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))} 스냅샷 있음` : '없음'}</dd>` : ''}
       <dt>보존 링크</dt><dd>${c.snapshot ? link(c.snapshot, host(c.snapshot)) : '없음'}</dd></dl>
       <table class="ev" style="margin-top:12px"><thead><tr><th>검증표</th><th>상태</th><th>근거</th></tr></thead><tbody>${c.evidence.map((e) => `<tr><td>${esc(e.label)}</td><td>${e.status === '확인' ? st('good', '✓', '확인') : e.status === '부분 확인' ? st('warning', '!', '부분 확인') : st('none', '?', e.status)}</td><td>${e.url ? link(e.url, host(e.url)) : '—'}</td></tr>`).join('')}</tbody></table>`),
    section(`검증 규칙 ${issueStatus(c)}`, c.issues.length ? `<ul class="issues">${c.issues.map((i) => `<li>${i.level === 'error' ? st('critical', '✕', '') : i.level === 'warn' ? st('warning', '!', '') : st('none', 'i', '')}<span>${esc(i.message)}</span></li>`).join('')}</ul>` : ''),
    SLIDES.some(([k]) => c.carousel[k]) ? section('캐러셀 원고', `<div class="slides">${SLIDES.filter(([k]) => c.carousel[k]).map(([k, label]) => `<div class="slide"><span class="k">${label}</span>${esc(c.carousel[k])}</div>`).join('')}${c.caption ? `<div class="slide"><span class="k">캡션</span>${esc(c.caption)}\n${esc((c.hashtags || []).join(' '))}</div>` : ''}</div>`) : '',
  ].join('')
  $('#d-body').innerHTML = body
  $('#d-body').scrollTop = 0
  $('#drawer').hidden = false; $('#scrim').hidden = false
  document.body.style.overflow = 'hidden'
  if (push) history.replaceState(null, '', `#case/${encodeURIComponent(id)}`)
  $('#d-close').focus()
}
function closeCase() {
  $('#drawer').hidden = true; $('#scrim').hidden = true
  document.body.style.overflow = ''
  history.replaceState(null, '', location.pathname + location.search)
}

/* ── 시작 ─────────────────────────────────────────────── */
function start(data) {
  DATA = data
  $('#lock').hidden = true; $('#app').hidden = false
  const when = new Date(DATA.generatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' })
  $('#meta').textContent = `읽기 전용 · 데이터 기준 ${when} KST${DATA.commit ? ` · 커밋 ${DATA.commit}` : ''}`
  $('#foot').textContent = `${DATA.run.note} 수정은 로컬 워크벤치(npm run dev)에서 합니다.`
  renderAll()
  const m = /^#case\/(.+)$/.exec(location.hash)
  if (m) openCase(decodeURIComponent(m[1]), false)
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open],[data-stage],[data-grade],[data-col]')
  if (!t) return
  if (t.dataset.open) return openCase(t.dataset.open)
  if (t.dataset.stage !== undefined) { state.stage = state.stage === t.dataset.stage ? '' : t.dataset.stage; renderAll(); return }
  if (t.dataset.grade !== undefined) { state.grade = state.grade === t.dataset.grade ? '' : t.dataset.grade; renderAll(); return }
  if (t.dataset.col) { state.col = t.dataset.col; renderAll() }
})
$('#q').addEventListener('input', (e) => { state.q = e.target.value; renderList() })
$('#f-stage').addEventListener('change', (e) => { state.stage = e.target.value; renderAll() })
$('#f-grade').addEventListener('change', (e) => { state.grade = e.target.value; renderAll() })
$('#f-todo').addEventListener('change', (e) => { state.todo = e.target.checked; renderAll() })
$('#f-reset').addEventListener('click', () => { Object.assign(state, { stage: '', grade: '', q: '', todo: false }); renderAll() })
$('#d-close').addEventListener('click', closeCase)
$('#scrim').addEventListener('click', closeCase)
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeCase() })
$('#lock-btn').addEventListener('click', () => { store.del(); location.hash = ''; location.reload() })

$('#lock-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const pin = $('#pin').value.trim()
  const msg = $('#lock-msg')
  if (!/^\d{8}$/.test(pin)) { msg.className = 'lock-msg err'; msg.textContent = '숫자 8자리를 넣어 주세요.'; return }
  $('#unlock').disabled = true; msg.className = 'lock-msg'; msg.textContent = '여는 중…'
  try {
    start(await unlock(pin))
  } catch {
    msg.className = 'lock-msg err'; msg.textContent = 'PIN이 맞지 않습니다.'
    $('#pin').select()
  } finally { $('#unlock').disabled = false }
})

tryStoredKey().then((data) => { if (data) start(data) })
