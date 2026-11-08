import { caseSchema, type Case } from './schema.ts'

/** 테스트용 사례. 실제 프로젝트가 아니다. */
export function makeCase(overrides: Record<string, unknown> = {}): Case {
  return caseSchema.parse({
    id: 'BT-A-901',
    title: 'Test Piece',
    creator: 'Test Studio',
    year: 2001,
    location: '미확인',
    context: '연구',
    status: '연구 프로토타입',
    summary_ko: '테스트 사례',
    physical_object: '다이얼',
    input: '다이얼을 돌린다',
    output: '소리가 바뀐다',
    mechanism: '미확인',
    tags: { input: ['ROTATE'], output: ['SOUND'], ai: ['NONE'] },
    source_primary: 'https://example.org/project',
    ...overrides,
  })
}

const opened = (note: string) => ({ note, url: 'https://example.org/project', status: '확인', link_opened: true })

/** 게시 준비까지 모든 규칙을 통과하는 사례 */
export function makeReadyCase(overrides: Record<string, unknown> = {}): Case {
  return makeCase({
    letter_no: 1,
    stage: '게시 준비',
    source_checked_at: '2026-10-17',
    archive_snapshot: 'https://web.archive.org/web/2026/https://example.org/project',
    evidence: {
      identity: opened('Test Piece, Test Studio, 2001'),
      interaction: opened('돌리면 소리가 바뀜'),
      context: opened('연구 프로젝트'),
    },
    media: [{ url: 'https://example.org/img', credit: 'Test Studio', permission: '허용 확인됨', permission_basis: 'CC BY 4.0' }],
    ad_insight: '손의 움직임이 곧 결과가 된다.',
    what_if: { context: '박물관 아카이브', audience: '관람객', action: '다이얼을 돌린다', response: '시대별 소리', message: '시간을 손으로 감는다' },
    carousel: {
      cover: '돌릴수록 더 듣고 싶어집니다',
      work: '다이얼 하나로 소리를 고르는 장치입니다.',
      why: '결과가 손끝에서 바로 나와\n계속 돌려볼 수 있습니다.',
      what_if: '다이얼로 연도를 고르면\n그 시절 소리가 나옵니다.',
      ps: '돌리는 손맛, 이게 원래 인터페이스였죠.',
    },
    caption: { text: '돌릴수록 들리는 것.', hashtags: ['TangibleInterface', 'InteractionDesign', 'dearinteraction'] },
    keywords: ['DIAL', 'SOUND', 'MUSEUM'],
    checklist: { humor_linked: true, info_not_buried: true },
    ...overrides,
  })
}
