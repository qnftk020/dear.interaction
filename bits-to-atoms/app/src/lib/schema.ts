import { z } from 'zod'

/** 확인되지 않은 값은 비워두지 않고 '미확인'으로 기록한다. */
export const UNKNOWN = '미확인'
export const ID_PATTERN = /^BT-[A-Z]-\d{3,4}$/
export const LETTER_TOTAL = 1000

export const STAGES = ['발견', '출처 확인 중', '검증 완료', '원고 작성', '게시 준비', '게시됨'] as const
export const SCOPES = ['TANGIBLE', 'EXTENDED', 'HOLD', 'EXCLUDED'] as const
export const STATUSES = ['실제 구현', '연구 프로토타입', '콘셉트', UNKNOWN] as const
export const CHECK_STATUSES = ['확인', '부분 확인', UNKNOWN] as const
export const MEDIA_PERMISSIONS = ['허용 확인됨', '권한 확인 필요', '재게시 불가'] as const
export const WHAT_IF_CONTEXTS = ['박물관 아카이브', '공공 문화시설', '브랜드 체험 공간', '전시', '기타'] as const

export type Stage = (typeof STAGES)[number]
export type Scope = (typeof SCOPES)[number]
export type CheckStatus = (typeof CHECK_STATUSES)[number]
export type MediaPermission = (typeof MEDIA_PERMISSIONS)[number]

export const SCOPE_LABELS: Record<Scope, string> = {
  TANGIBLE: '탠저블',
  EXTENDED: '확장 사례 (non-tangible)',
  HOLD: '보류',
  EXCLUDED: '제외',
}

/** 지침 7-B 사실 검증표의 4개 행 */
export const EVIDENCE_ROWS = {
  identity: '작품명·작가·연도',
  interaction: '인터랙션 입력·출력',
  technology: '사용 기술',
  context: '작품의 목적/맥락',
} as const
export type EvidenceKey = keyof typeof EVIDENCE_ROWS

/** 아카이브 분류 체계. 100개 시점에 재정비한다.
 * WEARABLE·TOY·CONCERT·THEME PARK·GAME·FANDOM은 엔터테크 컬렉션용으로 2026-11-07 추가. */
export const TAXONOMY = {
  input: { label: '물리적 입력', tags: ['ROTATE', 'PRESS', 'MOVE', 'PLACE', 'FOLD', 'DRAW', 'TOUCH', 'ASSEMBLE', 'GESTURE', 'GAZE', 'VOICE', 'BIOSIGNAL', 'UNKNOWN'] },
  object: { label: '매개 사물', tags: ['TOKEN', 'CARD', 'BLOCK', 'DIAL', 'PAPER', 'TOOL', 'FURNITURE', 'BODY', 'WEARABLE', 'TOY', 'UNKNOWN'] },
  sensing: { label: '감지 방식', tags: ['NFC/RFID', 'CAMERA', 'CAPACITIVE', 'PRESSURE', 'MOTION', 'MAGNETIC', 'MICROPHONE', 'UNKNOWN'] },
  output: { label: '출력/피드백', tags: ['LIGHT', 'SOUND', 'PROJECTION', 'SCREEN', 'SCENT', 'MOTION', 'HAPTIC', 'SHAPE', 'AI RESPONSE', 'UNKNOWN'] },
  context: { label: '맥락', tags: ['ART', 'MUSEUM', 'EXHIBITION', 'EDUCATION', 'PUBLIC SPACE', 'BRAND', 'PRODUCT', 'RESEARCH', 'CONCERT', 'THEME PARK', 'GAME', 'FANDOM', 'UNKNOWN'] },
  ai: { label: 'AI 결합', tags: ['NONE', 'AI-ASSISTED', 'AI-GENERATIVE', 'AI-ADAPTIVE', 'UNKNOWN'] },
  mode: { label: '상호작용 형태', tags: ['INDIVIDUAL', 'COLLABORATIVE', 'MULTI-USER', 'UNKNOWN'] },
  era: { label: '시대', tags: ['PRE-1990', '1990s', '2000s', '2010s', '2020s', 'UNKNOWN'] },
} as const

export type Axis = keyof typeof TAXONOMY
export const AXES = Object.keys(TAXONOMY) as Axis[]

export const SCORE_LABELS = {
  tangible: 'Tangible 적합성',
  originality: '상호작용의 독창성',
  reliability: '기록의 신뢰도',
  applicability: '전시·공간 응용성',
  postability: '게시 가능성',
} as const
export type ScoreKey = keyof typeof SCORE_LABELS

const text = z.preprocess(
  (v) => (typeof v === 'number' ? String(v) : v),
  z.string().trim().min(1, `빈 값 대신 '${UNKNOWN}'을 쓰세요`),
)
const optionalText = z.string().nullish().transform((v) => v ?? '')
const stringList = z.array(z.string()).default([])
const axisTags = <T extends readonly [string, ...string[]]>(tags: T) => z.array(z.enum(tags)).default([])
const score = z.number().int().min(1).max(5).nullable().default(null)

const evidenceRow = z
  .object({
    note: optionalText,
    url: optionalText,
    status: z.enum(CHECK_STATUSES).default(UNKNOWN),
    /** 링크를 실제로 열어 확인했는가 (지침 7-B) */
    link_opened: z.boolean().default(false),
  })
  .prefault({})

const mediaItem = z.object({
  url: text,
  credit: optionalText,
  permission: z.enum(MEDIA_PERMISSIONS).default('권한 확인 필요'),
  /** 허용 확인됨일 때 그 근거 (라이선스 링크, 허락 메일 등) */
  permission_basis: optionalText,
  /** 로컬에 내려받은 이미지 파일 (data/ 기준 상대 경로, 예: figures/BT-A-005/fig-1.jpg). 논문 Figure 추출 시 채워진다. */
  image: optionalText,
})

export const caseSchema = z.object({
  id: z.string().regex(ID_PATTERN, 'id 형식은 BT-A-001'),
  /** 게시 번호. null이면 '번호 미배정' */
  letter_no: z.number().int().min(1).max(LETTER_TOTAL).nullable().default(null),
  title: text,
  creator: text,
  year: text,
  location: text,
  context: text,
  status: z.enum(STATUSES),
  summary_ko: text,
  physical_object: text,
  input: text,
  output: text,
  /** 확인된 센서·구동·기술만. evidence.technology가 미확인이면 '미확인'이어야 한다. */
  mechanism: text,
  tags: z
    .object({
      input: axisTags(TAXONOMY.input.tags),
      object: axisTags(TAXONOMY.object.tags),
      sensing: axisTags(TAXONOMY.sensing.tags),
      output: axisTags(TAXONOMY.output.tags),
      context: axisTags(TAXONOMY.context.tags),
      ai: axisTags(TAXONOMY.ai.tags),
      mode: axisTags(TAXONOMY.mode.tags),
      era: axisTags(TAXONOMY.era.tags),
    })
    .prefault({}),
  ai_evidence: optionalText,
  source_primary: text,
  source_checked_at: optionalText,
  archive_snapshot: optionalText,
  evidence: z
    .object({ identity: evidenceRow, interaction: evidenceRow, technology: evidenceRow, context: evidenceRow })
    .prefault({}),
  media: z.array(mediaItem).max(3, '이미지·영상 후보는 1~3개').default([]),
  /** 04 WHY IT WORKS의 근거가 되는 에디터 해석 */
  ad_insight: optionalText,
  what_if: z
    .object({
      context: z.enum(WHAT_IF_CONTEXTS).nullable().default(null),
      audience: optionalText,
      action: optionalText,
      response: optionalText,
      message: optionalText,
    })
    .prefault({}),
  carousel: z
    .object({ cover: optionalText, work: optionalText, why: optionalText, what_if: optionalText, ps: optionalText })
    .prefault({}),
  caption: z.object({ text: optionalText, hashtags: stringList }).prefault({}),
  /** 아카이브 DB 태그 3~5개 */
  keywords: stringList,
  notes: z
    .object({ fact: stringList, interpretation: stringList, speculation: stringList })
    .prefault({}),
  scores: z
    .object({ tangible: score, originality: score, reliability: score, applicability: score, postability: score })
    .prefault({}),
  /** 지침 10절 중 사람이 판단해야 하는 항목 */
  checklist: z
    .object({ humor_linked: z.boolean().default(false), info_not_buried: z.boolean().default(false) })
    .prefault({}),
  stage: z.enum(STAGES).default('발견'),
  scope: z.enum(SCOPES).default('TANGIBLE'),
})

export type Case = z.output<typeof caseSchema>
export type MediaItem = Case['media'][number]
