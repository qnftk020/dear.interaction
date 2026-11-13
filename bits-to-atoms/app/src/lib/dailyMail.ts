import { UNKNOWN_DATE, type Daily, type DailyItem } from './daily.ts'

/** 데일리 기록 하루치를 메일 한 통(제목·HTML·텍스트)으로 만든다. 메일 클라이언트가 스타일시트를 버리므로 스타일은 모두 인라인이다. */
export interface DailyMail {
  subject: string
  html: string
  text: string
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const
const INK = '#17191c'
const INK_2 = '#4b5360'
const MUTED = '#858d99'
const ACCENT = '#1f5fae'
const LINE = '#e7e9ec'
const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif"

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string): string => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch])

/** 2026-11-13 → '11월 13일 (금)' */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`
}

const label = (s: string) => `<p style="margin:16px 0 4px;font-size:12px;font-weight:700;color:${ACCENT}">${s}</p>`
const para = (s: string) => `<p style="margin:0;font-size:15px;line-height:1.6;color:${INK}">${esc(s)}</p>`

function itemHtml(item: DailyItem, n: number): string {
  const steps = item.execution.map((x) => `<li style="margin:0 0 4px">${esc(x)}</li>`).join('')
  const published = item.source.published === UNKNOWN_DATE ? '' : ` · ${dayLabel(item.source.published)} 게재`
  return [
    `<div style="margin:0 0 20px;padding:20px;border:1px solid ${LINE};border-radius:14px;background:#ffffff">`,
    `<p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${ACCENT}">${n + 1} · ${esc(item.category)}</p>`,
    `<h2 style="margin:0 0 8px;font-size:18px;line-height:1.4;color:${INK}">${esc(item.title)}</h2>`,
    `<p style="margin:0;font-size:14.5px;line-height:1.6;color:${INK_2}">${esc(item.what)}</p>`,
    label(`인사이트 <span style="font-weight:500;color:${MUTED}">${esc(item.insight_basis)}</span>`), para(item.insight),
    label('아이디어'), para(item.idea),
    label('엑스큐션'), `<ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;color:${INK}">${steps}</ol>`,
    label('기술'), para(item.tech.length > 0 ? item.tech.join(' · ') : '기사에 없음'),
    `<p style="margin:16px 0 0;font-size:13px;color:${MUTED}"><a href="${esc(item.source.url)}" style="color:${ACCENT}">${esc(item.source.name)}</a>${published}</p>`,
    '</div>',
  ].join('')
}

function itemText(item: DailyItem, n: number): string {
  return [
    `${n + 1}. [${item.category}] ${item.title}`,
    item.what,
    `- 인사이트 (${item.insight_basis}): ${item.insight}`,
    `- 아이디어: ${item.idea}`,
    '- 엑스큐션:',
    ...item.execution.map((x, i) => `  ${i + 1}) ${x}`),
    `- 기술: ${item.tech.length > 0 ? item.tech.join(', ') : '기사에 없음'}`,
    `- 출처: ${item.source.name} ${item.source.url}`,
  ].join('\n')
}

export function renderDailyMail(d: Daily, dashboardUrl: string): DailyMail {
  const others = d.items.length - 1
  const subject = `[dear.interaction] ${dayLabel(d.date)} 데일리 — ${d.items[0].title}${others > 0 ? ` 외 ${others}건` : ''}`
  const intro = `${dayLabel(d.covers)}에 나온 엔터테크·이머시브·인터랙션·로봇·버추얼 소식 ${d.items.length}건입니다.`
  const note = '아이디어는 에디터의 제안이 아니라 그 콘텐츠 자체의 아이디어입니다.'
  const html = [
    `<div style="margin:0;padding:24px 12px;background:#f5f6f8;font-family:${FONT}">`,
    '<div style="max-width:620px;margin:0 auto">',
    `<p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${ACCENT}">dear.interaction 데일리</p>`,
    `<h1 style="margin:0 0 8px;font-size:22px;color:${INK}">${dayLabel(d.date)}</h1>`,
    `<p style="margin:0 0 20px;font-size:14.5px;line-height:1.6;color:${INK_2}">${esc(intro)} ${esc(note)}</p>`,
    ...d.items.map(itemHtml),
    `<p style="margin:0;font-size:13px;color:${MUTED}"><a href="${esc(dashboardUrl)}" style="color:${ACCENT}">대시보드에서 보기</a></p>`,
    '</div></div>',
  ].join('')
  const text = [`dear.interaction 데일리 · ${dayLabel(d.date)}`, `${intro} ${note}`, ...d.items.map(itemText), `대시보드: ${dashboardUrl}`].join('\n\n')
  return { subject, html, text }
}
