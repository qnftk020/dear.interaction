# dear.interaction 대시보드 (임시, 읽기 전용)

`main` 브랜치와 별개인 GitHub Pages 전용 브랜치입니다.

- 데이터는 `data.enc.json` 하나에 들어 있고 PIN으로 암호화돼 있습니다 (PBKDF2-SHA256 600,000회 → AES-GCM). PIN은 코드에 없습니다.
- 원본 수정은 로컬 워크벤치(`bits-to-atoms/app`에서 `npm run dev`)에서 합니다. 이 페이지에서 카드뉴스 글씨를 고치거나 `업로드 완료`를 누른 내용은 그 브라우저에만 저장되며(`detail.js`), `수정본 복사`·`완료 목록 복사`로 넘겨 원본에 반영합니다.
- 검증 실행 폴더 없이 고칠 때: `DASH_PIN=… APP=<main 체크아웃>/bits-to-atoms/app OUT=. COMMIT=<sha> node _tools/update.ts` (기존 스냅샷을 풀어 YAML 칸과 2026 리서치만 갱신)
- 처음부터 다시 만들기: `DASH_PIN=… APP=<main 체크아웃>/bits-to-atoms/app VERIFY=<검증 결과 폴더> OUT=. COMMIT=<sha> node _tools/build.ts`
- 저장소가 공개라 YAML 원본은 GitHub에서 누구나 볼 수 있습니다. PIN은 이 페이지를 가리는 용도입니다.
