# cc-alchemy-statusline

[![npm downloads](https://img.shields.io/npm/dm/cc-alchemy-statusline.svg?style=flat-square)](https://www.npmjs.com/package/cc-alchemy-statusline)
[![npm version](https://img.shields.io/npm/v/cc-alchemy-statusline.svg?style=flat-square)](https://www.npmjs.com/package/cc-alchemy-statusline)

Claude Code statusline — 구독 사용량, Git 브랜치, 컨텍스트 윈도우, 마지막 프롬프트를 표시합니다.

![preview](./preview.svg)

### 📊 [npm 다운로드 트렌드 →](https://npmtrends.com/cc-alchemy-statusline)

### 실제 출력 예시

```
┌─────────────────────────────────────────────────────────────────┐
│ Opus 4.6 (1M) │ main │ 42k/1M │ 5h 2% (3h51m) │ Tasks 3/5   │
│ ▸ 14:32 이거 깃헙 프로젝트에 npm 설치 수 그래프 보여지게 수정…  │
└─────────────────────────────────────────────────────────────────┘
```

- **1번째 줄** — 모델, 브랜치, 컨텍스트, 사용률, 작업 진행률
- **2번째 줄** — `▸ HH:MM` 타임스탬프 + 마지막 프롬프트 (넘치면 잘림)

## 기능

- **모델명** — 현재 사용 중인 Claude 모델 (예: `Opus 4.6 (1M)`)
- **Git 브랜치** — 현재 브랜치 (dirty면 `*` 표시, 클릭하면 GitHub 이동)
- **컨텍스트** — 사용량/전체 (예: `42k/1M`)
- **5h / 7d** — 구독 사용률 및 리셋까지 남은 시간
- **작업 진행률** — TodoWrite 완료 현황 (예: `Tasks 3/5`)
- **마지막 프롬프트** — `▸ HH:MM` 마지막으로 입력한 메시지, 2번째 줄에 표시
- **컬러 코드** — 사용률에 따라 초록/노랑/빨강 자동 변경
- **제로 의존성** — 순수 Node.js stdlib, npm 패키지 불필요

## 설치

아무 PC에서나 아래 명령어 한 줄이면 자동 설정됩니다.

```bash
npx -y cc-alchemy-statusline
```

Claude Code를 재시작하면 바로 적용됩니다.

## 요구사항

- Node.js 18+
- Claude Code CLI (로그인 상태)

## 지원 플랫폼

- macOS
- Linux
- Windows
