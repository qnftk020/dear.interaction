import { hasValue, isVerified } from './derive.ts'
import type { Case } from './schema.ts'
import { checkCase, parseUrl } from './validate.ts'

export interface CheckItem {
  label: string
  ok: boolean
  /** false면 사람이 직접 체크하는 항목 */
  auto: boolean
}

/** 지침 10절 완료 전 자체 점검 8항목. 데이터로 판단할 수 있는 것은 자동, 나머지는 수동 체크. */
export function selfCheck(c: Case, all: readonly Case[]): CheckItem[] {
  const issues = checkCase(c, all)
  const { identity, interaction } = c.evidence
  const sourcesOpened = [identity, interaction].every((r) => parseUrl(r.url) && r.link_opened)
  return [
    { label: '작품이 실재하며 이름·제작자·연도를 검증했는가', ok: identity.status === '확인', auto: true },
    { label: '탠저블인지 확장 사례인지 구분했는가', ok: c.scope === 'TANGIBLE' || c.scope === 'EXTENDED', auto: true },
    { label: 'INPUT → OUTPUT이 분명한가', ok: isVerified(c) && hasValue(c.input) && hasValue(c.output), auto: true },
    {
      label: 'WHAT IF를 실제 사례로 착각할 여지가 없는가 (가상 제안 표기)',
      ok: c.carousel.what_if.trim() !== '' && c.what_if.context !== null,
      auto: true,
    },
    { label: '첫 장과 마지막 장의 재치가 작품 특성과 연결되는가', ok: c.checklist.humor_linked, auto: false },
    { label: '전문적인 정보가 유머에 묻히지 않는가', ok: c.checklist.info_not_buried, auto: false },
    { label: '출처를 실제로 열어 확인했고 재게시 권리를 따로 표시했는가', ok: sourcesOpened && c.media.length > 0, auto: true },
    { label: '같은 사례를 중복 아카이빙하지 않았는가', ok: !issues.some((i) => i.field === 'title' || i.field === 'letter_no'), auto: true },
  ]
}
