# CLAUDE.md

## Release

- main 브랜치에 push하면 GitHub Actions가 자동으로 `npm publish` 실행
- 커밋 & 푸시 전에 반드시 `package.json`의 `version`을 올렸는지 확인할 것
- 버전을 안 올리면 npm publish가 실패함 (동일 버전 재배포 불가)
