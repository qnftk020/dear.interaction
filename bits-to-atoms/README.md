# dear.interaction — 에디토리얼 데스크

> **1,000 Love Letters to Interaction** · 경험을 설계하는 방식으로 첫사랑, 인터랙션을 탐구합니다.

기준 문서
- `../dear_interaction_Claude_Project_Instructions.md` — 계정 세계관, 6장 캐러셀, 검증 절차, 출력 형식 (**우선 적용**)
- `../BITS_TO_ATOMS_Claude_Research_Brief.md` — 분류 체계(8축), 사실/해석 구분, 품질 평가

```
data/cases/BT-A-001.yaml   ← 사례 1개 = 파일 1개 (원본 데이터, 파일명 = id)
data/cases/_template.yaml  ← 새 사례 템플릿 (_로 시작하면 무시됨)
data/entertech/BT-E-001.yaml ← 엔터테크 컬렉션 (공연·테마파크·게임·팬덤). id는 BT-E-, 화면은 #/entertech
app/                       ← 대시보드 (Vite + React + TS)
```

## 실행

```bash
cd app
npm install
npm run dev            # 워크벤치 — YAML을 읽고 쓰며, 파일이 바뀌면 자동 갱신
npm run validate       # 모든 사례 검증 (오류 있으면 exit 1)
npm run verify         # 학술 출판 자동 검증 (Crossref·DOI·PDF·Figure). 특정 사례만: npm run verify -- BT-A-005
npm test               # 단위 테스트
npm run build:public   # 공개 아카이브 → app/dist-public ('게시됨' 러브레터만)
```

`BTA_DATA_DIR=다른/폴더 npm run dev` 로 다른 데이터 폴더를 띄울 수 있다(미리보기·테스트용).

## 작업 흐름

| 단계 | 하는 일 | 다음 단계로 가는 조건 |
|---|---|---|
| 발견 | Claude가 후보 추가 (ARCHIVE → 후보 표로 공유) | — |
| 출처 확인 중 | 검증표 4행 채우기, 링크 직접 열어보기 | 작품 정체 + 입력·출력 '확인' |
| 검증 완료 | 아카이브에 산입 | — |
| 원고 작성 | CAROUSEL 탭에서 6장 + 캡션 작성, 미리보기 | — |
| 게시 준비 | EXPORT 탭에서 지침 8절 형식 마크다운 복사 | 번호·캡션·6장·WHAT IF·자체 점검 완료 |
| 게시됨 | 공개 아카이브에 실림 | — |

사례 화면 탭은 URL로 열 수 있다: `#/case/BT-A-001/record`, `/carousel`, `/export`.

## 학술 출판 자동 검증 (`app/server/verify.ts`, 판정 로직 `app/src/lib/scholar.ts`)

사례 화면 **기록** 탭 맨 위 "출판 검증" 패널 또는 `npm run verify`. 사람이 링크를 열지 않아도 판정과 근거가 한 화면에 나온다.

1. **DOI 찾기**: 기록의 링크 → 공식 출처 페이지 본문 → Crossref 제목·저자 검색 (저자가 1명 이상 겹쳐야 채택)
2. **Crossref 대조**: 출판사가 직접 등록한 제목·저자·게재처·라이선스를 기록과 비교. 작품명이 논문 제목과 달라도 PDF 본문에 여러 번 나오면 "논문 안에서 소개된 작품"으로 본다
3. **DOI 연결**: doi.org → 출판사 페이지. ACM DL은 자동 접속을 Cloudflare로 막으므로 경고만 하고, 게재 판정은 DOI 기록으로 한다
4. **PDF**: 직접 올린 PDF → 공식 출처 페이지의 PDF 링크 → Crossref 링크 → Semantic Scholar → arXiv(저자 일치 필수). 첫 쪽 제목·본문 DOI로 같은 논문인지 확인
5. **원문 근거**: 기술·인터랙션 문장을 페이지 번호와 함께 인용 (`PDF p.N` 링크)
6. **Figure**: PDF 속 사진을 캡션과 짝지어 `data/figures/<id>/fig-N.jpg`로 저장. 고르면 캐러셀 02·03장에 원본 비율 그대로 들어간다 (CC BY-NC-ND 등 라이선스 조건 표시)

판정: `학술 게재 확인` / `게재 정보 일부만 확인` / `다른 논문으로 보임` / `학술 출판 기록 없음`.
"검증 결과 기록에 반영"을 누르면 검증표·공식 출처(DOI)·누락 저자·이미지가 초안에 들어가고, **저장**을 눌러야 YAML에 쓰인다.
ACM 등에서 PDF를 자동으로 못 받으면 브라우저에서 받아 "PDF 직접 올리기"로 넣는다 (`data/verification/uploads/`).

결과 파일: `data/verification/<id>.json`, `data/figures/<id>/` (PDF 사본·Figure).

## 자동 검증 규칙 (`app/src/lib/validate.ts`)

| 수준 | 규칙 |
|---|---|
| ERR | 공식 출처 없음·SNS 출처 · 근거 링크 없이 '확인' · 검증 부족인데 검증 완료 이후 단계(= **검증 부족 — 게시 보류**) · 기술 미확인인데 MECHANISM 기재 · 보류/제외 사례 진행 · 게시 번호 중복 · '허용 확인됨'인데 근거 없음 · 게시 준비 시 번호·캡션·원고·WHAT IF·수동 점검 누락 |
| WARN | 링크를 열어보지 않은 '확인' · 표지 10~25자 밖 · 슬라이드 4문장 초과 · "혁신적" 같은 근거 없는 칭찬 · WHY에 검증 안 된 수치 · 같은 농담 소재 반복 · 해시태그/DB 태그 3~5개 밖 · 재게시 허용 자료 없음(텍스트 캐러셀만) · AI 결합 근거 없음 · 같은 제목 |
| INFO | 확장 사례 (non-tangible) 표기 · 보류/제외 미산입 |

분류 체계는 `app/src/lib/schema.ts`의 `TAXONOMY`, 6장 구조와 마크다운 형식은 `app/src/lib/carousel.ts`.
