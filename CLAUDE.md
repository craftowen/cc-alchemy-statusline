# CLAUDE.md

## Release

- main 브랜치에 push하면 GitHub Actions가 자동으로 `npm publish` 실행
- 커밋 & 푸시 전에 반드시 `package.json`의 `version`을 올렸는지 확인할 것
- 버전을 안 올리면 npm publish가 실패함 (동일 버전 재배포 불가)

## Statusline 출력 규칙

- **반드시 2줄 출력을 유지할 것** (절대 1줄로 합치지 말 것)
  - Line 1: metrics (모델, 브랜치, 컨텍스트, 사용량)
  - Line 2: `▸ HH:MM 마지막 프롬프트`
- 터미널이 좁아도 1줄로 합치는 "해결책"은 금지. 각 줄을 truncate해서 2줄 형식을 유지해야 함
