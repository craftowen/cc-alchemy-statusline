# Release

커밋, 버전 bump, 푸시, npm 배포 검증까지 한번에 수행한다.

## 절차

1. `git status`와 `git diff`로 변경 사항 확인
2. 변경 사항이 없으면 중단
3. 변경 내용을 분석하여 커밋 메시지 작성
4. `package.json`의 현재 `version`을 확인하고 patch 버전을 +1 올린다
5. 변경된 파일 + package.json을 스테이징하고 커밋
6. `git push`
7. GitHub Actions 실행 상태를 확인하여 npm publish 성공 여부를 검증
8. 최종 결과를 사용자에게 보고 (버전, 커밋 해시, 배포 상태)

## 규칙

- 커밋 메시지는 영어, 소문자 시작, 간결하게
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` 포함
- Actions가 실패하면 로그를 확인하고 원인을 보고
- .env 등 민감 파일은 절대 커밋하지 않는다
