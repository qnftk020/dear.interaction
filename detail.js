'use strict'
/* 사례 상세(전체 화면) · 카드뉴스 6장 미리보기와 수정 · 표지 피드형 업로드 일정.
   app.js 뒤에 불러오며, app.js의 도우미($, esc, caseById …)와 DATA를 그대로 쓴다. */

const EDIT_STORE = 'di-dash-edits'
const SLIDE_MAX_LINES = 2
const LINE_CHARS = { cover: 10, work: 16, why: 16, what_if: 16, ps: 16 }
const EDIT_KEYS = Object.keys(LINE_CHARS)
const DTABS = [['cards', '카드뉴스'], ['info', '작품 정보'], ['proof', '근거·영상']]
const WHAT_IF_NOTE = '※ 실제 진행된 프로젝트가 아닌, 에디터의 가상 제안입니다.'
const SCOPE_NOTE = { EXTENDED: '확장 사례 (non-tangible)' }
const detail = { id: null, tab: 'cards' }

/* ── 이 브라우저에만 저장되는 수정본 ── */
let edits = {}
try { edits = JSON.parse(local.get(EDIT_STORE) || '{}') } catch { edits = {} }
const saveEdits = () => local.set(EDIT_STORE, JSON.stringify(edits))
const draftOf = (c) => ({ ...c.carousel, caption: c.caption, ...(edits[c.id] ?? {}) })
const isEdited = (c) => Boolean(edits[c.id] && Object.keys(edits[c.id]).length)
function setEdit(c, key, value) {
  const original = key === 'caption' ? c.caption : c.carousel[key]
  const next = { ...(edits[c.id] ?? {}) }
  if (value === original) delete next[key]
  else next[key] = value
  edits = { ...edits, [c.id]: next }
  if (Object.keys(next).length === 0) delete edits[c.id]
  saveEdits()
}

/* ── 업로드 완료 표시 (이 브라우저에만 저장) ── */
const UPLOAD_STORE = 'di-dash-uploaded'
let uploaded = {}
try { uploaded = JSON.parse(local.get(UPLOAD_STORE) || '{}') } catch { uploaded = {} }
const isUploaded = (c) => c.stage === '게시됨' || Boolean(uploaded[c.id])
const uploadedOn = (c) => uploaded[c.id] ?? ''
function setUploaded(id, on) {
  const next = { ...uploaded }
  if (on) next[id] = kstDate(new Date().toISOString())
  else delete next[id]
  uploaded = next
  local.set(UPLOAD_STORE, JSON.stringify(uploaded))
}
const uploadBtn = (c) => (c.stage === '게시됨' ? '' : `<button type="button" class="btn ${isUploaded(c) ? 'line' : ''}" data-upload="${esc(c.id)}">${isUploaded(c) ? '완료 취소' : '업로드 완료'}</button>`)
function refreshDone() {
  const n = (DATA.schedule?.items ?? []).filter((it) => { const c = caseById(it.id); return c && isUploaded(c) }).length
  const el = $('#tab-done-n')
  if (el) el.textContent = n
}

/* ── 슬라이드 모델 (워크벤치 src/lib/carousel.ts의 buildSlides와 같은 구성) ── */
const pad3 = (n) => String(n).padStart(3, '0')
const letterOf = (c) => (c.letter ? `${pad3(c.letter)} / ${DATA.goal}` : '번호 미배정')
const hasVal = (s) => Boolean(s) && s.trim() !== '' && s.trim() !== '미확인'
const countLines = (s, per) => s.split('\n').map((l) => [...l.trim()].length).filter((n) => n > 0).reduce((sum, n) => sum + Math.ceil(n / per), 0)
function slidesOf(c, d) {
  const rows = [['INPUT', c.input], ['OUTPUT', c.output], ...(hasVal(c.mechanism) ? [['MECHANISM', c.mechanism]] : [])]
  return [
    { no: '01', name: 'LOVE LETTER', key: 'cover', kicker: `LOVE LETTER ${letterOf(c)}`, body: d.cover, footer: `${c.title} — ${c.creator}` },
    { no: '02', name: 'THE WORK', key: 'work', kicker: `To. ${c.title}`, body: d.work, note: SCOPE_NOTE[c.scope] ?? '' },
    { no: '03', name: 'HOW IT WORKS', kicker: c.object, rows },
    { no: '04', name: 'WHY IT WORKS', key: 'why', kicker: '경험을 설계하는 방식', body: d.why, note: '에디터 해석' },
    { no: '05', name: 'WHAT IF?', key: 'what_if', kicker: c.idea?.context ?? '맥락 미정', body: d.what_if, note: WHAT_IF_NOTE },
    { no: '06', name: 'I STILL LOVE YOU', key: 'ps', kicker: '', body: d.ps, footer: `Love Letter ${letterOf(c)} · Dear, Interaction.` },
  ]
}
function slideHtml(s, index, total, editable) {
  const kicker = !s.kicker ? '' : s.kicker.startsWith('To. ')
    ? `<p class="slide-kicker"><span class="slide-to">To.</span> ${esc(s.kicker.slice(4))}</p>` : `<p class="slide-kicker">${esc(s.kicker)}</p>`
  const main = s.rows
    ? `<dl class="slide-rows">${s.rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
    : `<p class="slide-body"${editable && s.key ? ` contenteditable="plaintext-only" spellcheck="false" data-edit="${s.key}" aria-label="${s.no} ${s.name} 원고"` : ''}>${esc(s.body ?? '')}</p>`
  return `<figure class="slide slide-${s.no}" aria-label="${s.no} ${s.name}">
    <header class="slide-head"><span class="slide-chip">${s.no === '06' ? 'P.S.' : s.no} · ${s.name}</span><span class="slide-brand">dear.interaction</span></header>
    ${kicker}<div class="slide-main">${main}</div>${s.no === '01' ? '<span class="seal" aria-hidden="true">d.i</span>' : ''}
    <footer class="slide-foot">${s.note ? `<span class="slide-note">${esc(s.note)}</span>` : ''}${s.footer ? `<span class="slide-credit">${esc(s.footer)}</span>` : ''}
      <span class="slide-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</span></footer></figure>`
}
function lineBadge(key, text) {
  if (!key) return '<span class="line-ok">입력·출력 칸에서 자동으로 만듭니다</span>'
  if (!text.trim()) return '<span class="line-warn">원고 없음</span>'
  const n = countLines(text, LINE_CHARS[key])
  return n > SLIDE_MAX_LINES ? `<span class="line-warn">${n}줄 — ${SLIDE_MAX_LINES}줄(한 줄 ${LINE_CHARS[key]}자)로 줄여 주세요</span>` : `<span class="line-ok">${n}줄 ✓</span>`
}

/* ── 상세 탭: 카드뉴스 ── */
function cardsTab(c) {
  const d = draftOf(c)
  const slides = slidesOf(c, d)
  const tags = c.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
  return `
    <p class="hint">${c.carousel.cover ? '카드의 글씨를 눌러 바로 고칠 수 있습니다. 고친 내용은 이 브라우저에만 저장되니, ‘수정본 복사’로 Claude에게 넘겨 주세요.' : '아직 원고가 없습니다. 출처에서 관객이 무엇을 하는지 확인한 뒤에 씁니다.'}</p>
    <div class="carousel">${slides.map((s, i) => `<div class="slide-wrap"><div class="slide-frame">${slideHtml(s, i, slides.length, true)}</div><p class="slide-meta" data-meta="${s.key ?? ''}">${lineBadge(s.key, s.body ?? '')}</p></div>`).join('')}</div>
    <div class="edit-bar"><button type="button" class="btn" data-copy-edit>수정본 복사</button><button type="button" class="btn line" data-copy-post>게시용 글 복사</button><button type="button" class="btn line" data-reset-edit${isEdited(c) ? '' : ' disabled'}>원래대로</button><span class="note" id="edit-state" role="status">${isEdited(c) ? '수정한 내용이 있습니다' : ''}</span></div>
    <div class="box"><h3>인스타 캡션</h3><textarea class="caption-edit" data-edit="caption" rows="12" aria-label="인스타 캡션">${esc(d.caption)}</textarea>${tags ? `<p class="note">${esc(tags)}</p>` : ''}</div>`
}

/* ── 상세 탭: 작품 정보 ── */
function infoTab(c) {
  const k = KINDS[c.cls.grade] ?? KINDS['?']
  const idea = c.idea?.action ? c.idea : null
  return `
    <div class="info-grid">
      <div class="box span2"><h3>어떤 작품인가요</h3><p class="lead">${esc(c.summary)}</p>
        <dl class="facts"><dt>만든 곳</dt><dd>${esc(c.creator)}</dd><dt>장소</dt><dd>${esc(c.location)}</dd><dt>맥락</dt><dd>${esc(c.context)}</dd></dl></div>
      <div class="box span2"><h3>어떻게 작동하나요</h3>
        <div class="io"><div><small>사람이 하는 일</small>${esc(c.input)}</div><span class="arr" aria-hidden="true">→</span><div><small>돌아오는 반응</small>${esc(c.output)}</div></div>
        <dl class="facts"><dt>만지는 것</dt><dd>${esc(c.object)}</dd></dl></div>
      <div class="box tone"><h3>1. 인사이트</h3><p>${c.insight ? esc(c.insight) : '<span class="note">출처 확인 뒤에 씁니다.</span>'}</p></div>
      <div class="box tone"><h3>2. 아이디어 <span class="note">가상 제안</span></h3>${idea ? `<ol class="flow"><li><small>누가</small>${esc(idea.audience)}</li><li><small>무엇을 하면</small>${esc(idea.action)}</li><li><small>이렇게 반응</small>${esc(idea.response)}</li></ol><p class="note">${esc(idea.context ?? '')} · ${esc(idea.message)}</p>` : '<p class="note">출처 확인 뒤에 씁니다.</p>'}</div>
      <div class="box tone"><h3>3. 기술</h3><p>${esc(c.mechanism)}</p></div>
      <div class="box"><h3>분류</h3><p><span class="kind ${k.cls}">${esc(k.name)}${c.cls.verified ? ' ✓' : ''}</span></p><p class="note">${esc(k.desc)}<br />근거: ${esc(c.cls.basis)}</p></div>
      ${c.facts?.length ? `<div class="box span2"><h3>조사 메모</h3><ul class="bullets">${c.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
    </div>`
}

/* ── 상세 탭: 근거·영상 ── */
function proofTab(c) {
  const evMark = (s) => (s === '확인' ? ['ok', '✓'] : s === '부분 확인' ? ['part', '!'] : ['na', '?'])
  const link = (u, label) => (okUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label ?? host(u))} ↗</a>` : esc(label ?? u))
  const figs = c.verify?.figures?.filter((f) => f.src) ?? []
  return `
    <div class="info-grid">
      <div class="box span2"><h3>릴스용 영상 후보 ${c.media.length}개</h3>${c.media.length ? `<ul class="checklist">${c.media.map((m) => `<li><span class="mark ${m.permission === '허용 확인됨' ? 'ok' : 'part'}">${m.permission === '허용 확인됨' ? '✓' : '!'}</span><span>${link(m.url, m.credit || host(m.url))}<small>${esc(host(m.url))} · ${esc(m.permission)}</small></span></li>`).join('')}</ul><p class="note">검색 제목으로 고른 후보입니다. 남의 영상을 릴스에 잘라 쓰려면 권리자 허락이 필요합니다.</p>` : '<p class="note">아직 찾은 영상이 없습니다.</p>'}</div>
      <div class="box span2"><h3>사실 확인</h3><ul class="checklist">
        <li><span class="mark na">–</span><span>공식 출처 ${link(c.source)}</span></li>
        ${c.evidence.map((e) => { const [m, i] = evMark(e.status); return `<li><span class="mark ${m}">${i}</span><span>${esc(e.label)} — ${esc(e.status)}<small>${esc(e.note)}${okUrl(e.url) ? ` · ${link(e.url)}` : ''}</small></span></li>` }).join('')}
        ${c.ars ? `<li><span class="mark ok">✓</span><span>Ars Electronica 공식 기록<small>${esc(c.ars.note)} · ${link(c.ars.url, '열기')}</small></span></li>` : ''}</ul></div>
      ${c.quotes.length ? `<div class="box span2"><h3>원문에서 확인한 문장</h3>${c.quotes.map((q) => `<p class="quote">${esc(q.quote)}<small>원문 p.${esc(q.page)}</small></p>`).join('')}</div>` : ''}
      ${figs.length ? `<div class="box span2"><h3>논문 그림 ${figs.length}장</h3><div class="figs">${figs.map((f) => `<figure><img src="${f.src}" alt="${esc(f.caption || 'Figure')}" loading="lazy" /><figcaption>${esc((f.caption || '').slice(0, 70))}</figcaption></figure>`).join('')}</div><p class="note">확인용입니다. 재게시 권리는 따로 확인해야 합니다.</p></div>` : ''}
      ${c.issues.length ? `<div class="box span2"><h3>검증 규칙 알림</h3><ul class="checklist">${c.issues.map((i) => `<li><span class="mark ${i.level === 'error' ? 'no' : i.level === 'warn' ? 'part' : 'na'}">${i.level === 'error' ? '✕' : i.level === 'warn' ? '!' : 'i'}</span><span>${esc(i.message)}</span></li>`).join('')}</ul></div>` : ''}
    </div>`
}

/* ── 상세 화면 ── */
const scheduleIds = () => DATA.schedule?.items.map((it) => it.id) ?? []
function renderDetail() {
  const c = caseById(detail.id)
  if (!c) return
  const ids = scheduleIds(), at = ids.indexOf(c.id)
  const day = DATA.schedule?.items.find((it) => it.id === c.id)
  const tasks = tasksOf(c), errs = errorsOf(c)
  const tabBody = { cards: cardsTab, info: infoTab, proof: proofTab }[detail.tab](c)
  $('#p-body').innerHTML = `<div class="detail">
    <div class="d-head">
      <div class="d-title"><p class="meta">${esc(c.id)} · ${esc(colLabel(c))}${c.letter ? ` · LOVE LETTER ${pad3(c.letter)}` : ''}${day ? ` · ${esc(dayLabel(day.date))} 업로드` : ''}</p>
        <h2 id="p-title">${esc(c.title)}</h2><p class="sub">${esc(c.creator)} · ${esc(c.year)} · ${steps(c)} ${esc(c.stage)}</p></div>
      ${at >= 0 ? `<div class="d-nav">${uploadBtn(c)}<button type="button" class="btn line" data-open="${esc(ids[at - 1] ?? '')}"${at > 0 ? '' : ' disabled'}>← 전날</button><button type="button" class="btn line" data-open="${esc(ids[at + 1] ?? '')}"${at < ids.length - 1 ? '' : ' disabled'}>다음 날 →</button></div>` : ''}
    </div>
    ${tasks.length || errs.length ? `<div class="box attn"><h3>이 사례에 남은 일</h3><ul class="checklist">${errs.map((e) => `<li><span class="mark no">✕</span><span>${esc(e.message)}</span></li>`).join('')}${tasks.map((t) => `<li><span class="mark part">!</span><span>${esc(t.title)}<small>${esc(t.how)}</small></span></li>`).join('')}</ul></div>` : ''}
    <div class="d-tabs" role="tablist" aria-label="상세">${DTABS.map(([k, l]) => `<button type="button" role="tab" data-dtab="${k}" aria-selected="${detail.tab === k}">${l}${k === 'cards' && isEdited(c) ? ' ●' : ''}${k === 'proof' && c.media.length ? ` <span class="tab-n">${c.media.length}</span>` : ''}</button>`).join('')}</div>
    <div class="d-body">${tabBody}</div></div>`
}
function openCase(id, push = true) {
  if (!caseById(id)) return
  if (detail.id !== id) detail.tab = caseById(id).carousel.cover ? 'cards' : 'info'
  detail.id = id
  renderDetail()
  $('#p-body').scrollTop = 0
  $('#panel').hidden = false
  document.body.style.overflow = 'hidden'
  if (push) history.replaceState(null, '', `#case/${encodeURIComponent(id)}`)
}

/* ── 수정·복사 ── */
function copyText(text, done) {
  const state = $('#edit-state')
  navigator.clipboard.writeText(text).then(() => { if (state) state.textContent = done }, () => { if (state) state.textContent = '복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.' })
}
function postText(c) {
  const d = draftOf(c)
  const lines = slidesOf(c, d).map((s) => `[${s.no} ${s.name}]\n${s.rows ? s.rows.map(([k, v]) => `${k}: ${v}`).join('\n') : s.body || '(원고 없음)'}`)
  return [`LOVE LETTER ${letterOf(c)} — ${c.title}`, ...lines, '[캡션]', d.caption, c.hashtags.join(' ')].join('\n\n')
}
document.addEventListener('input', (e) => {
  const key = e.target.dataset?.edit, c = caseById(detail.id)
  if (!key || !c) return
  const value = (key === 'caption' ? e.target.value : e.target.innerText).replace(/\n+$/, '')
  setEdit(c, key, value)
  const meta = document.querySelector(`[data-meta="${key}"]`)
  if (meta) meta.innerHTML = lineBadge(key, value)
  const state = $('#edit-state'), reset = document.querySelector('[data-reset-edit]')
  if (state) state.textContent = isEdited(c) ? '수정한 내용이 이 브라우저에 저장됐습니다' : ''
  if (reset) reset.disabled = !isEdited(c)
})
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-dtab],[data-copy-edit],[data-copy-post],[data-reset-edit]')
  const c = caseById(detail.id)
  if (!t || !c) return
  if (t.dataset.dtab) { detail.tab = t.dataset.dtab; renderDetail(); $('#p-body').scrollTop = 0; return }
  if ('copyEdit' in t.dataset) {
    const d = draftOf(c)
    const payload = { id: c.id, title: c.title, carousel: Object.fromEntries(EDIT_KEYS.map((k) => [k, d[k]])), caption: d.caption }
    return copyText(`[dear.interaction 수정본]\n${JSON.stringify(payload, null, 2)}`, isEdited(c) ? '수정본을 복사했습니다. Claude에게 붙여 넣어 주세요.' : '고친 곳이 없어 지금 원고를 그대로 복사했습니다.')
  }
  if ('copyPost' in t.dataset) return copyText(postText(c), '게시용 글을 복사했습니다.')
  if ('resetEdit' in t.dataset) { delete edits[c.id]; edits = { ...edits }; saveEdits(); renderDetail() }
})

/* ── 화면: 업로드 일정 (표지 피드) · 완료 ── */
function feedCard(it, n, today) {
  const c = caseById(it.id)
  if (!c) return ''
  const [m, label] = readyState(c)
  const cover = slidesOf(c, draftOf(c))[0]
  const done = isUploaded(c)
  return `<article class="feed-card${!done && it.date === today ? ' today' : ''}">
    <button type="button" class="feed-cover" data-open="${esc(it.id)}" aria-label="${esc(c.title)} 카드뉴스 열기"><span class="carousel"><span class="slide-frame">${slideHtml(cover, 0, 6, false)}</span></span></button>
    <div class="feed-meta"><b>${esc(dayLabel(it.date))}${!done && it.date < today ? ' <span class="late">지남</span>' : ''}</b><small>${n + 1}일차 · ${esc(c.title)}</small>
      <span class="feed-tags"><span class="kind">${c.region === 'domestic' ? '국내' : '해외'}</span><span class="kind${c.media.length ? ' k2' : ''}">영상 ${c.media.length}</span>${done ? `<span class="flag ok"><i aria-hidden="true">✓</i>${uploadedOn(c) ? `${esc(dayLabel(uploadedOn(c)))} 올림` : '게시됨'}</span>` : `<span class="flag ${m === 'ok' ? 'ok' : m === 'part' ? 'todo' : 'err'}">${esc(label)}${isEdited(c) ? ' · 수정함' : ''}</span>`}</span>
      ${uploadBtn(c)}</div></article>`
}
function renderSchedule() {
  const s = DATA.schedule
  if (!s) { $('#view-schedule').innerHTML = '<p class="empty">업로드 일정이 아직 없습니다.</p>'; return }
  const today = kstDate(new Date().toISOString())
  const numbered = s.items.map((it, n) => [it, n])
  const todo = numbered.filter(([it]) => { const c = caseById(it.id); return c && !isUploaded(c) })
  const scheduled = new Set(s.items.map((it) => it.id))
  const waiting = DATA.cases.filter((c) => c.region && !scheduled.has(c.id))
  const ready = todo.filter(([it]) => readyState(caseById(it.id))[0] === 'ok').length
  const withVideo = todo.filter(([it]) => caseById(it.id).media.length).length
  const next = todo[0]?.[0]
  $('#view-schedule').innerHTML = `
    <div class="page-head"><h1>업로드 일정 <span class="note">남은 ${todo.length}일치</span></h1><p>${esc(dayLabel(s.start))}부터 하루 한 통. 표지를 누르면 6장 카드뉴스가 전체 화면으로 열리고, 올린 뒤 ‘업로드 완료’를 누르면 완료 탭으로 옮겨집니다.</p></div>
    <div class="big3">
      <div class="big"><p>다음에 올릴 것</p><b style="font-size:24px">${next ? esc(dayLabel(next.date)) : '모두 올렸어요'}</b><span>${next ? esc(caseById(next.id).title) : ''}</span></div>
      <div class="big"><p>원고까지 준비된 날</p><b>${ready}<small>/ ${todo.length}</small></b><span>릴스용 영상 있는 날 ${withVideo}</span></div>
      <div class="big"><p>대기 후보</p><b>${waiting.length}</b><span>출처·관객 행동 확인 뒤 원고를 씁니다</span></div></div>
    <div class="feed">${todo.map(([it, n]) => feedCard(it, n, today)).join('') || '<p class="empty">남은 일정이 없습니다.</p>'}</div>
    <section><h2 class="section-title">대기 후보 <small>확인이 끝나면 일정 뒤에 붙입니다</small></h2><div class="chips">${waiting.map((c) => `<button type="button" class="chip" data-open="${esc(c.id)}">${esc(c.title)}</button>`).join('')}</div></section>`
  refreshDone()
}
function renderDone() {
  const items = (DATA.schedule?.items ?? []).map((it, n) => [it, n]).filter(([it]) => { const c = caseById(it.id); return c && isUploaded(c) })
  const mine = items.filter(([it]) => uploaded[it.id])
  $('#view-done').innerHTML = `
    <div class="page-head"><h1>완료 <span class="note">${items.length}건 올림</span></h1><p>‘업로드 완료’로 표시한 러브레터입니다. 이 표시는 이 브라우저에만 저장되니, 목록을 복사해 Claude에게 주시면 원본에도 ‘게시됨’으로 반영합니다.</p></div>
    ${mine.length ? `<div class="edit-bar"><button type="button" class="btn line" data-copy-done>완료 목록 복사</button><span class="note" id="done-state" role="status"></span></div>` : ''}
    <div class="feed">${items.map(([it, n]) => feedCard(it, n, '')).join('') || '<p class="empty">아직 올린 것이 없습니다. 업로드 일정에서 ‘업로드 완료’를 눌러 주세요.</p>'}</div>`
  refreshDone()
}
document.addEventListener('click', (e) => {
  if (!DATA) return
  const up = e.target.closest('[data-upload]')
  if (up) {
    const c = caseById(up.dataset.upload)
    if (!c) return
    setUploaded(c.id, !uploaded[c.id])
    if (!$('#panel').hidden) renderDetail()
    if (ui.tab === 'schedule') renderSchedule()
    if (ui.tab === 'done') renderDone()
    return refreshDone()
  }
  if (e.target.closest('[data-copy-done]')) {
    const lines = Object.entries(uploaded).map(([id, day]) => `${id} · ${day} · ${caseById(id)?.title ?? ''}`)
    const state = $('#done-state')
    navigator.clipboard.writeText(`[dear.interaction 업로드 완료]\n${lines.join('\n')}`).then(() => { if (state) state.textContent = '복사했습니다. Claude에게 붙여 넣어 주세요.' }, () => { if (state) state.textContent = '복사하지 못했습니다.' })
  }
})

/* ── 화면: 데일리 (전날 소식 3건 · 인사이트 → 아이디어 → 엑스큐션 → 기술) ── */
const knownDay = (d) => (d && d !== '미확인' ? dayLabel(d) : '')
function dailyCard(it) {
  return `<article class="daily-card">
    <p class="r-no">${esc(it.category)}${knownDay(it.happened) ? ` · ${esc(knownDay(it.happened))}` : ''}</p>
    <h3>${esc(it.title)}</h3><p class="daily-what">${esc(it.what)}</p>
    <dl class="daily-steps">
      <div><dt>인사이트 <small>${esc(it.insight_basis)}</small></dt><dd>${esc(it.insight)}</dd></div>
      <div><dt>아이디어</dt><dd>${esc(it.idea)}</dd></div>
      <div><dt>엑스큐션</dt><dd><ol>${it.execution.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></dd></div>
      <div><dt>기술</dt><dd>${it.tech.length ? `<span class="daily-tech">${it.tech.map((t) => `<span class="kind">${esc(t)}</span>`).join('')}</span>` : '<span class="note">기사에 없음</span>'}</dd></div>
    </dl>
    ${it.unknown.length ? `<details class="more"><summary>기사에서 확인하지 못한 것 ${it.unknown.length}</summary><ul class="bullets">${it.unknown.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></details>` : ''}
    <p class="r-src">${okUrl(it.source.url) ? `<a href="${esc(it.source.url)}" target="_blank" rel="noopener noreferrer">${esc(it.source.name)} ↗</a>` : esc(it.source.name)}${knownDay(it.source.published) ? ` · ${esc(knownDay(it.source.published))} 게재` : ''}</p></article>`
}
function renderDaily() {
  const days = DATA.daily ?? []
  const body = days.map((d) => `<section><h2 class="section-title">${esc(dayLabel(d.date))} <small>${esc(dayLabel(d.covers))} 소식</small></h2><div class="daily-grid">${d.items.map(dailyCard).join('')}</div></section>`).join('')
  $('#view-daily').innerHTML = `
    <div class="page-head"><h1>데일리 <span class="note">${days.length}일치</span></h1><p>매일 아침, 전날 나온 엔터테크·이머시브·인터랙션·로봇·버추얼 소식 3건을 정리합니다. 아이디어는 에디터의 제안이 아니라 그 콘텐츠 자체의 아이디어입니다.</p></div>
    ${body || '<p class="empty">아직 기록이 없습니다.</p>'}`
}
