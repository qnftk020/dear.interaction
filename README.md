# dear.interaction 대시보드 (임시, 읽기 전용)

`main` 브랜치와 별개인 GitHub Pages 전용 브랜치입니다.

- 데이터는 `data.enc.json` 하나에 들어 있고 PIN으로 암호화돼 있습니다 (PBKDF2-SHA256 600,000회 → AES-GCM). PIN은 코드에 없습니다.
- 수정은 로컬 워크벤치(`bits-to-atoms/app`에서 `npm run dev`)에서 하고, 이 페이지는 스냅샷만 보여 줍니다.
- 다시 만들기: `DASH_PIN=… APP=<main 체크아웃>/bits-to-atoms/app VERIFY=<검증 결과 폴더> OUT=. COMMIT=<sha> node _tools/build.ts`
- 저장소가 공개라 YAML 원본은 GitHub에서 누구나 볼 수 있습니다. PIN은 이 페이지를 가리는 용도입니다.
